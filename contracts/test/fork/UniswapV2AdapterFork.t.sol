// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SoloCall} from "../utils/SoloCall.sol";
import {TrustPool} from "../../src/TrustPool.sol";
import {UniswapV2Adapter} from "../../src/adapters/UniswapV2Adapter.sol";
import {IUniswapV2Router02} from "../../src/interfaces/IUniswapV2Router02.sol";

/// @notice Runs the adapter against the real router on a Monad fork. Skipped unless
/// FORK_RPC_URL is set:
///
///   FORK_RPC_URL=$MONAD_TESTNET_RPC V2_ROUTER=0x... FORK_TOKEN=0x... forge test --match-path 'test/fork/*'
///
/// FORK_TOKEN needs a direct WMON pair on that router with real liquidity.
contract UniswapV2AdapterForkTest is SoloCall {
    TrustPool pool;
    UniswapV2Adapter adapter;
    address token;
    address caller = makeAddr("caller");

    function setUp() public {
        string memory rpc = vm.envOr("FORK_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        token = vm.envAddress("FORK_TOKEN");
        adapter = new UniswapV2Adapter(IUniswapV2Router02(vm.envAddress("V2_ROUTER")));
        pool = new TrustPool(address(this), address(this), adapter);
        pool.setAllowed(token, true);
        vm.deal(caller, 100 ether);
        vm.prank(caller);
        pool.postBond{value: 10 ether}();
        _smallPools(pool, address(this));
    }

    function test_fork_openAndSettle() public {
        vm.skip(address(pool) == address(0));
        uint256 monIn = 0.1 ether;
        uint256 minOut = (adapter.quoteBuy(token, monIn) * 95) / 100;
        uint256 id = _soloBuy(pool, caller, token, monIn, minOut);
        assertGe(pool.getCall(id).tokens, minOut);
        assertGt(_soloSell(pool, caller, id), 0);
        assertEq(uint8(pool.getCall(id).state), uint8(TrustPool.State.Settled));
    }
}
