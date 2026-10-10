// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {TrustPool} from "../../src/TrustPool.sol";
import {NadFunAdapter} from "../../src/adapters/NadFunAdapter.sol";
import {INadFunLens} from "../../src/interfaces/INadFun.sol";

/// @notice NadFunAdapter against the real nad.fun contracts on a fork. Skipped unless
/// NADFUN_FORK_RPC_URL is set. Defaults are the mainnet addresses from
/// github.com/Naddotfun/contract-v3-abi; override all three for testnet.
///
///   NADFUN_FORK_RPC_URL=$MONAD_RPC FORK_TOKEN=0x... forge test --match-path 'test/fork/NadFun*'
contract NadFunAdapterForkTest is Test {
    TrustPool pool;
    NadFunAdapter adapter;
    address token;
    address caller = makeAddr("caller");

    function setUp() public {
        string memory rpc = vm.envOr("NADFUN_FORK_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        token = vm.envAddress("FORK_TOKEN");
        adapter = new NadFunAdapter(
            INadFunLens(vm.envOr("NADFUN_LENS", address(0x7e78A8DE94f21804F7a17F4E8BF9EC2c872187ea))),
            vm.envOr("NADFUN_CURVE_ROUTER", address(0x6F6B8F1a20703309951a5127c45B49b1CD981A22)),
            vm.envOr("NADFUN_DEX_ROUTER", address(0x0B79d71AE99528D1dB24A4148b5f4F865cc2b137))
        );
        pool = new TrustPool(address(this), address(this), adapter);
        pool.setAllowed(token, true);
        vm.deal(caller, 100 ether);
        vm.prank(caller);
        pool.postBond{value: 10 ether}();
    }

    function test_fork_openAndSettle() public {
        vm.skip(address(pool) == address(0));
        uint256 monIn = 1 ether;
        uint256 minOut = (adapter.quoteBuy(token, monIn) * 95) / 100;
        vm.prank(caller);
        uint256 id = pool.openCall{value: monIn}(token, 1 days, 6 hours, minOut, "fork");
        assertGe(pool.getCall(id).tokens, minOut);

        vm.prank(caller);
        pool.announceExit(id);
        vm.warp(block.timestamp + 1 days);
        uint256 quote = adapter.quoteSell(token, pool.getCall(id).tokens);
        vm.prank(caller);
        pool.executeExit(id, (quote * 95) / 100);
        assertGt(pool.getCall(id).monOut, 0);
    }
}
