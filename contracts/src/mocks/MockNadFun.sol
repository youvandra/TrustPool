// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {INadFunRouter} from "../interfaces/INadFun.sol";
import {MockToken} from "./MockToken.sol";

/// @notice One fixed-price nad.fun router (curve or DEX). Mints on buy, burns on sell, pays MON
/// from its own balance. Tests only.
contract MockNadFunRouter is INadFunRouter {
    mapping(address => uint256) public price; // MON per token, 1e18-scaled

    error Slippage();
    error Expired();

    receive() external payable {}

    function setPrice(address token, uint256 p) external {
        price[token] = p;
    }

    function buy(BuyParams calldata p) external payable {
        if (block.timestamp > p.deadline) revert Expired();
        uint256 out = (msg.value * 1e18) / price[p.token];
        if (out < p.amountOutMin) revert Slippage();
        MockToken(p.token).mint(p.to, out);
    }

    function sell(SellParams calldata p) external {
        if (block.timestamp > p.deadline) revert Expired();
        MockToken(p.token).transferFrom(msg.sender, address(this), p.amountIn);
        uint256 out = (p.amountIn * price[p.token]) / 1e18;
        if (out < p.amountOutMin) revert Slippage();
        (bool ok,) = p.to.call{value: out}("");
        require(ok);
    }

    function quote(address token, uint256 amountIn, bool isBuy) external view returns (uint256) {
        return isBuy ? (amountIn * 1e18) / price[token] : (amountIn * price[token]) / 1e18;
    }
}

/// @notice Lens that names the curve router until a token graduates, then the DEX router.
contract MockNadFunLens {
    MockNadFunRouter public immutable curve;
    MockNadFunRouter public immutable dex;
    mapping(address => bool) public graduated;
    address public override_; // when set, the Lens names this router instead

    constructor(MockNadFunRouter curve_, MockNadFunRouter dex_) {
        curve = curve_;
        dex = dex_;
    }

    function graduate(address token) external {
        graduated[token] = true;
    }

    function setOverride(address router) external {
        override_ = router;
    }

    function getAmountOut(address token, uint256 amountIn, bool isBuy)
        external
        view
        returns (address router, uint256 amountOut)
    {
        MockNadFunRouter r = graduated[token] ? dex : curve;
        router = override_ != address(0) ? override_ : address(r);
        amountOut = r.quote(token, amountIn, isBuy);
    }
}
