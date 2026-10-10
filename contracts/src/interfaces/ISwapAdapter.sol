// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice One DEX behind one interface. TrustPool never talks to a router directly,
/// so moving from one Monad DEX to another means deploying a new adapter.
/// @dev TrustPool never trusts the amounts an adapter reports: it measures its own token
/// balance after `buy` and its own MON balance after `sell`. Tokens and MON only pass
/// through an adapter inside a single TrustPool transaction; an adapter holds nothing
/// between calls.
interface ISwapAdapter {
    /// @notice Buys `token` with the attached MON and sends the tokens to `to`.
    /// @return amountOut tokens the adapter reports; TrustPool measures its own balance anyway.
    function buy(address token, uint256 minOut, address to) external payable returns (uint256 amountOut);

    /// @notice Sells `amountIn` of `token`, already transferred to the adapter, and sends MON to `to`.
    /// A fee-on-transfer token may have delivered less than `amountIn`; the adapter sells what it holds.
    function sell(address token, uint256 amountIn, uint256 minOut, address to) external returns (uint256 monOut);

    /// @notice Tokens that `monIn` would buy right now, before any transfer fee.
    function quoteBuy(address token, uint256 monIn) external view returns (uint256 tokensOut);

    /// @notice MON that selling `amountIn` of `token` would return right now, before any transfer fee.
    function quoteSell(address token, uint256 amountIn) external view returns (uint256 monOut);
}
