// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {TrustPool} from "../src/TrustPool.sol";
import {UniswapV2Adapter} from "../src/adapters/UniswapV2Adapter.sol";
import {IUniswapV2Router02} from "../src/interfaces/IUniswapV2Router02.sol";
import {MockToken} from "../src/mocks/MockToken.sol";
import {MockUniswapV2Router} from "../src/mocks/MockUniswapV2Router.sol";

/// @notice Full lifecycle through UniswapV2Adapter on a constant-product router.
contract UniswapV2AdapterTest is Test {
    TrustPool pool;
    UniswapV2Adapter adapter;
    MockUniswapV2Router router;
    MockToken chog;
    MockToken taxed;

    address admin = makeAddr("admin");
    address caller = makeAddr("caller");
    address whale = makeAddr("whale");

    function setUp() public {
        router = new MockUniswapV2Router();
        adapter = new UniswapV2Adapter(IUniswapV2Router02(address(router)));
        pool = new TrustPool(admin, admin, adapter);

        chog = new MockToken("Chog", "CHOG", 0);
        taxed = new MockToken("Tax", "TAX", 300);
        vm.deal(address(this), 20_000 ether);
        router.seed{value: 10_000 ether}(chog, 5_000_000 ether);
        router.seed{value: 10_000 ether}(taxed, 10_000 ether);

        vm.startPrank(admin);
        pool.setAllowed(address(chog), true);
        pool.setAllowed(address(taxed), true);
        vm.stopPrank();

        vm.deal(caller, 1_000 ether);
        vm.prank(caller);
        pool.postBond{value: 10 ether}();
    }

    function _open(MockToken t, uint256 mon, uint256 minOut) internal returns (uint256 id) {
        vm.prank(caller);
        id = pool.openCall{value: mon}(address(t), 1 days, 6 hours, minOut, "v2");
    }

    function _exitAfterLock(uint256 id, uint256 minOut) internal {
        vm.prank(caller);
        pool.announceExit(id);
        vm.warp(block.timestamp + 1 days);
        vm.prank(caller);
        pool.executeExit(id, minOut);
    }

    function test_readsWmonFromRouter() public view {
        assertEq(adapter.wmon(), router.WETH());
    }

    function test_buyMatchesQuote() public {
        uint256 quoted = adapter.quoteBuy(address(chog), 100 ether);
        uint256 id = _open(chog, 100 ether, quoted);
        assertEq(pool.getCall(id).tokens, quoted);
    }

    function test_buyRevertsBelowMinOut() public {
        uint256 quoted = adapter.quoteBuy(address(chog), 100 ether);
        vm.prank(caller);
        vm.expectRevert(MockUniswapV2Router.InsufficientOutput.selector);
        pool.openCall{value: 100 ether}(address(chog), 1 days, 6 hours, quoted + 1, "");
    }

    function test_roundTripLosesOnlyFees() public {
        uint256 id = _open(chog, 100 ether, 0);
        uint256 quoted = adapter.quoteSell(address(chog), pool.getCall(id).tokens);
        uint256 before = caller.balance;
        _exitAfterLock(id, quoted);
        uint256 got = caller.balance - before;
        assertEq(got, quoted);
        assertEq(pool.getCall(id).monOut, got);
        // two 0.3% fees plus price impact on a deep pool: a small, recorded loss
        TrustPool.Record memory r = pool.recordOf(caller);
        assertEq(r.losses, 1);
        assertLt(r.sumReturnBps, 0);
        assertGt(r.sumReturnBps, -100);
        assertEq(chog.balanceOf(address(adapter)), 0);
        assertEq(address(adapter).balance, 0);
    }

    function test_gainAfterOthersBuy() public {
        uint256 id = _open(chog, 100 ether, 0);
        // someone else buys after the call; the caller's exit reflects the new price
        vm.deal(whale, 2_000 ether);
        address[] memory path = new address[](2);
        path[0] = router.WETH();
        path[1] = address(chog);
        vm.prank(whale);
        router.swapExactETHForTokensSupportingFeeOnTransferTokens{value: 2_000 ether}(0, path, whale, block.timestamp);
        _exitAfterLock(id, 0);
        assertGt(pool.recordOf(caller).sumReturnBps, 0);
    }

    function test_feeOnTransferBothWays() public {
        uint256 id = _open(taxed, 10 ether, 0);
        uint256 tokens = pool.getCall(id).tokens;
        // 3% burned on the way in
        uint256 monIn = 10 ether;
        uint256 reserve = 10_000 ether;
        uint256 gross = (monIn * 997 * reserve) / (reserve * 1000 + monIn * 997);
        assertEq(tokens, gross - (gross * 300) / 10_000);
        // and 3% more on the way out, to the adapter and again to the router
        _exitAfterLock(id, 0);
        assertEq(uint8(pool.getCall(id).state), uint8(TrustPool.State.Settled));
        assertEq(taxed.balanceOf(address(adapter)), 0);
        assertLt(pool.recordOf(caller).sumReturnBps, -800);
    }

    function test_rugLeadsToRelease() public {
        uint256 id = _open(chog, 100 ether, 0);
        vm.prank(caller);
        pool.announceExit(id);
        vm.warp(block.timestamp + 1 days);
        router.rug(address(chog));
        vm.prank(caller);
        vm.expectRevert(MockUniswapV2Router.NoLiquidity.selector);
        pool.executeExit(id, 0);
        vm.warp(block.timestamp + 6 hours);
        vm.prank(caller);
        pool.releaseTokens(id);
        assertEq(pool.recordOf(caller).sumReturnBps, -10_000);
    }

    function test_quotesZeroForZero() public view {
        assertEq(adapter.quoteBuy(address(chog), 0), 0);
        assertEq(adapter.quoteSell(address(chog), 0), 0);
    }
}
