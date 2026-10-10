// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {MockToken} from "./MockToken.sol";

/// @notice Constant-product router with Uniswap V2 maths (0.3% fee) for one hop against MON.
/// Holds its own reserves, measures what arrives like the real fee-on-transfer functions,
/// and exposes the V2 surface UniswapV2Adapter needs. Tests only.
contract MockUniswapV2Router {
    address public immutable WETH = address(uint160(uint256(keccak256("trustpool.mock.wmon"))));

    mapping(address => uint256) public reserveMon;
    mapping(address => uint256) public reserveToken;

    error Expired();
    error BadPath();
    error InsufficientOutput();
    error NoLiquidity();

    /// @notice Seeds a pool: the attached MON against `tokenAmount` freshly minted tokens.
    function seed(MockToken token, uint256 tokenAmount) external payable {
        token.mint(address(this), tokenAmount);
        reserveMon[address(token)] += msg.value;
        reserveToken[address(token)] = token.balanceOf(address(this));
    }

    /// @notice Drains a pool's MON side, for a token whose liquidity is gone.
    function rug(address token) external {
        reserveMon[token] = 0;
    }

    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory a) {
        if (path.length != 2) revert BadPath();
        a = new uint256[](2);
        a[0] = amountIn;
        if (path[0] == WETH) a[1] = _out(amountIn, reserveMon[path[1]], reserveToken[path[1]]);
        else if (path[1] == WETH) a[1] = _out(amountIn, reserveToken[path[0]], reserveMon[path[0]]);
        else revert BadPath();
    }

    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable {
        if (block.timestamp > deadline) revert Expired();
        if (path.length != 2 || path[0] != WETH) revert BadPath();
        MockToken token = MockToken(path[1]);
        uint256 out = _out(msg.value, reserveMon[path[1]], reserveToken[path[1]]);
        reserveMon[path[1]] += msg.value;
        uint256 before = token.balanceOf(to);
        token.transfer(to, out);
        reserveToken[path[1]] = token.balanceOf(address(this));
        if (token.balanceOf(to) - before < amountOutMin) revert InsufficientOutput();
    }

    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external {
        if (block.timestamp > deadline) revert Expired();
        if (path.length != 2 || path[1] != WETH) revert BadPath();
        MockToken token = MockToken(path[0]);
        token.transferFrom(msg.sender, address(this), amountIn);
        uint256 arrived = token.balanceOf(address(this)) - reserveToken[path[0]];
        uint256 out = _out(arrived, reserveToken[path[0]], reserveMon[path[0]]);
        if (out < amountOutMin) revert InsufficientOutput();
        reserveToken[path[0]] += arrived;
        reserveMon[path[0]] -= out;
        (bool ok,) = to.call{value: out}("");
        require(ok);
    }

    function _out(uint256 amountIn, uint256 rIn, uint256 rOut) internal pure returns (uint256) {
        if (rIn == 0 || rOut == 0) revert NoLiquidity();
        uint256 inWithFee = amountIn * 997;
        return (inWithFee * rOut) / (rIn * 1000 + inWithFee);
    }
}
