// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {TrustPool} from "../../src/TrustPool.sol";
import {UniswapV4Adapter} from "../../src/adapters/UniswapV4Adapter.sol";
import {IPoolManager, IStateView, V4} from "../../src/interfaces/IUniswapV4.sol";
import {MockToken} from "../../src/mocks/MockToken.sol";
import {V4PoolSeeder} from "../../src/v4/V4PoolSeeder.sol";

/// @notice Runs a pooled call through the real Uniswap v4 PoolManager on a Monad fork: seeds a
/// fresh (MON, token) pool the way script/DeployV4.s.sol does, then a caller and a joiner pool
/// MON, buy together and are sold out together. Skipped unless FORK_RPC_URL is set:
///
///   FORK_RPC_URL=https://testnet-rpc.monad.xyz forge test --match-path 'test/fork/UniswapV4*' -vv
///
/// Defaults are the Monad testnet v4 addresses; override with V4_POOL_MANAGER / V4_STATE_VIEW.
contract UniswapV4AdapterForkTest is Test {
    address constant TESTNET_MANAGER = 0x451D64ab3b650040d2aE1886602b97ed6eDc643d;
    address constant TESTNET_STATE_VIEW = 0xB639209539c61BaF67AC04876315786F8D0b153c;
    uint160 constant SQRT_500 = 1771595571142957102961017161607; // 500 tokens per MON

    TrustPool pool;
    UniswapV4Adapter adapter;
    V4PoolSeeder seeder;
    MockToken token;
    address caller = makeAddr("caller");
    address joiner = makeAddr("joiner");
    address keeper = makeAddr("keeper");

    function setUp() public {
        string memory rpc = vm.envOr("FORK_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        IPoolManager manager = IPoolManager(vm.envOr("V4_POOL_MANAGER", TESTNET_MANAGER));
        IStateView stateView = IStateView(vm.envOr("V4_STATE_VIEW", TESTNET_STATE_VIEW));

        token = new MockToken("Fork Chog", "fCHOG", 0);
        adapter = new UniswapV4Adapter(manager, stateView, 3000, 60);
        seeder = new V4PoolSeeder(manager);
        token.mint(address(this), 100_000_000 ether);
        token.approve(address(seeder), type(uint256).max);
        vm.deal(address(this), 100 ether);
        seeder.seed{value: 10 ether}(adapter.poolKey(address(token)), SQRT_500, 10_000_000 ether);

        pool = new TrustPool(address(this), address(this), adapter);
        pool.setAllowed(address(token), true);
        TrustPool.Params memory p = pool.params();
        p.minPool = 0.05 ether;
        p.minBond = 0.5 ether;
        pool.setParams(p);
        vm.deal(caller, 100 ether);
        vm.deal(joiner, 100 ether);
        vm.prank(caller);
        pool.postBond{value: 1 ether}();
    }

    receive() external payable {}

    function _open(uint256 stake) internal returns (uint256 id) {
        TrustPool.Params memory p = pool.params();
        vm.prank(caller);
        id = pool.openCall{value: stake}(address(token), p.minWindow, 0, p.maxStopLossBps, p.minHold, 0, "fork v4");
    }

    function test_fork_impactCapMatchesTheLimit() public {
        vm.skip(address(pool) == address(0));
        uint256 id = _open(0.02 ether);
        uint256 cap = pool.capOf(id);
        // 2% average-price impact on 10 MON of full-range depth is about 0.2 MON
        assertApproxEqRel(cap, 0.204 ether, 0.03e18);
        vm.prank(joiner);
        vm.expectRevert(TrustPool.ImpactTooHigh.selector);
        pool.deposit{value: cap - 0.02 ether + 0.001 ether}(id);
    }

    function test_fork_pooledBuyAndSell() public {
        vm.skip(address(pool) == address(0));
        uint256 id = _open(0.02 ether);
        vm.prank(joiner);
        pool.deposit{value: 0.13 ether}(id);
        uint256 total = 0.15 ether;

        uint256 quoted = adapter.quoteBuy(address(token), total);
        vm.warp(pool.getCall(id).rules.windowEnd);
        vm.prank(caller);
        pool.buy(id, (quoted * 999) / 1000);
        assertApproxEqRel(pool.getCall(id).tokens, quoted, 1e9, "buy filled at the quote");

        // someone else buys after the pool: the shared exit reflects it
        vm.deal(address(this), 10 ether);
        adapter.buy{value: 1 ether}(address(token), 0, address(this));

        TrustPool.Call memory h = pool.getCall(id);
        vm.startPrank(keeper);
        vm.warp(uint256(h.holdUntil) - h.rules.checkpointGap);
        pool.checkpoint(id);
        vm.warp(h.holdUntil);
        pool.checkpoint(id);
        uint256 sellQuote = pool.getCall(id).last.value;
        pool.sell(id);
        vm.stopPrank();
        TrustPool.Call memory c = pool.getCall(id);
        assertEq(uint8(c.state), uint8(TrustPool.State.Settled));
        assertApproxEqRel(c.gross, sellQuote, 1e9, "sell paid the checkpoint quote");
        assertGt(c.netReturnBps, 0);

        uint256 before = joiner.balance;
        vm.prank(joiner);
        pool.claim(id);
        vm.prank(caller);
        pool.claim(id);
        assertApproxEqAbs(joiner.balance - before, (uint256(c.payout) * 13) / 15, 1);
        assertEq(address(pool).balance, 1 ether, "only the bond is left");
    }

    function test_fork_addDeepensAPool() public {
        vm.skip(address(pool) == address(0));
        uint256 id = _open(0.02 ether);
        uint256 capBefore = pool.capOf(id);
        (uint160 sqrtP,,,) = adapter.stateView().getSlot0(V4.id(adapter.poolKey(address(token))));
        seeder.add{value: 10 ether}(adapter.poolKey(address(token)), sqrtP, type(uint256).max);
        assertApproxEqRel(pool.capOf(id), capBefore * 2, 0.05e18, "twice the depth, twice the cap");
    }
}
