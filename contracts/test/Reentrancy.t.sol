// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {TrustPool} from "../src/TrustPool.sol";
import {MockToken} from "../src/mocks/MockToken.sol";
import {MockSwapAdapter} from "../src/mocks/MockSwapAdapter.sol";

/// @notice An allowed token that calls back into the pool whenever it moves.
contract CallbackToken is MockToken {
    address public target;
    bytes public data;
    bytes public lastRevert;

    constructor() MockToken("Hook", "HOOK", 0) {}

    function arm(address target_, bytes calldata data_) external {
        target = target_;
        data = data_;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (target != address(0)) {
            (bool ok, bytes memory ret) = target.call(data);
            require(!ok, "reentry succeeded");
            lastRevert = ret;
        }
        return super.transfer(to, amount);
    }
}

contract ReentrancyTest is Test {
    TrustPool pool;
    MockSwapAdapter dex;
    CallbackToken hook;
    address admin = makeAddr("admin");
    address caller = makeAddr("caller");

    function setUp() public {
        dex = new MockSwapAdapter();
        vm.deal(address(dex), 1_000 ether);
        pool = new TrustPool(admin, admin, dex);
        hook = new CallbackToken();
        dex.setPrice(address(hook), 1 ether);
        vm.prank(admin);
        pool.setAllowed(address(hook), true);
        vm.deal(caller, 1_000 ether);
        vm.prank(caller);
        pool.postBond{value: 100 ether}();
    }

    /// The token calls back while the buy is sending it to the pool.
    function _expectBlocked(bytes memory reentry) internal {
        TrustPool.Params memory p = pool.params();
        hook.arm(address(0), "");
        vm.prank(caller);
        uint256 id = pool.openCall{value: 60 ether}(address(hook), p.minWindow, 0, 2000, p.minHold, 0, "");
        vm.warp(block.timestamp + p.minWindow);
        hook.arm(address(pool), reentry);
        vm.prank(caller);
        pool.buy(id, 0);
        assertEq(bytes4(hook.lastRevert()), TrustPool.Reentrant.selector);
    }

    function test_everyEntryIsShutDuringASwap() public {
        _expectBlocked(abi.encodeCall(TrustPool.postBond, ()));
        _expectBlocked(abi.encodeCall(TrustPool.requestBondWithdraw, ()));
        _expectBlocked(abi.encodeCall(TrustPool.withdrawBond, ()));
        _expectBlocked(abi.encodeCall(TrustPool.deposit, (0)));
        _expectBlocked(abi.encodeCall(TrustPool.withdraw, (0, 1)));
        _expectBlocked(abi.encodeCall(TrustPool.buy, (0, 0)));
        _expectBlocked(abi.encodeCall(TrustPool.checkpoint, (0)));
        _expectBlocked(abi.encodeCall(TrustPool.sell, (0)));
        _expectBlocked(abi.encodeCall(TrustPool.refund, (0)));
        _expectBlocked(abi.encodeCall(TrustPool.split, (0)));
        _expectBlocked(abi.encodeCall(TrustPool.claim, (0)));
    }
}
