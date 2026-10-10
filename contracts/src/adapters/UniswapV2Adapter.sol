// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ISwapAdapter} from "../interfaces/ISwapAdapter.sol";
import {IUniswapV2Router02} from "../interfaces/IUniswapV2Router02.sol";

interface IERC20Approve {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
}

/// @notice Swaps MON <-> token on a Uniswap V2 style router through the direct WMON pair.
/// @dev Stateless and permissionless: tokens pass through only inside one TrustPool
/// transaction, so there is nothing here to protect between calls. Uses the router's
/// fee-on-transfer-safe functions, so a taxed token settles for what actually moved.
/// The router wraps and unwraps MON itself and pays MON straight to `to`.
contract UniswapV2Adapter is ISwapAdapter {
    IUniswapV2Router02 public immutable router;
    address public immutable wmon;

    error ZeroAddress();
    error NothingToSell();
    error ApproveFailed();

    constructor(IUniswapV2Router02 router_) {
        if (address(router_) == address(0)) revert ZeroAddress();
        router = router_;
        wmon = router_.WETH();
    }

    /// @inheritdoc ISwapAdapter
    function buy(address token, uint256 minOut, address to) external payable returns (uint256 amountOut) {
        uint256 before = IERC20Approve(token).balanceOf(to);
        router.swapExactETHForTokensSupportingFeeOnTransferTokens{value: msg.value}(
            minOut, _path(wmon, token), to, block.timestamp
        );
        amountOut = IERC20Approve(token).balanceOf(to) - before;
    }

    /// @inheritdoc ISwapAdapter
    function sell(address token, uint256, uint256 minOut, address to) external returns (uint256 monOut) {
        // Sell what arrived, not what was sent: a transfer fee may have taken a slice.
        uint256 amount = IERC20Approve(token).balanceOf(address(this));
        if (amount == 0) revert NothingToSell();
        _approve(token, amount);
        uint256 before = to.balance;
        router.swapExactTokensForETHSupportingFeeOnTransferTokens(
            amount, minOut, _path(token, wmon), to, block.timestamp
        );
        monOut = to.balance - before;
    }

    /// @inheritdoc ISwapAdapter
    function quoteBuy(address token, uint256 monIn) external view returns (uint256) {
        return _quote(monIn, _path(wmon, token));
    }

    /// @inheritdoc ISwapAdapter
    function quoteSell(address token, uint256 amountIn) external view returns (uint256) {
        return _quote(amountIn, _path(token, wmon));
    }

    function _quote(uint256 amountIn, address[] memory path) internal view returns (uint256) {
        if (amountIn == 0) return 0;
        uint256[] memory amounts = router.getAmountsOut(amountIn, path);
        return amounts[amounts.length - 1];
    }

    /// @dev Exact approval each time, reset to zero first for tokens that refuse to change a
    /// non-zero allowance (USDT style). Tolerates tokens that return nothing.
    function _approve(address token, uint256 amount) internal {
        _call(token, abi.encodeCall(IERC20Approve.approve, (address(router), 0)));
        _call(token, abi.encodeCall(IERC20Approve.approve, (address(router), amount)));
    }

    function _call(address token, bytes memory data) internal {
        (bool ok, bytes memory ret) = token.call(data);
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert ApproveFailed();
    }

    function _path(address a, address b) internal pure returns (address[] memory p) {
        p = new address[](2);
        p[0] = a;
        p[1] = b;
    }
}
