// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {TrustPool} from "../src/TrustPool.sol";
import {ISwapAdapter} from "../src/interfaces/ISwapAdapter.sol";
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

    // ------------------------------------------------------------ helpers

    function _open(uint256 mon) internal returns (uint256 id) {
        vm.prank(caller);
        id = pool.openCall{value: mon}(address(chog), 3 days, 12 hours, 0, "CHOG holds above launch range");
    }

    function _openAndAnnounce(uint256 mon) internal returns (uint256 id) {
        id = _open(mon);
        vm.prank(caller);
        pool.announceExit(id);
    }

    function _record() internal view returns (TrustPool.Record memory) {
        return pool.recordOf(caller);
    }

    // ------------------------------------------------------------ open

    function test_openLocksPositionAtFillPrice() public {
        uint256 id = _open(100 ether);
        TrustPool.Call memory c = pool.getCall(id);
        assertEq(c.tokens, 50_000 ether);
        assertEq(c.monIn, 100 ether);
        assertEq(chog.balanceOf(address(pool)), 50_000 ether);
        assertEq(uint8(c.state), uint8(TrustPool.State.Locked));
        assertEq(address(c.adapter), address(dex));
        assertEq(c.releaseGrace, 6 hours);
        assertEq(c.maxHold, 30 days);
        assertEq(_record().open, 1);
        assertEq(pool.callsOf(caller).length, 1);
    }

    function test_openEmitsThesis() public {
        vm.expectEmit(true, true, true, true);
        emit TrustPool.CallOpened(
            0,
            caller,
            address(chog),
            100 ether,
            50_000 ether,
            uint64(block.timestamp + 3 days),
            12 hours,
            "CHOG holds above launch range"
        );
        _open(100 ether);
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

    function test_openChecksRules() public {
        vm.startPrank(caller);
        vm.expectRevert(TrustPool.ZeroValue.selector);
        pool.openCall(address(chog), 3 days, 12 hours, 0, "");
        vm.expectRevert(TrustPool.LockOutOfRange.selector);
        pool.openCall{value: 1 ether}(address(chog), 1 hours, 12 hours, 0, "");
        vm.expectRevert(TrustPool.LockOutOfRange.selector);
        pool.openCall{value: 1 ether}(address(chog), 31 days, 12 hours, 0, "");
        vm.expectRevert(TrustPool.NoticeTooShort.selector);
        pool.openCall{value: 1 ether}(address(chog), 3 days, 1 hours, 0, "");
        vm.expectRevert(TrustPool.ThesisTooLong.selector);
        pool.openCall{value: 1 ether}(address(chog), 3 days, 12 hours, 0, string(new bytes(281)));
        vm.stopPrank();
    }

    function test_openEnforcesMinOutAfterFee() public {
        MockToken taxed = new MockToken("Tax", "TAX", 500);
        dex.setPrice(address(taxed), 1 ether);
        vm.prank(admin);
        pool.setAllowed(address(taxed), true);
        // the adapter delivers 10, 9.5 arrive; asking for 9.6 must fail here, not at the adapter
        vm.prank(caller);
        vm.expectRevert(TrustPool.Slippage.selector);
        pool.openCall{value: 10 ether}(address(taxed), 3 days, 12 hours, 9.6 ether, "");
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

    function test_pauseStopsNewCallsOnly() public {
        uint256 id = _openAndAnnounce(100 ether);
        vm.prank(admin);
        pool.setOpenPaused(true);
        vm.prank(caller);
        vm.expectRevert(TrustPool.OpenPaused.selector);
        pool.openCall{value: 1 ether}(address(chog), 3 days, 12 hours, 0, "");
        vm.warp(block.timestamp + 3 days);
        vm.prank(caller);
        pool.executeExit(id, 0);
        assertEq(_record().settled, 1);
    }

    function test_unknownCallReverts() public {
        vm.expectRevert(TrustPool.UnknownCall.selector);
        pool.getCall(0);
        vm.prank(caller);
        vm.expectRevert(TrustPool.UnknownCall.selector);
        pool.announceExit(7);
    }

    // ------------------------------------------------------------ exit

    function test_exitWaitsForLockAndNotice() public {
        uint256 id = _openAndAnnounce(100 ether);
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
        assertEq(pool.getCall(id).announcedAt, block.timestamp);
    }

    function test_announceOnlyOnce() public {
        uint256 id = _openAndAnnounce(100 ether);
        vm.prank(caller);
        vm.expectRevert(TrustPool.WrongState.selector);
        pool.announceExit(id);
    }

    function test_executeNeedsAnnouncement() public {
        uint256 id = _open(100 ether);
        vm.warp(block.timestamp + 30 days);
        vm.prank(caller);
        vm.expectRevert(TrustPool.WrongState.selector);
        pool.executeExit(id, 0);
    }

    function test_settleRecordsGain() public {
        uint256 id = _openAndAnnounce(100 ether);
        vm.warp(block.timestamp + 3 days);
        dex.setPrice(address(chog), 0.0026 ether); // +30%
        uint256 before = caller.balance;
        vm.prank(caller);
        pool.executeExit(id, 0);
        assertEq(caller.balance - before, 130 ether);
        assertEq(pool.getCall(id).monOut, 130 ether);
        TrustPool.Record memory r = _record();
        assertEq(r.settled, 1);
        assertEq(r.losses, 0);
        assertEq(r.open, 0);
        assertEq(r.sumReturnBps, 3000);
    }

    function test_settleRecordsLoss() public {
        uint256 id = _openAndAnnounce(100 ether);
        vm.warp(block.timestamp + 3 days);
        dex.setPrice(address(chog), 0.0014 ether); // -30%
        vm.prank(caller);
        pool.executeExit(id, 0);
        TrustPool.Record memory r = _record();
        assertEq(r.losses, 1);
        assertEq(r.sumReturnBps, -3000);
    }

    function test_settleRecordsWhatArrivedNotWhatAdapterReports() public {
        uint256 id = _openAndAnnounce(100 ether);
        vm.warp(block.timestamp + 3 days);
        dex.setShort(1000); // adapter reports 100, pays 90
        vm.prank(caller);
        pool.executeExit(id, 0);
        assertEq(pool.getCall(id).monOut, 90 ether);
        assertEq(_record().sumReturnBps, -1000);
    }

    function test_settleEnforcesMinOutOnMeasuredFill() public {
        uint256 id = _openAndAnnounce(100 ether);
        vm.warp(block.timestamp + 3 days);
        dex.setShort(1000);
        vm.prank(caller);
        vm.expectRevert(TrustPool.Slippage.selector);
        pool.executeExit(id, 95 ether);
    }

    function test_onlyCallerExits() public {
        uint256 id = _open(100 ether);
        vm.prank(stranger);
        vm.expectRevert(TrustPool.NotCaller.selector);
        pool.announceExit(id);
        vm.prank(caller);
        pool.announceExit(id);
        vm.warp(block.timestamp + 3 days);
        vm.prank(stranger);
        vm.expectRevert(TrustPool.NotCaller.selector);
        pool.executeExit(id, 0);
    }

    function test_releaseCountsAsTotalLoss() public {
        uint256 id = _openAndAnnounce(100 ether);
        vm.warp(block.timestamp + 3 days);
        dex.setFrozen(address(chog), true);
        vm.prank(caller);
        vm.expectRevert(MockSwapAdapter.Frozen.selector);
        pool.executeExit(id, 0);

        vm.prank(caller);
        vm.expectRevert(TrustPool.TooEarly.selector);
        pool.releaseTokens(id);

        vm.warp(block.timestamp + 6 hours);
        vm.prank(caller);
        pool.releaseTokens(id);
        assertEq(chog.balanceOf(caller), 50_000 ether);
        TrustPool.Record memory r = _record();
        assertEq(r.released, 1);
        assertEq(r.losses, 1);
        assertEq(r.open, 0);
        assertEq(r.sumReturnBps, -10_000);
    }

    // ------------------------------------------------------------ admin has no path to a call

    function test_adminCannotRedirectAnOpenCall() public {
        uint256 id = _openAndAnnounce(100 ether);
        // a hostile adapter set after open must not see this call's tokens
        MockSwapAdapter hostile = new MockSwapAdapter();
        vm.prank(admin);
        pool.setAdapter(hostile);
        vm.warp(block.timestamp + 3 days);
        vm.prank(caller);
        pool.executeExit(id, 0);
        assertEq(chog.balanceOf(address(hostile)), 0);
        assertEq(chog.balanceOf(address(dex)), 50_000 ether);
    }

    function test_adminCannotDelayRelease() public {
        uint256 id = _openAndAnnounce(100 ether);
        vm.prank(admin);
        pool.setParams(_params(365 days, 365 days));
        dex.setFrozen(address(chog), true);
        vm.warp(block.timestamp + 3 days + 6 hours);
        vm.prank(caller);
        pool.releaseTokens(id);
        assertEq(_record().released, 1);
    }

    function test_callerCanMoveToCurrentAdapter() public {
        uint256 id = _openAndAnnounce(100 ether);
        MockSwapAdapter next = new MockSwapAdapter();
        vm.deal(address(next), 1_000 ether);
        next.setPrice(address(chog), 0.002 ether);
        vm.prank(admin);
        pool.setAdapter(next);

        vm.prank(stranger);
        vm.expectRevert(TrustPool.NotCaller.selector);
        pool.moveToCurrentAdapter(id);

        vm.prank(caller);
        pool.moveToCurrentAdapter(id);
        assertEq(address(pool.getCall(id).adapter), address(next));
        vm.warp(block.timestamp + 3 days);
        vm.prank(caller);
        pool.executeExit(id, 0);
        assertEq(chog.balanceOf(address(next)), 50_000 ether);
    }

    function test_directMonTransferRejected() public {
        vm.deal(stranger, 1 ether);
        vm.prank(stranger);
        (bool ok,) = address(pool).call{value: 1 ether}("");
        assertFalse(ok);
    }

    // ------------------------------------------------------------ stale

    function test_markStaleAfterMaxHoldWhileLocked() public {
        uint256 id = _open(100 ether);
        vm.warp(block.timestamp + 3 days + 30 days - 1);
        vm.prank(stranger);
        vm.expectRevert(TrustPool.TooEarly.selector);
        pool.markStale(id);

        vm.warp(block.timestamp + 1);
        vm.prank(stranger);
        pool.markStale(id);
        assertTrue(pool.getCall(id).stale);
        assertEq(_record().stale, 1);
        assertEq(_record().open, 1); // still open; stale does not close it

        vm.expectRevert(TrustPool.AlreadyStale.selector);
        pool.markStale(id);
    }

    function test_markStaleCountsFromExitAtWhenAnnounced() public {
        uint256 id = _openAndAnnounce(100 ether);
        uint256 exitAt = pool.getCall(id).exitAt;
        vm.warp(exitAt + 30 days - 1);
        vm.expectRevert(TrustPool.TooEarly.selector);
        pool.markStale(id);
        vm.warp(exitAt + 30 days);
        pool.markStale(id);
        assertEq(_record().stale, 1);
    }

    function test_staleCallCanStillSettle() public {
        uint256 id = _open(100 ether);
        vm.warp(block.timestamp + 33 days);
        pool.markStale(id);
        vm.prank(caller);
        pool.announceExit(id);
        vm.warp(block.timestamp + 12 hours);
        vm.prank(caller);
        pool.executeExit(id, 0);
        TrustPool.Record memory r = _record();
        assertEq(r.settled, 1);
        assertEq(r.stale, 1); // the mark stays on the record
    }

    function test_settledCallCannotBeMarkedStale() public {
        uint256 id = _openAndAnnounce(100 ether);
        vm.warp(block.timestamp + 3 days);
        vm.prank(caller);
        pool.executeExit(id, 0);
        vm.warp(block.timestamp + 365 days);
        vm.expectRevert(TrustPool.WrongState.selector);
        pool.markStale(id);
    }

    // ------------------------------------------------------------ bond

    function test_bondLockedWhileCallsOpen() public {
        _open(100 ether);
        vm.prank(caller);
        vm.expectRevert(TrustPool.OpenCalls.selector);
        pool.requestBondWithdraw();
    }

    function test_bondWithdrawAfterCooldown() public {
        vm.prank(caller);
        pool.requestBondWithdraw();
        vm.warp(block.timestamp + 7 days - 1);
        vm.prank(caller);
        vm.expectRevert(TrustPool.TooEarly.selector);
        pool.withdrawBond();
        vm.warp(block.timestamp + 1);
        uint256 before = caller.balance;
        vm.prank(caller);
        pool.withdrawBond();
        assertEq(caller.balance - before, 10 ether);
        (uint256 amount, uint64 readyAt) = pool.bonds(caller);
        assertEq(amount, 0);
        assertEq(readyAt, 0);
    }

    function test_openingCancelsPendingWithdrawal() public {
        vm.prank(caller);
        pool.requestBondWithdraw();
        _open(1 ether);
        (, uint64 readyAt) = pool.bonds(caller);
        assertEq(readyAt, 0);
    }

    function test_withdrawNeedsBondAndRequest() public {
        vm.prank(stranger);
        vm.expectRevert(TrustPool.NoBond.selector);
        pool.requestBondWithdraw();
        vm.prank(caller);
        vm.expectRevert(TrustPool.NoWithdrawal.selector);
        pool.withdrawBond();
    }

    // ------------------------------------------------------------ slash and admin

    function test_slashMovesBondToTreasury() public {
        vm.prank(admin);
        pool.slash(caller, 4 ether, "bought from a funded wallet before the call");
        (uint256 amount,) = pool.bonds(caller);
        assertEq(amount, 6 ether);
        assertEq(treasury.balance, 4 ether);
        assertEq(_record().slashes, 1);
    }

    function test_slashCapsAtBondAndNeedsReason() public {
        vm.startPrank(admin);
        vm.expectRevert(TrustPool.EmptyReason.selector);
        pool.slash(caller, 1 ether, "");
        pool.slash(caller, 100 ether, "reason");
        assertEq(treasury.balance, 10 ether);
        vm.expectRevert(TrustPool.ZeroValue.selector);
        pool.slash(caller, 1 ether, "nothing left");
        vm.stopPrank();
    }

    function test_strangerCannotAdmin() public {
        vm.startPrank(stranger);
        vm.expectRevert(TrustPool.NotAdmin.selector);
        pool.slash(caller, 1 ether, "x");
        vm.expectRevert(TrustPool.NotAdmin.selector);
        pool.setAllowed(address(chog), false);
        vm.expectRevert(TrustPool.NotAdmin.selector);
        pool.setAdapter(dex);
        vm.expectRevert(TrustPool.NotAdmin.selector);
        pool.setParams(_params(6 hours, 30 days));
        vm.expectRevert(TrustPool.NotAdmin.selector);
        pool.transferAdmin(stranger);
        vm.stopPrank();
    }

    function test_adminHandoverIsTwoStep() public {
        vm.prank(admin);
        pool.transferAdmin(stranger);
        assertEq(pool.admin(), admin);
        vm.prank(caller);
        vm.expectRevert(TrustPool.NotPendingAdmin.selector);
        pool.acceptAdmin();
        vm.prank(stranger);
        pool.acceptAdmin();
        assertEq(pool.admin(), stranger);
        assertEq(pool.pendingAdmin(), address(0));
    }

    function test_setParamsValidates() public {
        TrustPool.Params memory p = _params(6 hours, 30 days);
        p.minLock = 40 days; // above maxLock
        vm.prank(admin);
        vm.expectRevert(TrustPool.BadParams.selector);
        pool.setParams(p);
    }

    function test_constructorRejectsZero() public {
        vm.expectRevert(TrustPool.ZeroAddress.selector);
        new TrustPool(address(0), treasury, dex);
        vm.expectRevert(TrustPool.ZeroAddress.selector);
        new TrustPool(admin, treasury, ISwapAdapter(address(0)));
    }

    // ------------------------------------------------------------ fuzz

    /// The record's return always equals what the measured fill implies, for any size and price.
    function testFuzz_settleReturnMatchesFill(uint96 monIn, uint64 exitPrice) public {
        monIn = uint96(bound(monIn, 1e9, 500 ether));
        exitPrice = uint64(bound(exitPrice, 1e9, 1 ether));
        uint256 id = _openAndAnnounce(monIn);
        vm.warp(block.timestamp + 3 days);
        dex.setPrice(address(chog), exitPrice);
        vm.prank(caller);
        pool.executeExit(id, 0);

        TrustPool.Call memory c = pool.getCall(id);
        int256 expected = ((int256(uint256(c.monOut)) - int256(uint256(c.monIn))) * 10_000) / int256(uint256(c.monIn));
        assertEq(_record().sumReturnBps, expected);
        assertEq(_record().losses, expected < 0 ? 1 : 0);
        assertEq(chog.balanceOf(address(pool)), 0);
    }

    /// An exit never executes before both the lock and the full notice have passed.
    function testFuzz_exitNeverBeforeLockOrNotice(uint64 lock, uint32 notice, uint64 announceAfter) public {
        lock = uint64(bound(lock, 1 days, 30 days));
        notice = uint32(bound(notice, 6 hours, 14 days));
        announceAfter = uint64(bound(announceAfter, 0, 60 days));
        uint256 t0 = vm.getBlockTimestamp(); // via_ir may re-read block.timestamp after a warp
        vm.prank(caller);
        uint256 id = pool.openCall{value: 1 ether}(address(chog), lock, notice, 0, "");
        vm.warp(t0 + announceAfter);
        vm.prank(caller);
        pool.announceExit(id);
        uint64 exitAt = pool.getCall(id).exitAt;
        assertGe(exitAt, t0 + lock);
        assertGe(exitAt, t0 + announceAfter + notice);
        vm.warp(exitAt - 1);
        vm.prank(caller);
        vm.expectRevert(TrustPool.TooEarly.selector);
        pool.executeExit(id, 0);
    }

    function _params(uint32 grace, uint32 hold) internal pure returns (TrustPool.Params memory) {
        return TrustPool.Params({
            minBond: 10 ether,
            minLock: 1 days,
            maxLock: 30 days,
            minNotice: 6 hours,
            bondCooldown: 7 days,
            releaseGrace: grace,
            maxHold: hold
        });
    }
}
