// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice The subset of nad.fun's v3 contracts NadFunAdapter uses, from the official ABIs at
/// github.com/Naddotfun/contract-v3-abi. The bonding-curve router (before graduation) and the
/// DEX router (after) share these trade structs.
interface INadFunLens {
    /// @return router the router that trades `token` right now (curve or DEX)
    function getAmountOut(address token, uint256 amountIn, bool isBuy)
        external
        view
        returns (address router, uint256 amountOut);
}

interface INadFunRouter {
    struct BuyParams {
        uint256 amountOutMin;
        address token;
        address to;
        uint256 deadline;
    }

    struct SellParams {
        uint256 amountIn;
        uint256 amountOutMin;
        address token;
        address to;
        uint256 deadline;
    }

    /// @dev The DEX router returns amountOut, the curve router returns nothing. Declared without
    /// a return value so one interface fits both; the adapter measures balances anyway.
    function buy(BuyParams calldata params) external payable;

    function sell(SellParams calldata params) external;
}
