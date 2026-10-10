// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice The subset of the Uniswap V2 router that UniswapV2Adapter uses. PancakeSwap V2 and
/// most V2 forks on Monad expose the same functions (some name `WETH` differently; check first).
interface IUniswapV2Router02 {
    function WETH() external view returns (address);

    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts);

    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable;

    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external;
}
