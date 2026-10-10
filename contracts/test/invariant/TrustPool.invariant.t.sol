// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {TrustPool} from "../../src/TrustPool.sol";
import {MockToken} from "../../src/mocks/MockToken.sol";
import {MockSwapAdapter} from "../../src/mocks/MockSwapAdapter.sol";

/// @notice Drives TrustPool through random sequences of every user, keeper and admin action,
/// with the clock and prices moving between them. The invariant contract checks the books.
contract Handler is Test {
    TrustPool public immutable pool;
    MockSwapAdapter public immutable dex;
    MockToken[] public tokens;
    address public immutable admin;
    address[] public actors; // callers and joiners alike
    address public immutable keeper = makeAddr("keeper");

    constructor(TrustPool pool_, MockSwapAdapter dex_, MockToken[] memory tokens_, address admin_) {
        pool = pool_;
        dex = dex_;
        tokens = tokens_;
        admin = admin_;
        for (uint256 i; i < 5; ++i) {
            address a = makeAddr(string.concat("actor", vm.toString(i)));
            actors.push(a);
            vm.deal(a, 10_000_000 ether);
        }
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function _call(uint256 seed) internal view returns (uint256 id, TrustPool.Call memory c, bool ok) {
        uint256 n = pool.callCount();
        if (n == 0) return (0, c, false);
        id = seed % n;
        return (id, pool.getCall(id), true);
    }

    // ------------------------------------------------------------ caller

    function postBond(uint256 seed, uint256 amount) external {
        vm.prank(_actor(seed));
        pool.postBond{value: bound(amount, 1, 500 ether)}();
    }

    function openCall(uint256 seed, uint256 tokenSeed, uint256 stake, uint32 window, uint32 hold, uint16 sl, uint32 tp)
        external
    {
        address a = _actor(seed);
        (uint256 bond,) = pool.bonds(a);
        TrustPool.Params memory p = pool.params();
        if (bond < p.minBond) {
            vm.prank(a);
            pool.postBond{value: p.minBond}();
            bond += p.minBond;
        }
        stake = bound(stake, 1 ether, bond * 2);
        window = uint32(bound(window, p.minWindow, p.maxWindow));
        hold = uint32(bound(hold, p.minHold, p.maxHold));
        sl = uint16(bound(sl, p.minStopLossBps, p.maxStopLossBps));
        tp = uint32(bound(tp, 0, 20_000));
        (, uint256 maxShare) = pool.tierLimits(pool.tierOf(a));
        vm.prank(a);
        pool.openCall{value: stake}(
            address(tokens[tokenSeed % tokens.length]), window, tp, sl, hold, uint16(maxShare), "invariant"
        );
    }

    function buy(uint256 seed) external {
        (uint256 id, TrustPool.Call memory c, bool ok) = _call(seed);
        if (!ok || c.state != TrustPool.State.Open) return;
        if (block.timestamp < c.rules.windowEnd || block.timestamp >= c.rules.buyDeadline) return;
        if (c.totalIn < c.rules.minPool || !pool.allowed(c.token)) return;
        vm.prank(c.caller);
        pool.buy(id, 0);
    }

    // ------------------------------------------------------------ joiners

    function deposit(uint256 seed, uint256 who, uint256 amount) external {
        (uint256 id, TrustPool.Call memory c, bool ok) = _call(seed);
        if (!ok || c.state != TrustPool.State.Open || block.timestamp >= c.rules.windowEnd) return;
        uint256 room = c.rules.cap - c.totalIn;
        uint256 stake = pool.depositOf(id, c.caller);
        uint256 stakeRoom = (stake * 10_000) / c.rules.minCallerBps; // largest total the caller's stake allows
        if (stakeRoom < c.totalIn) return;
        if (stakeRoom - c.totalIn < room) room = stakeRoom - c.totalIn;
        if (room == 0) return;
        vm.prank(_actor(who));
        pool.deposit{value: bound(amount, 1, room)}(id);
    }

    function withdraw(uint256 seed, uint256 who, uint256 amount) external {
        (uint256 id, TrustPool.Call memory c, bool ok) = _call(seed);
        address a = _actor(who);
        if (!ok || c.state != TrustPool.State.Open || block.timestamp >= c.rules.windowEnd || a == c.caller) return;
        uint256 d = pool.depositOf(id, a);
        if (d == 0) return;
        vm.prank(a);
        pool.withdraw(id, bound(amount, 1, d));
    }

    function claim(uint256 seed, uint256 who) external {
        (uint256 id, TrustPool.Call memory c, bool ok) = _call(seed);
        address a = _actor(who);
        if (!ok) return;
        if (
            c.state != TrustPool.State.Settled && c.state != TrustPool.State.Refunded
                && c.state != TrustPool.State.Split
        ) {
            return;
        }
        if (pool.depositOf(id, a) == 0 || pool.hasClaimed(id, a)) return;
        vm.prank(a);
        pool.claim(id);
    }

    // ------------------------------------------------------------ keeper

    function checkpoint(uint256 seed) external {
        (uint256 id, TrustPool.Call memory c, bool ok) = _call(seed);
        if (!ok || c.state != TrustPool.State.Holding) return;
        if (c.last.at != 0 && block.timestamp < uint256(c.last.at) + c.rules.checkpointGap) return;
        vm.prank(keeper);
        pool.checkpoint(id);
    }

    function sell(uint256 seed) external {
        (uint256 id,, bool ok) = _call(seed);
        if (!ok) return;
        vm.prank(keeper);
        try pool.sell(id) {} catch {} // only the contract decides whether a sale may happen
    }

    function refund(uint256 seed) external {
        (uint256 id,, bool ok) = _call(seed);
        if (!ok) return;
        try pool.refund(id) {} catch {}
    }

    function split(uint256 seed) external {
        (uint256 id,, bool ok) = _call(seed);
        if (!ok) return;
        try pool.split(id) {} catch {}
    }

    /// One keeper pass over every call: checkpoint where allowed, then try to sell. Makes sure
    /// random runs reach sales instead of mostly refunds.
    function keeperPass() external {
        for (uint256 id; id < pool.callCount(); ++id) {
            TrustPool.Call memory c = pool.getCall(id);
            if (c.state == TrustPool.State.Open && block.timestamp >= c.rules.windowEnd) {
                vm.prank(c.caller);
                try pool.buy(id, 0) {} catch {}
                continue;
            }
            if (c.state != TrustPool.State.Holding) continue;
            vm.startPrank(keeper);
            try pool.checkpoint(id) {} catch {}
            try pool.sell(id) {} catch {}
            vm.stopPrank();
        }
    }

    // ------------------------------------------------------------ bond and admin

    function requestWithdraw(uint256 seed) external {
        address a = _actor(seed);
        (uint256 bond,) = pool.bonds(a);
        if (bond == 0 || pool.recordOf(a).active != 0) return;
        vm.prank(a);
        pool.requestBondWithdraw();
    }

    function withdrawBond(uint256 seed) external {
        address a = _actor(seed);
        (, uint64 readyAt) = pool.bonds(a);
        if (readyAt == 0 || block.timestamp < readyAt || pool.recordOf(a).active != 0) return;
        vm.prank(a);
        pool.withdrawBond();
    }

    function slash(uint256 seed, uint256 amount) external {
        address a = _actor(seed);
        (uint256 bond,) = pool.bonds(a);
        if (bond == 0) return;
        vm.prank(admin);
        pool.slash(a, bound(amount, 1, bond), "invariant");
    }

    // ------------------------------------------------------------ world

    function movePrice(uint256 tokenSeed, uint256 p) external {
        dex.setPrice(address(tokens[tokenSeed % tokens.length]), bound(p, 0.05 ether, 20 ether));
    }

    function freeze(uint256 tokenSeed, bool f) external {
        dex.setFrozen(address(tokens[tokenSeed % tokens.length]), f);
    }

    function warp(uint256 dt) external {
        vm.warp(block.timestamp + bound(dt, 1 minutes, 20 minutes));
    }
}

contract TrustPoolInvariantTest is Test {
    TrustPool pool;
    MockSwapAdapter dex;
    Handler handler;
    MockToken[] tokens;
    address admin = makeAddr("admin");
    address treasury = makeAddr("treasury");

    function setUp() public {
        dex = new MockSwapAdapter();
        vm.deal(address(dex), 1_000_000_000 ether);
        pool = new TrustPool(admin, treasury, dex);
        tokens.push(new MockToken("Chog", "CHOG", 0));
        tokens.push(new MockToken("Tax", "TAX", 300)); // 3% burned on every transfer
        for (uint256 i; i < tokens.length; ++i) {
            dex.setPrice(address(tokens[i]), 1 ether);
            vm.prank(admin);
            pool.setAllowed(address(tokens[i]), true);
        }
        // short timings and a small minimum, so random runs reach every state
        TrustPool.Params memory p = pool.params();
        p.minPool = 1 ether;
        p.minWindow = 2 minutes;
        p.maxWindow = 10 minutes;
        p.buyGrace = 10 minutes;
        p.minHold = 5 minutes;
        p.maxHold = 30 minutes;
        p.checkpointGap = 3 minutes;
        p.splitGrace = 10 minutes;
        p.bondCooldown = 10 minutes;
        vm.prank(admin);
        pool.setParams(p);
        handler = new Handler(pool, dex, tokens, admin);
        targetContract(address(handler));
    }

    /// MON still owed by a call: deposits before a buy or after a refund, the payout and
    /// fee after a sale, less what has been claimed.
    function _monOwed(uint256 id, TrustPool.Call memory c) internal view returns (uint256) {
        if (c.state == TrustPool.State.Open) return c.totalIn;
        if (c.state == TrustPool.State.Refunded) return c.totalIn - c.claimed;
        if (c.state == TrustPool.State.Settled) {
            return c.payout - c.claimed + (pool.hasClaimed(id, c.caller) ? 0 : c.fee);
        }
        return 0;
    }

    /// The pool's MON is exactly the bonds plus what every call still owes in MON.
    function invariant_monIsExactlyWhatIsOwed() public view {
        uint256 owed;
        for (uint256 i; i < handler.actorCount(); ++i) {
            (uint256 amount,) = pool.bonds(handler.actors(i));
            owed += amount;
        }
        for (uint256 id; id < pool.callCount(); ++id) {
            owed += _monOwed(id, pool.getCall(id));
        }
        assertEq(address(pool).balance, owed);
    }

    /// Every token the pool holds belongs to a holding or split call, and every one is backed.
    function invariant_tokensAreExactlyWhatIsOwed() public view {
        for (uint256 t; t < tokens.length; ++t) {
            uint256 owed;
            for (uint256 id; id < pool.callCount(); ++id) {
                TrustPool.Call memory c = pool.getCall(id);
                if (c.token != address(tokens[t])) continue;
                if (c.state == TrustPool.State.Holding) owed += c.tokens;
                else if (c.state == TrustPool.State.Split) owed += c.tokens - c.claimed;
            }
            assertEq(tokens[t].balanceOf(address(pool)), owed);
        }
    }

    /// A call's total is the sum of its deposits, and its depositor count matches them.
    function invariant_depositsAddUp() public view {
        for (uint256 id; id < pool.callCount(); ++id) {
            TrustPool.Call memory c = pool.getCall(id);
            address[] memory ps = pool.participantsOf(id);
            uint256 sum;
            uint256 n;
            for (uint256 k; k < ps.length; ++k) {
                uint256 d = pool.depositOf(id, ps[k]);
                sum += d;
                if (d != 0) n++;
            }
            assertEq(sum, c.totalIn);
            assertEq(n, c.depositors);
            assertLe(c.claims, c.depositors);
            if (c.state != TrustPool.State.Open) {
                assertLe(c.totalIn, c.rules.cap);
                assertGe(pool.depositOf(id, c.caller) * 10_000, uint256(c.rules.minCallerBps) * c.totalIn);
            }
            if (c.claims == c.depositors && c.state == TrustPool.State.Settled) assertEq(c.claimed, c.payout);
            if (c.claims == c.depositors && c.state == TrustPool.State.Split) assertEq(c.claimed, c.tokens);
        }
    }

    /// A sale never paid less than the floor its checkpoints allowed, and the split of proceeds
    /// follows the arithmetic exactly.
    function invariant_salesFollowTheRules() public view {
        for (uint256 id; id < pool.callCount(); ++id) {
            TrustPool.Call memory c = pool.getCall(id);
            if (c.state != TrustPool.State.Settled) continue;
            uint256 net = c.gross - (uint256(c.gross) * c.rules.keeperBps) / 10_000;
            uint256 fee = net > c.totalIn ? ((net - c.totalIn) * c.rules.shareBps) / 10_000 : 0;
            assertEq(c.fee, fee);
            assertEq(c.payout, net - fee);
            assertGe(c.prev.at == 0 ? type(uint256).max : uint256(c.last.at) - c.prev.at, c.rules.checkpointGap);
            uint256 floor = c.last.value;
            if (c.prev.at != 0 && c.prev.value < floor) floor = c.prev.value;
            assertGe(uint256(c.gross) * 10_000 + 10_000, floor * (10_000 - c.rules.sellToleranceBps));
        }
    }

    /// Each record equals what its calls imply: no call is ever dropped or double counted.
    function invariant_recordsMatchTheirCalls() public view {
        for (uint256 i; i < handler.actorCount(); ++i) {
            address a = handler.actors(i);
            TrustPool.Record memory r = pool.recordOf(a);
            uint256[] memory ids = pool.callsOf(a);
            uint32 active;
            uint32 settled;
            uint32 losses;
            uint32 splits;
            uint32 refunds;
            int256 sum;
            for (uint256 k; k < ids.length; ++k) {
                TrustPool.Call memory c = pool.getCall(ids[k]);
                assertEq(c.caller, a);
                if (c.state == TrustPool.State.Open || c.state == TrustPool.State.Holding) {
                    active++;
                } else if (c.state == TrustPool.State.Settled) {
                    settled++;
                    sum += c.netReturnBps;
                    if (c.netReturnBps < 0) losses++;
                    assertEq(
                        c.netReturnBps,
                        ((int256(uint256(c.payout)) - int256(uint256(c.totalIn))) * 10_000) / int256(uint256(c.totalIn))
                    );
                } else if (c.state == TrustPool.State.Split) {
                    splits++;
                } else {
                    refunds++;
                }
            }
            assertEq(r.active, active);
            assertEq(r.settled, settled);
            assertEq(r.losses, losses);
            assertEq(r.split, splits);
            assertEq(r.negligent + r.refunded, refunds);
            assertEq(r.sumNetBps, sum);
        }
    }
}
