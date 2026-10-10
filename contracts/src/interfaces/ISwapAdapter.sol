// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice One DEX behind one interface. TrustPool never talks to a router directly,
/// so moving from one Monad DEX to another means deploying a new adapter.
interface ISwapAdapter {
    /// @notice Buys `token` with the attached MON and sends the tokens to `to`.
    /// @return amountOut tokens the adapter reports; TrustPool measures its own balance anyway.
    function buy(address token, uint256 minOut, address to) external payable returns (uint256 amountOut);

    /// @notice Sells `amountIn` of `token`, already transferred to the adapter, and sends MON to `to`.
    function sell(address token, uint256 amountIn, uint256 minOut, address to) external returns (uint256 monOut);
}
