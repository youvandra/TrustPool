// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ISwapAdapter} from "../interfaces/ISwapAdapter.sol";
import {INadFunLens, INadFunRouter} from "../interfaces/INadFun.sol";

interface IERC20NadFun {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
}

/// @notice Trades on nad.fun, where most Monad tokens have their deepest market (docs/product.md).
/// A token trades on its bonding curve until it graduates, then on nad.fun's DEX; the Lens says
/// which router is live, so a call opened on the curve can still settle after graduation.
/// @dev Stateless and permissionless, like UniswapV2Adapter: tokens pass through only inside one
/// TrustPool transaction. The Lens is trusted for quotes only: the router it names must be one
/// of the two routers fixed at deployment, so a replaced Lens can never route funds elsewhere.
contract NadFunAdapter is ISwapAdapter {
    INadFunLens public immutable lens;
    address public immutable curveRouter;
    address public immutable dexRouter;

    error ZeroAddress();
    error UnknownRouter(address router);
    error NothingToSell();
    error ApproveFailed();

    constructor(INadFunLens lens_, address curveRouter_, address dexRouter_) {
        if (address(lens_) == address(0) || curveRouter_ == address(0) || dexRouter_ == address(0)) {
            revert ZeroAddress();
        }
        lens = lens_;
        curveRouter = curveRouter_;
        dexRouter = dexRouter_;
    }

    /// @inheritdoc ISwapAdapter
    function buy(address token, uint256 minOut, address to) external payable returns (uint256 amountOut) {
        INadFunRouter router = _router(token, msg.value, true);
        uint256 before = IERC20NadFun(token).balanceOf(to);
        router.buy{value: msg.value}(INadFunRouter.BuyParams(minOut, token, to, block.timestamp));
        amountOut = IERC20NadFun(token).balanceOf(to) - before;
    }

    /// @inheritdoc ISwapAdapter
    function sell(address token, uint256, uint256 minOut, address to) external returns (uint256 monOut) {
        uint256 amount = IERC20NadFun(token).balanceOf(address(this));
        if (amount == 0) revert NothingToSell();
        INadFunRouter router = _router(token, amount, false);
        _approve(token, address(router), amount);
        uint256 before = to.balance;
        router.sell(INadFunRouter.SellParams(amount, minOut, token, to, block.timestamp));
        monOut = to.balance - before;
    }

    /// @inheritdoc ISwapAdapter
    function quoteBuy(address token, uint256 monIn) external view returns (uint256 tokensOut) {
        if (monIn == 0) return 0;
        (, tokensOut) = lens.getAmountOut(token, monIn, true);
    }

    /// @inheritdoc ISwapAdapter
    function quoteSell(address token, uint256 amountIn) external view returns (uint256 monOut) {
        if (amountIn == 0) return 0;
        (, monOut) = lens.getAmountOut(token, amountIn, false);
    }

    function _router(address token, uint256 amountIn, bool isBuy) internal view returns (INadFunRouter) {
        (address router,) = lens.getAmountOut(token, amountIn, isBuy);
        if (router != curveRouter && router != dexRouter) revert UnknownRouter(router);
        return INadFunRouter(router);
    }

    function _approve(address token, address spender, uint256 amount) internal {
        _call(token, abi.encodeCall(IERC20NadFun.approve, (spender, 0)));
        _call(token, abi.encodeCall(IERC20NadFun.approve, (spender, amount)));
    }

    function _call(address token, bytes memory data) internal {
        (bool ok, bytes memory ret) = token.call(data);
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert ApproveFailed();
    }
}
