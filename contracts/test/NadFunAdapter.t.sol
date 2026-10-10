// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SoloCall} from "./utils/SoloCall.sol";
import {TrustPool} from "../src/TrustPool.sol";
import {NadFunAdapter} from "../src/adapters/NadFunAdapter.sol";
import {INadFunLens} from "../src/interfaces/INadFun.sol";
import {MockToken} from "../src/mocks/MockToken.sol";
import {MockNadFunLens, MockNadFunRouter} from "../src/mocks/MockNadFun.sol";

contract NadFunAdapterTest is SoloCall {
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
        pool.postBond{value: 100 ether}();
        _smallPools(pool, admin);
    }

    function _open(uint256 mon, uint256 minOut) internal returns (uint256 id) {
        id = _soloBuy(pool, caller, address(chog), mon, minOut);
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
        assertEq(_soloSell(pool, caller, id), 150 ether);
        assertEq(pool.recordOf(caller).sumNetBps, 4985); // +50% less the 0.1% keeper reward
        assertEq(chog.balanceOf(address(adapter)), 0);
    }

    function test_slippageReverts() public {
        uint256 id = _soloOpen(pool, caller, address(chog), 100 ether);
        vm.prank(caller);
        vm.expectRevert(MockNadFunRouter.Slippage.selector);
        pool.buy(id, 50_001 ether);
    }

    function test_refusesARouterItWasNotBuiltWith() public {
        uint256 id = _soloOpen(pool, caller, address(chog), 1 ether);
        lens.setOverride(makeAddr("elsewhere"));
        vm.prank(caller);
        vm.expectRevert(abi.encodeWithSelector(NadFunAdapter.UnknownRouter.selector, makeAddr("elsewhere")));
        pool.buy(id, 0);
    }

    function test_rejectsZeroAddresses() public {
        vm.expectRevert(NadFunAdapter.ZeroAddress.selector);
        new NadFunAdapter(INadFunLens(address(0)), address(curve), address(dex));
    }
}
