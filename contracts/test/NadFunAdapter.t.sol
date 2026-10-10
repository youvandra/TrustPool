// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {TrustPool} from "../src/TrustPool.sol";
import {NadFunAdapter} from "../src/adapters/NadFunAdapter.sol";
import {INadFunLens} from "../src/interfaces/INadFun.sol";
import {MockToken} from "../src/mocks/MockToken.sol";
import {MockNadFunLens, MockNadFunRouter} from "../src/mocks/MockNadFun.sol";

contract NadFunAdapterTest is Test {
    TrustPool pool;
    NadFunAdapter adapter;
    MockNadFunRouter curve;
    MockNadFunRouter dex;
    MockNadFunLens lens;
    MockToken chog;

    address admin = makeAddr("admin");
    address caller = makeAddr("caller");

    function setUp() public {
        curve = new MockNadFunRouter();
        dex = new MockNadFunRouter();
        lens = new MockNadFunLens(curve, dex);
        adapter = new NadFunAdapter(INadFunLens(address(lens)), address(curve), address(dex));
        pool = new TrustPool(admin, admin, adapter);
        chog = new MockToken("Chog", "CHOG", 0);
        curve.setPrice(address(chog), 0.002 ether);
        dex.setPrice(address(chog), 0.003 ether);
        vm.deal(address(curve), 1_000 ether);
        vm.deal(address(dex), 1_000 ether);
        vm.prank(admin);
        pool.setAllowed(address(chog), true);
        vm.deal(caller, 1_000 ether);
        vm.prank(caller);
        pool.postBond{value: 10 ether}();
    }

    function _open(uint256 mon, uint256 minOut) internal returns (uint256 id) {
        vm.prank(caller);
        id = pool.openCall{value: mon}(address(chog), 1 days, 6 hours, minOut, "nad.fun");
    }

    function _exit(uint256 id, uint256 minOut) internal {
        vm.prank(caller);
        pool.announceExit(id);
        vm.warp(block.timestamp + 1 days);
        vm.prank(caller);
        pool.executeExit(id, minOut);
    }

    function test_buysOnCurveBeforeGraduation() public {
        uint256 quoted = adapter.quoteBuy(address(chog), 100 ether);
        uint256 id = _open(100 ether, quoted);
        assertEq(pool.getCall(id).tokens, 50_000 ether);
        assertEq(quoted, 50_000 ether);
    }

    function test_opensOnCurveSettlesOnDexAfterGraduation() public {
        uint256 id = _open(100 ether, 0);
        lens.graduate(address(chog));
        uint256 quoted = adapter.quoteSell(address(chog), pool.getCall(id).tokens);
        assertEq(quoted, 150 ether);
        _exit(id, quoted);
        assertEq(pool.getCall(id).monOut, 150 ether);
        assertEq(pool.recordOf(caller).sumReturnBps, 5000);
        assertEq(chog.balanceOf(address(adapter)), 0);
    }

    function test_slippageReverts() public {
        vm.prank(caller);
        vm.expectRevert(MockNadFunRouter.Slippage.selector);
        pool.openCall{value: 100 ether}(address(chog), 1 days, 6 hours, 50_001 ether, "");
    }

    function test_refusesARouterItWasNotBuiltWith() public {
        lens.setOverride(makeAddr("elsewhere"));
        vm.prank(caller);
        vm.expectRevert(abi.encodeWithSelector(NadFunAdapter.UnknownRouter.selector, makeAddr("elsewhere")));
        pool.openCall{value: 1 ether}(address(chog), 1 days, 6 hours, 0, "");
    }

    function test_rejectsZeroAddresses() public {
        vm.expectRevert(NadFunAdapter.ZeroAddress.selector);
        new NadFunAdapter(INadFunLens(address(0)), address(curve), address(dex));
    }
}
