// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ISwapAdapter} from "../interfaces/ISwapAdapter.sol";
import {MockToken} from "./MockToken.sol";

/// @notice Fixed-price DEX for tests and the local chain. Price is MON per token, 1e18-scaled.
/// It mints on buy and holds MON to pay sells, so tests can move the price freely.
contract MockSwapAdapter is ISwapAdapter {
    mapping(address => uint256) public price;
    mapping(address => bool) public frozen; // simulates a token whose liquidity is gone

    error Slippage();
    error Frozen();

    receive() external payable {}

    function setPrice(address token, uint256 monPerToken) external {
        price[token] = monPerToken;
    }

    function setFrozen(address token, bool f) external {
        frozen[token] = f;
    }

    function buy(address token, uint256 minOut, address to) external payable returns (uint256 out) {
        out = (msg.value * 1e18) / price[token];
        if (out < minOut) revert Slippage();
        MockToken(token).mint(address(this), out);
        MockToken(token).transfer(to, out);
    }

    function sell(address token, uint256 amountIn, uint256 minOut, address to) external returns (uint256 monOut) {
        if (frozen[token]) revert Frozen();
        monOut = (amountIn * price[token]) / 1e18;
        if (monOut < minOut) revert Slippage();
        (bool ok,) = to.call{value: monOut}("");
        require(ok);
    }
}
