// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPoolManager, IUnlockCallback, ModifyLiquidityParams, PoolKey, V4} from "../interfaces/IUniswapV4.sol";

interface IERC20Seed {
    function transferFrom(address, address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
}

/// @notice Testnet setup only: creates a (MON, token) pool on Uniswap v4 and adds a
/// full-range position (`add` deepens an existing pool), so TrustPool has a real pool to trade against. The position is
/// owned by this contract and is never withdrawn; the MON put in is spent for good.
/// @dev Liquidity is chosen from the MON sent: L = mon * sqrtP / 2^96 for a full range,
/// and the token side is pulled from the sender (approve first). Unused MON is returned.
contract V4PoolSeeder is IUnlockCallback {
    IPoolManager public immutable manager;

    error NotManager();

    constructor(IPoolManager manager_) {
        manager = manager_;
    }

    receive() external payable {}

    /// @param sqrtPriceX96 initial price, as sqrt(token per MON) * 2^96
    function seed(PoolKey calldata key, uint160 sqrtPriceX96, uint256 tokenBudget)
        external
        payable
        returns (uint128 liquidity)
    {
        manager.initialize(key, sqrtPriceX96);
        liquidity = _add(key, sqrtPriceX96, tokenBudget);
    }

    /// @notice Adds another full-range position to a pool that already exists, to deepen it.
    /// @param sqrtPriceX96 the pool's current price; if it has moved down since it was read,
    /// the pool asks for more MON than was sent and the whole call reverts.
    function add(PoolKey calldata key, uint160 sqrtPriceX96, uint256 tokenBudget)
        external
        payable
        returns (uint128 liquidity)
    {
        liquidity = _add(key, sqrtPriceX96, tokenBudget);
    }

    function _add(PoolKey calldata key, uint160 sqrtPriceX96, uint256 tokenBudget)
        internal
        returns (uint128 liquidity)
    {
        liquidity = uint128((msg.value * uint256(sqrtPriceX96)) >> 96);
        // Shave 0.1% so rounding in the pool never asks for more MON than was sent.
        liquidity -= liquidity / 1000;
        manager.unlock(abi.encode(key, liquidity, msg.sender, tokenBudget));
        uint256 left = address(this).balance;
        if (left > 0) {
            (bool ok,) = msg.sender.call{value: left}("");
            require(ok);
        }
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(manager)) revert NotManager();
        (PoolKey memory key, uint128 liquidity, address payer, uint256 tokenBudget) =
            abi.decode(data, (PoolKey, uint128, address, uint256));
        int24 s = key.tickSpacing;
        int24 lower = (-887272 / s) * s;
        int24 upper = (887272 / s) * s;
        (int256 delta,) = manager.modifyLiquidity(
            key,
            ModifyLiquidityParams({
                tickLower: lower, tickUpper: upper, liquidityDelta: int256(uint256(liquidity)), salt: 0
            }),
            ""
        );
        uint256 owe0 = uint256(uint128(-V4.amount0(delta)));
        uint256 owe1 = uint256(uint128(-V4.amount1(delta)));
        require(owe1 <= tokenBudget, "token budget");
        manager.settle{value: owe0}();
        manager.sync(key.currency1);
        require(IERC20Seed(key.currency1).transferFrom(payer, address(manager), owe1));
        manager.settle();
        return "";
    }
}
