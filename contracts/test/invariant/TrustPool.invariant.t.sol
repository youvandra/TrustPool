// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {TrustPool} from "../../src/TrustPool.sol";
import {MockToken} from "../../src/mocks/MockToken.sol";
import {MockSwapAdapter} from "../../src/mocks/MockSwapAdapter.sol";

/// @notice Drives TrustPool through random sequences of every user and admin action, with the
/// clock and prices moving between them. The invariant contract checks the books after each.
contract Handler is Test {
    TrustPool public immutable pool;
    MockSwapAdapter public immutable dex;
    MockToken[] public tokens;
    address public immutable admin;
    address[] public actors;

    constructor(TrustPool pool_, MockSwapAdapter dex_, MockToken[] memory tokens_, address admin_) {
        pool = pool_;
        dex = dex_;
        tokens = tokens_;
        admin = admin_;
        for (uint256 i; i < 3; ++i) {
            address a = makeAddr(string.concat("caller", vm.toString(i)));
            actors.push(a);
            vm.deal(a, 1_000_000 ether);
        }
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function _call(uint256 seed) internal view returns (uint256 id, bool ok) {
        uint256 n = pool.callCount();
        if (n == 0) return (0, false);
        return (seed % n, true);
    }

    // ------------------------------------------------------------ caller actions

    function postBond(uint256 seed, uint256 amount) external {
        amount = bound(amount, 1, 50 ether);
        vm.prank(_actor(seed));
        pool.postBond{value: amount}();
    }

    function openCall(uint256 seed, uint256 tokenSeed, uint256 mon, uint64 lock, uint32 notice) external {
        address a = _actor(seed);
        (uint256 bond,) = pool.bonds(a);
        if (bond < pool.minBond()) return;
        mon = bound(mon, 0.01 ether, 500 ether);
        lock = uint64(bound(lock, pool.minLock(), pool.maxLock()));
        notice = uint32(bound(notice, pool.minNotice(), 7 days));
        vm.prank(a);
        pool.openCall{value: mon}(address(tokens[tokenSeed % tokens.length]), lock, notice, 0, "invariant");
    }

    function announce(uint256 seed) external {
        (uint256 id, bool ok) = _call(seed);
        if (!ok) return;
        TrustPool.Call memory c = pool.getCall(id);
        if (c.state != TrustPool.State.Locked) return;
        vm.prank(c.caller);
        pool.announceExit(id);
    }

    function execute(uint256 seed) external {
        (uint256 id, bool ok) = _call(seed);
        if (!ok) return;
        TrustPool.Call memory c = pool.getCall(id);
        if (c.state != TrustPool.State.Exiting || block.timestamp < c.exitAt || dex.frozen(c.token)) return;
        vm.prank(c.caller);
        pool.executeExit(id, 0);
    }

    function release(uint256 seed) external {
        (uint256 id, bool ok) = _call(seed);
        if (!ok) return;
        TrustPool.Call memory c = pool.getCall(id);
        if (c.state != TrustPool.State.Exiting || block.timestamp < uint256(c.exitAt) + c.releaseGrace) return;
        vm.prank(c.caller);
        pool.releaseTokens(id);
    }

    function markStale(uint256 seed) external {
        (uint256 id, bool ok) = _call(seed);
        if (!ok) return;
        TrustPool.Call memory c = pool.getCall(id);
        if (c.stale) return;
        uint256 from;
        if (c.state == TrustPool.State.Locked) from = c.unlockAt;
        else if (c.state == TrustPool.State.Exiting) from = c.exitAt;
        else return;
        if (block.timestamp < from + c.maxHold) return;
        pool.markStale(id);
    }

    function requestWithdraw(uint256 seed) external {
        address a = _actor(seed);
        (uint256 bond,) = pool.bonds(a);
        if (bond == 0 || pool.recordOf(a).open != 0) return;
        vm.prank(a);
        pool.requestBondWithdraw();
    }

    function withdraw(uint256 seed) external {
        address a = _actor(seed);
        (, uint64 readyAt) = pool.bonds(a);
        if (readyAt == 0 || block.timestamp < readyAt || pool.recordOf(a).open != 0) return;
        vm.prank(a);
        pool.withdrawBond();
    }

    // ------------------------------------------------------------ world

    function slash(uint256 seed, uint256 amount) external {
        address a = _actor(seed);
        (uint256 bond,) = pool.bonds(a);
        if (bond == 0) return;
        vm.prank(admin);
        pool.slash(a, bound(amount, 1, bond), "invariant");
    }

    function movePrice(uint256 tokenSeed, uint256 p) external {
        dex.setPrice(address(tokens[tokenSeed % tokens.length]), bound(p, 1e9, 1 ether));
    }

    function freeze(uint256 tokenSeed, bool f) external {
        dex.setFrozen(address(tokens[tokenSeed % tokens.length]), f);
    }

    function warp(uint256 dt) external {
        vm.warp(block.timestamp + bound(dt, 1 minutes, 40 days));
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
        vm.deal(address(dex), 100_000_000 ether);
        pool = new TrustPool(admin, treasury, dex);
        tokens.push(new MockToken("Chog", "CHOG", 0));
        tokens.push(new MockToken("Tax", "TAX", 300)); // 3% burned on every transfer
        for (uint256 i; i < tokens.length; ++i) {
            dex.setPrice(address(tokens[i]), 0.002 ether);
            vm.prank(admin);
            pool.setAllowed(address(tokens[i]), true);
        }
        handler = new Handler(pool, dex, tokens, admin);
        targetContract(address(handler));
    }

    /// The pool's MON is exactly the bonds: sale proceeds are forwarded in the same transaction.
    function invariant_monIsExactlyTheBonds() public view {
        uint256 bonds;
        for (uint256 i; i < handler.actorCount(); ++i) {
            (uint256 amount,) = pool.bonds(handler.actors(i));
            bonds += amount;
        }
        assertEq(address(pool).balance, bonds);
    }

    /// Every token the pool holds belongs to an open call, and every open call is fully backed.
    function invariant_tokensAreExactlyTheOpenPositions() public view {
        for (uint256 t; t < tokens.length; ++t) {
            uint256 owed;
            for (uint256 id; id < pool.callCount(); ++id) {
                TrustPool.Call memory c = pool.getCall(id);
                if (
                    c.token == address(tokens[t])
                        && (c.state == TrustPool.State.Locked || c.state == TrustPool.State.Exiting)
                ) {
                    owed += c.tokens;
                }
            }
            assertEq(tokens[t].balanceOf(address(pool)), owed);
        }
    }

    /// Each record equals what its calls imply: no call is ever dropped or double counted.
    function invariant_recordsMatchTheirCalls() public view {
        for (uint256 i; i < handler.actorCount(); ++i) {
            address a = handler.actors(i);
            TrustPool.Record memory r = pool.recordOf(a);
            uint256[] memory ids = pool.callsOf(a);
            uint32 open;
            uint32 settled;
            uint32 released;
            uint32 losses;
            uint32 stale;
            int256 sum;
            for (uint256 k; k < ids.length; ++k) {
                TrustPool.Call memory c = pool.getCall(ids[k]);
                assertEq(c.caller, a);
                if (c.stale) stale++;
                if (c.state == TrustPool.State.Locked || c.state == TrustPool.State.Exiting) {
                    open++;
                } else if (c.state == TrustPool.State.Settled) {
                    settled++;
                    int256 ret =
                        ((int256(uint256(c.monOut)) - int256(uint256(c.monIn))) * 10_000) / int256(uint256(c.monIn));
                    sum += ret;
                    if (ret < 0) losses++;
                } else {
                    released++;
                    losses++;
                    sum -= 10_000;
                }
            }
            assertEq(r.open, open);
            assertEq(r.settled, settled);
            assertEq(r.released, released);
            assertEq(r.losses, losses);
            assertEq(r.stale, stale);
            assertEq(r.sumReturnBps, sum);
        }
    }

    /// No exit ever happened before both the lock and the full notice had passed.
    function invariant_exitsRespectLockAndNotice() public view {
        for (uint256 id; id < pool.callCount(); ++id) {
            TrustPool.Call memory c = pool.getCall(id);
            if (c.state == TrustPool.State.Locked) {
                assertEq(c.exitAt, 0);
                continue;
            }
            assertGe(c.exitAt, c.unlockAt);
            assertGe(c.exitAt, uint256(c.announcedAt) + c.notice);
        }
    }
}
