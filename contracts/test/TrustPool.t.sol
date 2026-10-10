// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {TrustPool} from "../src/TrustPool.sol";
import {ISwapAdapter} from "../src/interfaces/ISwapAdapter.sol";
import {MockToken} from "../src/mocks/MockToken.sol";
import {MockSwapAdapter} from "../src/mocks/MockSwapAdapter.sol";

/// @notice Constant-product DEX with virtual reserves, so a buy moves the price.
contract CurveAdapter is ISwapAdapter {
    uint256 public monReserve;
    uint256 public tokenReserve;

    constructor(uint256 mon, uint256 tokens) {
        monReserve = mon;
        tokenReserve = tokens;
    }

    receive() external payable {}

    function setReserves(uint256 mon, uint256 tokens) external {
        monReserve = mon;
        tokenReserve = tokens;
    }

    function buy(address token, uint256 minOut, address to) external payable returns (uint256 out) {
        out = _out(msg.value, monReserve, tokenReserve);
        require(out >= minOut, "slippage");
        monReserve += msg.value;
        tokenReserve -= out;
        MockToken(token).mint(to, out);
    }

    function sell(address, uint256 amountIn, uint256 minOut, address to) external returns (uint256 out) {
        out = _out(amountIn, tokenReserve, monReserve);
        require(out >= minOut, "slippage");
        tokenReserve += amountIn;
        monReserve -= out;
        (bool ok,) = to.call{value: out}("");
        require(ok);
    }

    function quoteBuy(address, uint256 monIn) external view returns (uint256) {
        return _out(monIn, monReserve, tokenReserve);
    }

    function quoteSell(address, uint256 amountIn) external view returns (uint256) {
        return _out(amountIn, tokenReserve, monReserve);
    }

    function _out(uint256 dx, uint256 x, uint256 y) internal pure returns (uint256) {
        return (y * dx) / (x + dx);
    }
}

