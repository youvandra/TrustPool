// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ISwapAdapter} from "../interfaces/ISwapAdapter.sol";
import {MockToken} from "./MockToken.sol";

/// @notice Fixed-price DEX for tests and the local chain. Price is MON per token, 1e18-scaled.
/// It mints on buy and holds MON to pay sells, so tests can move the price freely.
contract MockSwapAdapter is ISwapAdapter {
    mapping(address => uint256) public price;
    mapping(address => bool) public frozen; // simulates a token whose liquidity is gone
    uint16 public shortBps; // pays this much less than it reports, to test that TrustPool measures

    error Slippage();
    error Frozen();
    error NoPrice();

    receive() external payable {}

    function setPrice(address token, uint256 monPerToken) external {
        price[token] = monPerToken;
    }

    function setFrozen(address token, bool f) external {
        frozen[token] = f;
    }

    function setShort(uint16 bps) external {
        shortBps = bps;
    }

    function buy(address token, uint256 minOut, address to) external payable returns (uint256 out) {
        out = _buyQuote(token, msg.value);
        if (out < minOut) revert Slippage();
        MockToken(token).mint(address(this), out);
        MockToken(token).transfer(to, out);
    }

    function sell(address token, uint256 amountIn, uint256 minOut, address to) external returns (uint256 monOut) {
        if (frozen[token]) revert Frozen();
        monOut = _sellQuote(token, amountIn);
        if (monOut < minOut) revert Slippage();
        uint256 paid = monOut - (monOut * shortBps) / 10_000;
        (bool ok,) = to.call{value: paid}("");
        require(ok);
    }

    function quoteBuy(address token, uint256 monIn) external view returns (uint256) {
        return _buyQuote(token, monIn);
    }

    function quoteSell(address token, uint256 amountIn) external view returns (uint256) {
        return _sellQuote(token, amountIn);
    }

    function _buyQuote(address token, uint256 monIn) internal view returns (uint256) {
        if (price[token] == 0) revert NoPrice();
        return (monIn * 1e18) / price[token];
    }

    function _sellQuote(address token, uint256 amountIn) internal view returns (uint256) {
        return (amountIn * price[token]) / 1e18;
    }
}
