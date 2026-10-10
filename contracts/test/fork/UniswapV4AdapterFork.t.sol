// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {TrustPool} from "../../src/TrustPool.sol";
import {UniswapV4Adapter} from "../../src/adapters/UniswapV4Adapter.sol";
import {IPoolManager, IStateView} from "../../src/interfaces/IUniswapV4.sol";
import {MockToken} from "../../src/mocks/MockToken.sol";
import {V4PoolSeeder} from "../../src/v4/V4PoolSeeder.sol";

/// @notice Runs the v4 adapter against the real Uniswap v4 PoolManager on a Monad fork: seeds a
/// fresh (MON, token) pool the way script/DeployV4.s.sol does, then takes a call through it.
/// Skipped unless FORK_RPC_URL is set:
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
    MockToken token;
    address caller = makeAddr("caller");

    function setUp() public {
        string memory rpc = vm.envOr("FORK_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        IPoolManager manager = IPoolManager(vm.envOr("V4_POOL_MANAGER", TESTNET_MANAGER));
        IStateView stateView = IStateView(vm.envOr("V4_STATE_VIEW", TESTNET_STATE_VIEW));

        token = new MockToken("Fork Chog", "fCHOG", 0);
        adapter = new UniswapV4Adapter(manager, stateView, 3000, 60);
        V4PoolSeeder seeder = new V4PoolSeeder(manager);
        token.mint(address(this), 10_000_000 ether);
        token.approve(address(seeder), type(uint256).max);
        vm.deal(address(this), 100 ether);
        seeder.seed{value: 10 ether}(adapter.poolKey(address(token)), SQRT_500, 10_000_000 ether);

        pool = new TrustPool(address(this), address(this), adapter);
        pool.setAllowed(address(token), true);
        vm.deal(caller, 100 ether);
        vm.prank(caller);
        pool.postBond{value: 10 ether}();
    }

    receive() external payable {}

    function test_fork_quotesMatchFills() public {
        vm.skip(address(pool) == address(0));
        uint256 monIn = 0.5 ether;
        uint256 quoted = adapter.quoteBuy(address(token), monIn);
        // ~500 tokens per MON, less 0.3% fee and ~5% impact on a 10 MON pool
        assertApproxEqRel(quoted, 237 ether, 0.02e18);

        // The quote matches the pool to a few wei; the web sends it with 1% slippage.
        vm.prank(caller);
        uint256 id = pool.openCall{value: monIn}(address(token), 1 days, 6 hours, (quoted * 999) / 1000, "fork v4");
        assertApproxEqRel(pool.getCall(id).tokens, quoted, 1e9, "buy filled at the quote");

        uint256 sellQuote = adapter.quoteSell(address(token), quoted);
        vm.prank(caller);
        pool.announceExit(id);
        vm.warp(block.timestamp + 1 days);
        uint256 before = caller.balance;
        vm.prank(caller);
        pool.executeExit(id, (sellQuote * 999) / 1000);
        assertEq(uint8(pool.getCall(id).state), uint8(TrustPool.State.Settled));
        assertApproxEqRel(caller.balance - before, sellQuote, 1e9, "sell paid the quote");
        // a round trip pays the fee twice: a small, honest loss
        assertLt(sellQuote, monIn);
        assertGt(sellQuote, (monIn * 98) / 100);
    }

    function test_fork_slippageReverts() public {
        vm.skip(address(pool) == address(0));
        uint256 monIn = 0.5 ether;
        uint256 quoted = adapter.quoteBuy(address(token), monIn);
        vm.prank(caller);
        vm.expectRevert();
        pool.openCall{value: monIn}(address(token), 1 days, 6 hours, (quoted * 101) / 100, "too greedy");
    }
}