contract TrustPoolTest is Test {
    TrustPool pool;
    MockSwapAdapter dex;
    MockToken chog;
    MockToken warm; // only for building a record

    address admin = makeAddr("admin");
    address treasury = makeAddr("treasury");
    address caller = makeAddr("caller");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");
    address keeper = makeAddr("keeper");
    address stranger = makeAddr("stranger");

    uint32 constant WINDOW = 1 hours;
    uint32 constant HOLD = 24 hours;
    uint32 constant GAP = 15 minutes;

    function setUp() public {
        dex = new MockSwapAdapter();
        vm.deal(address(dex), 1_000_000 ether);
        pool = new TrustPool(admin, treasury, dex);
        chog = new MockToken("Chog", "CHOG", 0);
        warm = new MockToken("Warm", "WARM", 0);
        dex.setPrice(address(chog), 1 ether);
        dex.setPrice(address(warm), 1 ether);
        vm.startPrank(admin);
        pool.setAllowed(address(chog), true);
        pool.setAllowed(address(warm), true);
        vm.stopPrank();
        address[5] memory people = [caller, alice, bob, carol, stranger];
        for (uint256 i; i < people.length; ++i) {
            vm.deal(people[i], 100_000 ether);
        }
    }

    receive() external payable {}

    // ------------------------------------------------------------ helpers

    function _bond(uint256 amount) internal {
        vm.prank(caller);
        pool.postBond{value: amount}();
    }

    function _open(MockToken t, uint256 stake, uint32 tp, uint16 sl, uint16 share) internal returns (uint256 id) {
        vm.prank(caller);
        id = pool.openCall{value: stake}(address(t), WINDOW, tp, sl, HOLD, share, "thesis");
    }

    function _join(address who, uint256 id, uint256 amount) internal {
        vm.prank(who);
        pool.deposit{value: amount}(id);
    }

    function _buy(uint256 id) internal {
        vm.warp(pool.getCall(id).rules.windowEnd);
        vm.prank(caller);
        pool.buy(id, 0);
    }

    function _checkpoint(uint256 id) internal {
        vm.prank(keeper);
        pool.checkpoint(id);
    }

    /// Two checkpoints one gap apart at `price`, then the keeper sells.
    function _sellAt(MockToken t, uint256 id, uint256 price) internal {
        dex.setPrice(address(t), price);
        _checkpoint(id);
        vm.warp(block.timestamp + GAP);
        _checkpoint(id);
        vm.prank(keeper);
        pool.sell(id);
    }

    function _claim(address who, uint256 id) internal returns (uint256 got) {
        uint256 before = who.balance;
        vm.prank(who);
        pool.claim(id);
        got = who.balance - before;
    }

    /// Three settled calls at +20% each (gross), alone, on WARM: the caller reaches tier 1.
    function _climbToTier1() internal {
        for (uint256 i; i < 3; ++i) {
            uint256 id = _open(warm, 50 ether, 1000, 2000, 0);
            _buy(id);
            _sellAt(warm, id, 1.2 ether);
            _claim(caller, id);
            dex.setPrice(address(warm), 1 ether);
        }
        assertEq(pool.tierOf(caller), 1);
    }

    function _record() internal view returns (TrustPool.Record memory) {
        return pool.recordOf(caller);
    }

    // ------------------------------------------------------------ the PM's worked examples

    /// 1,000 in (caller 100, A 300, B 400, C 200), 1,300 gross, 0.1% keeper, 10% share of profit.
    function test_workedExample_profit() public {
        _bond(200 ether); // tier 1 caps the pool at 5x bond: 1,000
        _climbToTier1();
        int256 sumBefore = _record().sumNetBps;

        uint256 id = _open(chog, 100 ether, 2500, 2000, 1000);
        _join(alice, id, 300 ether);
        _join(bob, id, 400 ether);
        _join(carol, id, 200 ether);
        _buy(id);
        assertEq(pool.getCall(id).tokens, 1000 ether);

        uint256 keeperBefore = keeper.balance;
        _sellAt(chog, id, 1.3 ether);
        assertEq(keeper.balance - keeperBefore, 1.3 ether, "keeper gets exactly 0.1%");

        TrustPool.Call memory c = pool.getCall(id);
        assertEq(c.gross, 1300 ether);
        assertEq(c.fee, 29.87 ether);
        assertEq(c.payout, 1268.83 ether);
        assertEq(c.netReturnBps, 2688);

        assertApproxEqAbs(_claim(caller, id), 156.75 ether, 0.005 ether);
        assertApproxEqAbs(_claim(alice, id), 380.65 ether, 0.005 ether);
        assertApproxEqAbs(_claim(bob, id), 507.53 ether, 0.005 ether);
        assertApproxEqAbs(_claim(carol, id), 253.77 ether, 0.005 ether);

        TrustPool.Record memory r = _record();
        assertEq(r.sumNetBps - sumBefore, 2688, "record +26.88%");
        assertEq(r.settled, 4);
        assertEq(address(pool).balance, 200 ether, "only the bond is left");
    }

    /// Same pool, 700 gross: everyone -30.07%, no fee.
    function test_workedExample_loss() public {
        _bond(200 ether);
        _climbToTier1();
        int256 sumBefore = _record().sumNetBps;

        uint256 id = _open(chog, 100 ether, 2500, 2000, 1000);
        _join(alice, id, 300 ether);
        _join(bob, id, 400 ether);
        _join(carol, id, 200 ether);
        _buy(id);
        _sellAt(chog, id, 0.7 ether);

        TrustPool.Call memory c = pool.getCall(id);
        assertEq(c.fee, 0);
        assertEq(c.payout, 699.3 ether);
        assertEq(c.netReturnBps, -3007);
        assertEq(_claim(caller, id), 69.93 ether, "caller loses the same percentage");
        assertEq(_claim(alice, id), 209.79 ether);
        assertEq(_claim(bob, id), 279.72 ether);
        assertEq(_claim(carol, id), 139.86 ether);

        TrustPool.Record memory r = _record();
        assertEq(r.sumNetBps - sumBefore, -3007);
        assertEq(r.losses, 1);
    }

    // ------------------------------------------------------------ the PM's other cases

    function test_breakEven_noFee_keeperCostShows() public {
        _bond(100 ether);
        uint256 id = _open(chog, 50 ether, 0, 2000, 500);
        _join(alice, id, 50 ether);
        _buy(id);
        vm.warp(pool.getCall(id).holdUntil);
        _checkpoint(id);
        vm.prank(keeper);
        pool.sell(id);
        TrustPool.Call memory c = pool.getCall(id);
        assertEq(c.gross, 100 ether);
        assertEq(c.fee, 0, "no profit, no fee");
        assertEq(c.netReturnBps, -10, "the keeper reward is a real, small loss");
        assertEq(_claim(caller, id), 49.95 ether);
        assertEq(_claim(alice, id), 49.95 ether);
    }

    function test_callerAt4Percent_cannotBeReached() public {
        _bond(100 ether);
        uint256 id = _open(chog, 4 ether, 0, 2000, 0);
        _join(alice, id, 76 ether); // caller exactly 5%
        vm.prank(bob);
        vm.expectRevert(TrustPool.CallerStakeTooSmall.selector);
        pool.deposit{value: 20 ether}(id); // caller would be 4%
        // a joiner leaving only raises the caller's share
        vm.prank(alice);
        pool.withdraw(id, 6 ether);
        assertEq(pool.getCall(id).totalIn, 74 ether);
    }

    function test_depositOverCap() public {
        _bond(50 ether); // tier 0: cap 100
        uint256 id = _open(chog, 10 ether, 0, 2000, 0);
        _join(alice, id, 90 ether);
        vm.prank(bob);
        vm.expectRevert(TrustPool.OverCap.selector);
        pool.deposit{value: 1}(id);
        assertEq(pool.capOf(id), 100 ether);
    }

    function test_belowMinimum_refundNoFault() public {
        _bond(100 ether);
        uint256 id = _open(chog, 10 ether, 0, 2000, 0);
        _join(alice, id, 30 ether); // 40 < minPool 50
        TrustPool.Call memory c = pool.getCall(id);

        vm.expectRevert(TrustPool.TooEarly.selector);
        pool.refund(id);
        vm.warp(c.rules.windowEnd);
        vm.prank(caller);
        vm.expectRevert(TrustPool.PoolTooSmall.selector);
        pool.buy(id, 0);

        vm.prank(stranger);
        pool.refund(id); // no need to wait for the buy deadline
        assertEq(_record().negligent, 0);
        assertEq(_record().refunded, 1);
        assertEq(_record().active, 0);
        assertEq(_claim(caller, id), 10 ether);
        assertEq(_claim(alice, id), 30 ether);
        assertEq(address(pool).balance, 100 ether);
    }

    function test_noBuy_refundAndNegligent() public {
        _bond(100 ether);
        uint256 id = _open(chog, 10 ether, 0, 2000, 0);
        _join(alice, id, 90 ether);
        TrustPool.Call memory c = pool.getCall(id);
        vm.warp(c.rules.buyDeadline - 1);
        vm.expectRevert(TrustPool.TooEarly.selector);
        pool.refund(id);
        vm.warp(c.rules.buyDeadline);
        vm.prank(caller);
        vm.expectRevert(TrustPool.TooLate.selector);
        pool.buy(id, 0);

        vm.prank(alice);
        pool.refund(id);
        assertEq(_record().negligent, 1);
        assertEq(_claim(alice, id), 90 ether);
        assertEq(_claim(caller, id), 10 ether);
    }

    function test_noBuy_tokenDelisted_noMark() public {
        _bond(100 ether);
        uint256 id = _open(chog, 10 ether, 0, 2000, 0);
        _join(alice, id, 90 ether);
        vm.prank(admin);
        pool.setAllowed(address(chog), false);
        vm.warp(pool.getCall(id).rules.windowEnd);
        vm.prank(caller);
        vm.expectRevert(TrustPool.TokenNotAllowed.selector);
        pool.buy(id, 0);
        vm.warp(pool.getCall(id).rules.buyDeadline);
        pool.refund(id);
        assertEq(_record().negligent, 0);
        assertEq(_record().refunded, 1);
    }

    function test_feeOnTransferToken_measuresWhatArrives() public {
        MockToken tax = new MockToken("Tax", "TAX", 300); // 3% burned per transfer
        dex.setPrice(address(tax), 1 ether);
        vm.prank(admin);
        pool.setAllowed(address(tax), true);
        _bond(100 ether);
        uint256 id = _open(tax, 20 ether, 0, 2000, 0);
        _join(alice, id, 80 ether);
        _buy(id);
        assertEq(pool.getCall(id).tokens, 97 ether, "tokens recorded as received, not as quoted");

        vm.warp(pool.getCall(id).holdUntil);
        _checkpoint(id);
        vm.prank(keeper);
        pool.sell(id);
        TrustPool.Call memory c = pool.getCall(id);
        assertEq(c.gross, 97 ether, "MON measured on arrival");
        assertEq(c.netReturnBps, -309); // the 3% transfer fee shows in the record
        assertEq(_claim(caller, id) + _claim(alice, id), c.payout);
    }

    function test_doubleClaim_reverts() public {
        _bond(100 ether);
        uint256 id = _open(chog, 20 ether, 0, 2000, 0);
        _join(alice, id, 80 ether);
        vm.prank(alice);
        vm.expectRevert(TrustPool.WrongState.selector);
        pool.claim(id);
        _buy(id);
        _sellAt(chog, id, 0.5 ether); // stop-loss
        _claim(alice, id);
        vm.prank(alice);
        vm.expectRevert(TrustPool.AlreadyClaimed.selector);
        pool.claim(id);
        vm.prank(stranger);
        vm.expectRevert(TrustPool.NotParticipant.selector);
        pool.claim(id);
    }

    function test_saleKeepsFailing_split() public {
        _bond(100 ether);
        uint256 id = _open(chog, 20 ether, 0, 2000, 0);
        _join(alice, id, 50 ether);
        _join(bob, id, 30 ether);
        _buy(id);
        dex.setFrozen(address(chog), true);

        TrustPool.Call memory c = pool.getCall(id);
        vm.warp(c.holdUntil);
        _checkpoint(id);
        vm.prank(keeper);
        vm.expectRevert(MockSwapAdapter.Frozen.selector);
        pool.sell(id);

        vm.warp(uint256(c.holdUntil) + c.rules.splitGrace - 1);
        vm.expectRevert(TrustPool.TooEarly.selector);
        pool.split(id);
        vm.warp(uint256(c.holdUntil) + c.rules.splitGrace);
        vm.prank(stranger);
        pool.split(id);

        vm.prank(alice);
        pool.claim(id);
        vm.prank(caller);
        pool.claim(id);
        vm.prank(bob);
        pool.claim(id);
        assertEq(chog.balanceOf(alice), 50 ether);
        assertEq(chog.balanceOf(caller), 20 ether);
        assertEq(chog.balanceOf(bob), 30 ether);
        assertEq(chog.balanceOf(address(pool)), 0, "nothing stranded");

        TrustPool.Record memory r = _record();
        assertEq(r.split, 1);
        assertEq(r.settled, 0);
        assertEq(r.active, 0);
    }

    // ------------------------------------------------------------ rules fixed at open

    function test_rulesImmutableAfterOpen() public {
        _bond(100 ether);
        uint256 id = _open(chog, 20 ether, 3000, 1500, 500);
        bytes memory before = abi.encode(pool.getCall(id).rules);
        TrustPool.Call memory c0 = pool.getCall(id);

        MockSwapAdapter other = new MockSwapAdapter();
        vm.startPrank(admin);
        pool.setParams(
            TrustPool.Params({
                minBond: 1 ether,
                minPool: 1 ether,
                minWindow: 1 minutes,
                maxWindow: 2 minutes,
                buyGrace: 1 minutes,
                minHold: 1 minutes,
                maxHold: 2 minutes,
                checkpointGap: 1 minutes,
                splitGrace: 1 minutes,
                bondCooldown: 1 minutes,
                minStopLossBps: 1,
                maxStopLossBps: 2,
                minCallerBps: 9000,
                maxImpactBps: 1,
                sellToleranceBps: 9000,
                keeperBps: 100
            })
        );
        pool.setAdapter(other);
        pool.setTreasury(stranger);
        pool.setOpenPaused(true);
        pool.slash(caller, 90 ether, "test");
        pool.transferAdmin(stranger);
        vm.stopPrank();
        vm.prank(stranger);
        pool.acceptAdmin();

        TrustPool.Call memory c1 = pool.getCall(id);
        assertEq(abi.encode(c1.rules), before, "no rule moved");
        assertEq(c1.caller, c0.caller);
        assertEq(c1.token, c0.token);
        assertEq(c1.thesis, c0.thesis);

        // and the call runs on its own rules: joiners still fit under the cap fixed at open
        _join(alice, id, 80 ether);
        _buy(id);
        _sellAt(chog, id, 1.5 ether);
        assertEq(pool.getCall(id).gross, 150 ether, "sold through the adapter fixed at open");
        assertEq(keeper.balance, 0.15 ether, "keeper rate fixed at open");
    }

    function test_openValidatesRules() public {
        _bond(100 ether);
        vm.startPrank(caller);
        vm.expectRevert(TrustPool.BadRules.selector);
        pool.openCall{value: 1 ether}(address(chog), 29 minutes, 0, 2000, HOLD, 0, "");
        vm.expectRevert(TrustPool.BadRules.selector);
        pool.openCall{value: 1 ether}(address(chog), 7 hours, 0, 2000, HOLD, 0, "");
        vm.expectRevert(TrustPool.BadRules.selector);
        pool.openCall{value: 1 ether}(address(chog), WINDOW, 0, 99, HOLD, 0, "");
        vm.expectRevert(TrustPool.BadRules.selector);
        pool.openCall{value: 1 ether}(address(chog), WINDOW, 0, 9001, HOLD, 0, "");
        vm.expectRevert(TrustPool.BadRules.selector);
        pool.openCall{value: 1 ether}(address(chog), WINDOW, 0, 2000, 73 hours, 0, "");
        vm.expectRevert(TrustPool.ShareAboveTier.selector);
        pool.openCall{value: 1 ether}(address(chog), WINDOW, 0, 2000, HOLD, 501, "");
        vm.expectRevert(TrustPool.TokenNotAllowed.selector);
        pool.openCall{value: 1 ether}(stranger, WINDOW, 0, 2000, HOLD, 0, "");
        vm.expectRevert(TrustPool.ZeroValue.selector);
        pool.openCall(address(chog), WINDOW, 0, 2000, HOLD, 0, "");
        vm.stopPrank();

        vm.prank(stranger);
        vm.expectRevert(TrustPool.BondTooSmall.selector);
        pool.openCall{value: 1 ether}(address(chog), WINDOW, 0, 2000, HOLD, 0, "");
    }

    // ------------------------------------------------------------ the sale

    function test_sell_needsTwoCheckpoints() public {
        _bond(100 ether);
        uint256 id = _open(chog, 20 ether, 1000, 2000, 0);
        _join(alice, id, 80 ether);
        _buy(id);
        dex.setPrice(address(chog), 2 ether);

        vm.prank(keeper);
        vm.expectRevert(TrustPool.CheckpointStale.selector);
        pool.sell(id); // no checkpoint at all

        _checkpoint(id);
        vm.prank(keeper);
        vm.expectRevert(TrustPool.ConditionNotMet.selector);
        pool.sell(id); // one checkpoint is not enough

        vm.warp(block.timestamp + GAP - 1);
        vm.prank(keeper);
        vm.expectRevert(TrustPool.CheckpointTooSoon.selector);
        pool.checkpoint(id);

        vm.warp(block.timestamp + 1);
        _checkpoint(id);
        vm.prank(keeper);
        pool.sell(id);
        assertEq(uint8(pool.getCall(id).state), uint8(TrustPool.State.Settled));
    }

    function test_sell_bothCheckpointsMustMeetTheRule() public {
        _bond(100 ether);
        uint256 id = _open(chog, 20 ether, 1000, 2000, 0);
        _join(alice, id, 80 ether);
        _buy(id);
        dex.setPrice(address(chog), 2 ether); // a push
        _checkpoint(id);
        dex.setPrice(address(chog), 1 ether); // and back
        vm.warp(block.timestamp + GAP);
        _checkpoint(id);
        vm.prank(keeper);
        vm.expectRevert(TrustPool.ConditionNotMet.selector);
        pool.sell(id);
    }

    function test_sell_staleCheckpointsCannotTrigger() public {
        _bond(100 ether);
        uint256 id = _open(chog, 20 ether, 1000, 2000, 0);
        _join(alice, id, 80 ether);
        _buy(id);
        dex.setPrice(address(chog), 2 ether);
        _checkpoint(id);
        vm.warp(block.timestamp + GAP);
        _checkpoint(id);
        vm.warp(block.timestamp + GAP + 1);
        vm.prank(keeper);
        vm.expectRevert(TrustPool.CheckpointStale.selector);
        pool.sell(id);
    }

    function test_sell_minimumComesFromCheckpoints() public {
        _bond(100 ether);
        uint256 id = _open(chog, 20 ether, 1000, 2000, 0);
        _join(alice, id, 80 ether);
        _buy(id);
        dex.setPrice(address(chog), 2 ether);
        _checkpoint(id);
        vm.warp(block.timestamp + GAP);
        _checkpoint(id);
        // the price is pushed down right before the sale: more than the 2% tolerance fails
        dex.setPrice(address(chog), 1.95 ether);
        vm.prank(keeper);
        vm.expectRevert(MockSwapAdapter.Slippage.selector);
        pool.sell(id);
        // within tolerance it goes through
        dex.setPrice(address(chog), 1.961 ether);
        vm.prank(keeper);
        pool.sell(id);
        assertEq(pool.getCall(id).gross, 196.1 ether);
    }

    function test_sell_contractMeasuresProceeds() public {
        _bond(100 ether);
        uint256 id = _open(chog, 20 ether, 1000, 2000, 0);
        _join(alice, id, 80 ether);
        _buy(id);
        dex.setShort(100); // pays 1% less than its own minimum check
        dex.setPrice(address(chog), 2 ether);
        _checkpoint(id);
        vm.warp(block.timestamp + GAP);
        _checkpoint(id);
        vm.prank(keeper);
        pool.sell(id);
        assertEq(pool.getCall(id).gross, 198 ether);
    }

    function test_sell_afterMaxHold() public {
        _bond(100 ether);
        uint256 id = _open(chog, 20 ether, 0, 9000, 0);
        _join(alice, id, 80 ether);
        _buy(id);
        dex.setPrice(address(chog), 1.1 ether);
        _checkpoint(id);
        vm.warp(pool.getCall(id).holdUntil);
        vm.prank(keeper);
        vm.expectRevert(TrustPool.CheckpointStale.selector);
        pool.sell(id); // the keeper must checkpoint first
        _checkpoint(id);
        vm.prank(alice); // a joiner can be the keeper
        pool.sell(id);
        assertEq(pool.getCall(id).gross, 110 ether);
        assertEq(_claim(alice, id), 87.912 ether); // (110 - 0.11 keeper) x 0.8, no share set
    }

    function test_checkpointAndSell_onlyWhileHolding() public {
        _bond(100 ether);
        uint256 id = _open(chog, 20 ether, 0, 2000, 0);
        vm.expectRevert(TrustPool.WrongState.selector);
        pool.checkpoint(id);
        vm.expectRevert(TrustPool.WrongState.selector);
        pool.sell(id);
        vm.expectRevert(TrustPool.WrongState.selector);
        pool.split(id);
    }

    // ------------------------------------------------------------ window and buy

    function test_withdrawWhileOpen() public {
        _bond(100 ether);
        uint256 id = _open(chog, 20 ether, 0, 2000, 0);
        _join(alice, id, 50 ether);
        uint256 before = alice.balance;
        vm.prank(alice);
        pool.withdraw(id, 20 ether);
        assertEq(alice.balance - before, 20 ether);
        vm.prank(alice);
        pool.withdraw(id, 30 ether);
        assertEq(pool.depositOf(id, alice), 0);
        assertEq(pool.getCall(id).depositors, 1);
        assertEq(pool.participantsOf(id).length, 2, "the list keeps everyone who ever joined");

        vm.prank(caller);
        vm.expectRevert(TrustPool.CallerCannotWithdraw.selector);
        pool.withdraw(id, 1 ether);

        _join(alice, id, 40 ether);
        vm.warp(pool.getCall(id).rules.windowEnd);
        vm.prank(alice);
        vm.expectRevert(TrustPool.WrongState.selector);
        pool.withdraw(id, 1 ether);
        vm.prank(bob);
        vm.expectRevert(TrustPool.WrongState.selector);
        pool.deposit{value: 1 ether}(id);
    }

    function test_buy_onlyCallerInItsWindow() public {
        _bond(100 ether);
        uint256 id = _open(chog, 20 ether, 0, 2000, 0);
        _join(alice, id, 80 ether);
        vm.prank(caller);
        vm.expectRevert(TrustPool.TooEarly.selector);
        pool.buy(id, 0);
        vm.warp(pool.getCall(id).rules.windowEnd);
        vm.prank(alice);
        vm.expectRevert(TrustPool.NotCaller.selector);
        pool.buy(id, 0);
        vm.prank(caller);
        vm.expectRevert(MockSwapAdapter.Slippage.selector);
        pool.buy(id, 101 ether);
        vm.prank(caller);
        pool.buy(id, 100 ether);
        TrustPool.Call memory c = pool.getCall(id);
        assertEq(c.holdUntil, block.timestamp + HOLD);
        assertEq(address(pool).balance, 100 ether, "the pool's MON went into the buy");
    }

    function test_impactCap() public {
        CurveAdapter curve = new CurveAdapter(10_000 ether, 10_000_000 ether);
        vm.deal(address(curve), 100_000 ether);
        MockToken t = new MockToken("Deep", "DEEP", 0);
        vm.startPrank(admin);
        pool.setAdapter(curve);
        pool.setAllowed(address(t), true);
        vm.stopPrank();
        _bond(1000 ether); // bond cap 2,000, far above what the pool can take

        vm.prank(caller);
        uint256 id = pool.openCall{value: 20 ether}(address(t), WINDOW, 0, 2000, HOLD, 0, "");
        uint256 cap = pool.capOf(id);
        // a 2% average-price impact on 10,000 MON of depth is about 204 MON
        assertApproxEqRel(cap, 204 ether, 0.01e18);
        assertLe(pool.impactBps(curve, address(t), cap), 200);
        assertGt(pool.impactBps(curve, address(t), cap + 0.01 ether), 200);

        vm.prank(alice);
        vm.expectRevert(TrustPool.ImpactTooHigh.selector);
        pool.deposit{value: cap - 20 ether + 0.01 ether}(id);
        _join(alice, id, cap - 20 ether - 0.01 ether);

        // the pool thins out before the buy: the buy refuses, nothing moves
        curve.setReserves(5000 ether, 5_000_000 ether);
        vm.warp(pool.getCall(id).rules.windowEnd);
        vm.prank(caller);
        vm.expectRevert(TrustPool.ImpactTooHigh.selector);
        pool.buy(id, 0);
        curve.setReserves(10_000 ether, 10_000_000 ether);
        vm.prank(caller);
        pool.buy(id, 0);
    }

    // ------------------------------------------------------------ bond, tiers, admin

    function test_bondLockedWhileActive() public {
        _bond(100 ether);
        uint256 id = _open(chog, 20 ether, 0, 2000, 0);
        _join(alice, id, 80 ether);
        vm.prank(caller);
        vm.expectRevert(TrustPool.ActiveCalls.selector);
        pool.requestBondWithdraw();
        _buy(id);
        vm.prank(caller);
        vm.expectRevert(TrustPool.ActiveCalls.selector);
        pool.requestBondWithdraw();
        _sellAt(chog, id, 0.5 ether);

        vm.prank(caller);
        pool.requestBondWithdraw();
        vm.prank(caller);
        vm.expectRevert(TrustPool.TooEarly.selector);
        pool.withdrawBond();
        vm.warp(block.timestamp + 7 days);
        uint256 before = caller.balance;
        vm.prank(caller);
        pool.withdrawBond();
        assertEq(caller.balance - before, 100 ether);
    }

    function test_tiers() public {
        _bond(200 ether);
        assertEq(pool.tierOf(caller), 0);
        _climbToTier1();
        uint256 id = _open(chog, 100 ether, 0, 2000, 1000);
        assertEq(pool.getCall(id).rules.cap, 1000 ether, "tier 1: 5x bond");
        vm.prank(caller);
        vm.expectRevert(TrustPool.ShareAboveTier.selector);
        pool.openCall{value: 1 ether}(address(chog), WINDOW, 0, 2000, HOLD, 1001, "");

        vm.prank(admin);
        pool.slash(caller, 1 ether, "front-ran own pool");
        assertEq(pool.tierOf(caller), 0, "a slash drops the caller to tier 0");
        (uint256 m, uint256 s) = pool.tierLimits(3);
        assertEq(m, 20);
        assertEq(s, 2000);
    }

    function test_losingAverageStaysTier0() public {
        _bond(100 ether);
        for (uint256 i; i < 3; ++i) {
            uint256 id = _open(warm, 50 ether, 0, 1000, 0);
            _buy(id);
            _sellAt(warm, id, 0.8 ether);
            dex.setPrice(address(warm), 1 ether);
        }
        assertEq(_record().settled, 3);
        assertEq(_record().losses, 3);
        assertEq(pool.tierOf(caller), 0);
    }

    function test_adminOnly() public {
        vm.startPrank(stranger);
        vm.expectRevert(TrustPool.NotAdmin.selector);
        pool.setAllowed(address(chog), false);
        vm.expectRevert(TrustPool.NotAdmin.selector);
        pool.setAdapter(dex);
        TrustPool.Params memory current = pool.params();
        vm.expectRevert(TrustPool.NotAdmin.selector);
        pool.setParams(current);
        vm.expectRevert(TrustPool.NotAdmin.selector);
        pool.slash(caller, 1, "x");
        vm.expectRevert(TrustPool.NotAdmin.selector);
        pool.setOpenPaused(true);
        vm.stopPrank();

        TrustPool.Params memory p = pool.params();
        p.minWindow = p.maxWindow + 1;
        vm.prank(admin);
        vm.expectRevert(TrustPool.BadParams.selector);
        pool.setParams(p);
        p = pool.params();
        p.keeperBps = 101;
        vm.prank(admin);
        vm.expectRevert(TrustPool.BadParams.selector);
        pool.setParams(p);
    }

    function test_pauseStopsNewCallsOnly() public {
        _bond(100 ether);
        uint256 id = _open(chog, 20 ether, 0, 2000, 0);
        vm.prank(admin);
        pool.setOpenPaused(true);
        vm.prank(caller);
        vm.expectRevert(TrustPool.OpenPaused.selector);
        pool.openCall{value: 1 ether}(address(chog), WINDOW, 0, 2000, HOLD, 0, "");
        _join(alice, id, 80 ether);
        _buy(id);
    }

    function test_directTransferRejected() public {
        vm.prank(stranger);
        (bool ok,) = address(pool).call{value: 1 ether}("");
        assertFalse(ok);
    }

    // ------------------------------------------------------------ fuzz

    /// Random deposits and outcomes: every participant gets the same percentage to the wei,
    /// the caller adds only the fee, and nothing but dust-free bonds is left after all claims.
    function testFuzz_everyoneSamePercentage(uint256[4] memory amounts, uint256 exitPrice, uint16 share) public {
        _bond(10_000 ether);
        share = uint16(bound(share, 0, 500));
        exitPrice = bound(exitPrice, 0.01 ether, 5 ether);
        uint256 id = _open(chog, 50 ether, 0, 9000, share);
        address[4] memory joiners = [alice, bob, carol, stranger];
        for (uint256 i; i < 4; ++i) {
            amounts[i] = bound(amounts[i], 1, 200 ether);
            _join(joiners[i], id, amounts[i]);
        }
        _buy(id);
        dex.setPrice(address(chog), exitPrice);
        vm.warp(pool.getCall(id).holdUntil);
        _checkpoint(id);
        vm.prank(keeper);
        pool.sell(id);

        TrustPool.Call memory c = pool.getCall(id);
        assertEq(c.gross - (c.gross * 10) / 10_000, uint256(c.payout) + c.fee);
        if (c.payout + c.fee <= c.totalIn) assertEq(c.fee, 0);

        uint256 total = c.totalIn;
        uint256 paid;
        for (uint256 i; i < 4; ++i) {
            uint256 got = _claim(joiners[i], id);
            paid += got;
            // got / amount == payout / total, to one wei of rounding
            assertApproxEqAbs(got * total, amounts[i] * uint256(c.payout), total);
            assertGe(address(pool).balance, 10_000 ether);
        }
        uint256 callerGot = _claim(caller, id);
        paid += callerGot;
        assertApproxEqAbs((callerGot - c.fee) * total, 50 ether * uint256(c.payout), total * 5);
        assertEq(paid, uint256(c.payout) + c.fee, "everything paid out");
        assertEq(address(pool).balance, 10_000 ether, "only the bond is left");
    }

    /// Refunds are always 1:1, in any order.
    function testFuzz_refundIsExact(uint256[4] memory amounts, bool small) public {
        _bond(10_000 ether);
        uint256 id = _open(chog, small ? 1 ether : 50 ether, 0, 2000, 0);
        address[4] memory joiners = [alice, bob, carol, stranger];
        for (uint256 i; i < 4; ++i) {
            amounts[i] = bound(amounts[i], 1, small ? 1 ether : 200 ether);
            _join(joiners[i], id, amounts[i]);
        }
        TrustPool.Call memory c = pool.getCall(id);
        vm.warp(c.totalIn < 50 ether ? c.rules.windowEnd : c.rules.buyDeadline);
        pool.refund(id);
        for (uint256 i; i < 4; ++i) {
            assertEq(_claim(joiners[i], id), amounts[i]);
        }
        _claim(caller, id);
        assertEq(address(pool).balance, 10_000 ether);
    }
}
