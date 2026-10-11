// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {TrustPool} from "../../src/TrustPool.sol";

/// @notice Runs a pooled call with the caller as its only participant, to drive an adapter
/// through a whole buy and sale. The sale happens at max hold, so no price rule is involved.
/// Prank before `_checkpointPair` if the checkpoints should come from a given address.
abstract contract SoloCall is Test {
    /// Lets small pools through, so adapter tests can use small amounts.
    function _smallPools(TrustPool pool, address admin) internal {
        TrustPool.Params memory p = pool.params();
        p.minPool = 0.001 ether;
        p.minBond = 1 ether;
        vm.prank(admin);
        pool.setParams(p);
    }

    /// Opens with `mon` as the caller's stake and waits out the window.
    function _soloOpen(TrustPool pool, address caller, address token, uint256 mon) internal returns (uint256 id) {
        TrustPool.Params memory p = pool.params();
        vm.prank(caller);
        id = pool.openCall{value: mon}(token, p.minWindow, 0, p.maxStopLossBps, p.minHold, 0, "solo");
        vm.warp(pool.getCall(id).rules.windowEnd);
    }

    /// Opens, waits out the window and buys.
    function _soloBuy(TrustPool pool, address caller, address token, uint256 mon, uint256 minTokens)
        internal
        returns (uint256 id)
    {
        id = _soloOpen(pool, caller, token, mon);
        vm.prank(caller);
        pool.buy(id, minTokens);
    }

    /// Waits out max hold, checkpoints and sells as the caller, then claims.
    /// @return gross MON the sale returned, as the contract measured it
    function _soloSell(TrustPool pool, address caller, uint256 id) internal returns (uint256 gross) {
        vm.startPrank(caller);
        _checkpointPair(pool, id);
        pool.sell(id);
        pool.claim(id);
        vm.stopPrank();
        gross = pool.getCall(id).gross;
    }

    /// Two checkpoints one gap apart, the second at max hold: what a max-hold sale needs.
    function _checkpointPair(TrustPool pool, uint256 id) internal {
        TrustPool.Call memory c = pool.getCall(id);
        vm.warp(uint256(c.holdUntil) - c.rules.checkpointGap);
        pool.checkpoint(id);
        vm.warp(c.holdUntil);
        pool.checkpoint(id);
    }
}
