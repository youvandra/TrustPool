// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {TrustPool} from "../src/TrustPool.sol";
import {MockToken} from "../src/mocks/MockToken.sol";
import {MockSwapAdapter} from "../src/mocks/MockSwapAdapter.sol";

contract TrustPoolTest is Test {
    TrustPool pool;
    MockSwapAdapter dex;
    MockToken chog;

    address admin = makeAddr("admin");
    address treasury = makeAddr("treasury");
    address caller = makeAddr("caller");
    address stranger = makeAddr("stranger");

    function setUp() public {
        dex = new MockSwapAdapter();
        vm.deal(address(dex), 1_000_000 ether);
        pool = new TrustPool(admin, treasury, dex);
        chog = new MockToken("Chog", "CHOG", 0);
        dex.setPrice(address(chog), 0.002 ether);
        vm.prank(admin);
        pool.setAllowed(address(chog), true);
        vm.deal(caller, 1_000 ether);
        vm.prank(caller);
        pool.postBond{value: 10 ether}();
    }

    function _open(uint256 mon) internal returns (uint256 id) {
        vm.prank(caller);
        id = pool.openCall{value: mon}(address(chog), 3 days, 12 hours, 0, "CHOG holds above launch range");
    }

    function test_openLocksPositionAtFillPrice() public {
        uint256 id = _open(100 ether);
        TrustPool.Call memory c = pool.getCall(id);
        assertEq(c.tokens, 50_000 ether);
        assertEq(chog.balanceOf(address(pool)), 50_000 ether);
        assertEq(uint8(c.state), uint8(TrustPool.State.Locked));
        (,,, uint32 open,,,) = pool.records(caller);
        assertEq(open, 1);
    }

    function test_openNeedsBond() public {
        vm.deal(stranger, 100 ether);
        vm.prank(stranger);
        vm.expectRevert(TrustPool.BondTooSmall.selector);
        pool.openCall{value: 1 ether}(address(chog), 3 days, 12 hours, 0, "");
    }

    function test_openNeedsAllowedToken() public {
        MockToken other = new MockToken("X", "X", 0);
        vm.prank(caller);
        vm.expectRevert(TrustPool.TokenNotAllowed.selector);
        pool.openCall{value: 1 ether}(address(other), 3 days, 12 hours, 0, "");
    }

    function test_feeOnTransferRecordsReceived() public {
        MockToken taxed = new MockToken("Tax", "TAX", 500);
        dex.setPrice(address(taxed), 1 ether);
        vm.prank(admin);
        pool.setAllowed(address(taxed), true);
        vm.prank(caller);
        uint256 id = pool.openCall{value: 10 ether}(address(taxed), 3 days, 12 hours, 0, "");
        // 5% burns in transit; the call records the 9.5 that arrived
        assertEq(pool.getCall(id).tokens, 9.5 ether);
    }

    function test_exitWaitsForLockAndNotice() public {
        uint256 id = _open(100 ether);
        vm.prank(caller);
        pool.announceExit(id);
        // lock (3 days) is longer than notice (12h), so exit opens at unlock
        assertEq(pool.getCall(id).exitAt, pool.getCall(id).unlockAt);
        vm.warp(block.timestamp + 3 days - 1);
        vm.prank(caller);
        vm.expectRevert(TrustPool.TooEarly.selector);
        pool.executeExit(id, 0);
    }

    function test_lateAnnouncementStillGivesFullNotice() public {
        uint256 id = _open(100 ether);
        vm.warp(block.timestamp + 10 days);
        vm.prank(caller);
        pool.announceExit(id);
        assertEq(pool.getCall(id).exitAt, block.timestamp + 12 hours);
    }

    function test_settleRecordsGain() public {
        uint256 id = _open(100 ether);
        vm.prank(caller);
        pool.announceExit(id);
        vm.warp(block.timestamp + 3 days);
        dex.setPrice(address(chog), 0.0026 ether); // +30%
        uint256 before = caller.balance;
        vm.prank(caller);
        pool.executeExit(id, 0);
        assertEq(caller.balance - before, 130 ether);
        (uint32 settled, uint32 losses,, uint32 open,, int256 sum,) = pool.records(caller);
        assertEq(settled, 1);
        assertEq(losses, 0);
        assertEq(open, 0);
        assertEq(sum, 3000);
    }

    function test_settleRecordsLoss() public {
        uint256 id = _open(100 ether);
        vm.prank(caller);
        pool.announceExit(id);
        vm.warp(block.timestamp + 3 days);
        dex.setPrice(address(chog), 0.0014 ether); // -30%
        vm.prank(caller);
        pool.executeExit(id, 0);
        (, uint32 losses,,,, int256 sum,) = pool.records(caller);
        assertEq(losses, 1);
        assertEq(sum, -3000);
    }

    function test_onlyCallerExits() public {
        uint256 id = _open(100 ether);
        vm.prank(stranger);
        vm.expectRevert(TrustPool.NotCaller.selector);
        pool.announceExit(id);
    }

    function test_releaseCountsAsTotalLoss() public {
        uint256 id = _open(100 ether);
        vm.prank(caller);
        pool.announceExit(id);
        vm.warp(block.timestamp + 3 days);
        dex.setFrozen(address(chog), true);
        vm.prank(caller);
        vm.expectRevert();
        pool.executeExit(id, 0);

        vm.prank(caller);
        vm.expectRevert(TrustPool.TooEarly.selector);
        pool.releaseTokens(id);

        vm.warp(block.timestamp + 6 hours);
        vm.prank(caller);
        pool.releaseTokens(id);
        assertEq(chog.balanceOf(caller), 50_000 ether);
        (,, uint32 released,,, int256 sum,) = pool.records(caller);
        assertEq(released, 1);
        assertEq(sum, -10_000);
    }

    function test_bondLockedWhileCallsOpen() public {
        _open(100 ether);
        vm.prank(caller);
        vm.expectRevert(TrustPool.OpenCalls.selector);
        pool.requestBondWithdraw();
    }

    function test_bondWithdrawAfterCooldown() public {
        vm.prank(caller);
        pool.requestBondWithdraw();
        vm.warp(block.timestamp + 7 days);
        uint256 before = caller.balance;
        vm.prank(caller);
        pool.withdrawBond();
        assertEq(caller.balance - before, 10 ether);
    }

    function test_slashMovesBondToTreasury() public {
        vm.prank(admin);
        pool.slash(caller, 4 ether, "bought from a funded wallet before the call");
        (uint256 amount,) = pool.bonds(caller);
        assertEq(amount, 6 ether);
        assertEq(treasury.balance, 4 ether);
    }

    function test_strangerCannotSlash() public {
        vm.prank(stranger);
        vm.expectRevert(TrustPool.NotAdmin.selector);
        pool.slash(caller, 1 ether, "");
    }
}
