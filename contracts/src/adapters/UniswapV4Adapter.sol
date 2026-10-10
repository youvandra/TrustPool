// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ISwapAdapter} from "../interfaces/ISwapAdapter.sol";
import {IPoolManager, IStateView, IUnlockCallback, PoolKey, SwapParams, V4} from "../interfaces/IUniswapV4.sol";
import {FullMath} from "../libraries/FullMath.sol";

interface IERC20V4 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
}

/// @notice Swaps native MON <-> token through Uniswap v4's PoolManager, in the pool
/// (MON, token, `fee`, `tickSpacing`, no hooks). Native MON is currency0 in every such pool,
/// so no wrapped MON is involved.
/// @dev Stateless and permissionless, like the V2 adapter: tokens pass through only inside one
/// TrustPool transaction. A trade is one `unlock`: swap, pay what the pool is owed, take what
/// it owes. Partial fills revert, so TrustPool's recorded MON in is always what was spent.
/// Fee-on-transfer tokens are unsupported: the pool would receive less than it is owed.
contract UniswapV4Adapter is ISwapAdapter, IUnlockCallback {
    IPoolManager public immutable manager;
    IStateView public immutable stateView;
    uint24 public immutable fee;
    int24 public immutable tickSpacing;

    uint256 private constant Q96 = 2 ** 96;
    uint256 private constant PIPS = 1_000_000;

    error ZeroAddress();
    error NotManager();
    error NothingToSell();
    error PartialFill();
    error Slippage();
    error TransferFailed();

    constructor(IPoolManager manager_, IStateView stateView_, uint24 fee_, int24 tickSpacing_) {
        if (address(manager_) == address(0) || address(stateView_) == address(0)) revert ZeroAddress();
        manager = manager_;
        stateView = stateView_;
        fee = fee_;
        tickSpacing = tickSpacing_;
    }

    /// @notice The pool this adapter trades `token` in.
    function poolKey(address token) public view returns (PoolKey memory) {
        return PoolKey({currency0: address(0), currency1: token, fee: fee, tickSpacing: tickSpacing, hooks: address(0)});
    }

    /// @inheritdoc ISwapAdapter
    function buy(address token, uint256 minOut, address to) external payable returns (uint256 amountOut) {
        bytes memory ret = manager.unlock(abi.encode(true, token, msg.value, minOut, to));
        amountOut = abi.decode(ret, (uint256));
    }

    /// @inheritdoc ISwapAdapter
    function sell(address token, uint256, uint256 minOut, address to) external returns (uint256 monOut) {
        uint256 amount = IERC20V4(token).balanceOf(address(this));
        if (amount == 0) revert NothingToSell();
        bytes memory ret = manager.unlock(abi.encode(false, token, amount, minOut, to));
        monOut = abi.decode(ret, (uint256));
    }

    /// @dev Runs inside PoolManager.unlock. Exact input: MON for tokens on a buy, tokens for MON on a sell.
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(manager)) revert NotManager();
        (bool isBuy, address token, uint256 amountIn, uint256 minOut, address to) =
            abi.decode(data, (bool, address, uint256, uint256, address));
        PoolKey memory key = poolKey(token);

        int256 delta = manager.swap(
            key,
            SwapParams({
                zeroForOne: isBuy,
                amountSpecified: -int256(amountIn),
                sqrtPriceLimitX96: isBuy ? V4.MIN_SQRT_PRICE + 1 : V4.MAX_SQRT_PRICE - 1
            }),
            ""
        );
        int128 d0 = V4.amount0(delta); // MON, from the adapter's side
        int128 d1 = V4.amount1(delta); // token

        uint256 out;
        if (isBuy) {
            if (uint256(uint128(-d0)) != amountIn) revert PartialFill();
            out = uint256(uint128(d1));
            if (out < minOut) revert Slippage();
            manager.settle{value: amountIn}();
            manager.take(token, to, out);
        } else {
            if (uint256(uint128(-d1)) != amountIn) revert PartialFill();
            out = uint256(uint128(d0));
            if (out < minOut) revert Slippage();
            manager.sync(token);
            if (!IERC20V4(token).transfer(address(manager), amountIn)) revert TransferFailed();
            manager.settle();
            manager.take(address(0), to, out);
        }
        return abi.encode(out);
    }

    /// @inheritdoc ISwapAdapter
    /// @dev Single-range swap math with the pool's own rounding. Matches a real fill to a few
    /// wei while the trade stays inside the active range, which a full-range pool always is.
    /// Pools with several ranges make it an estimate; callers pass a slippage margin anyway.
    function quoteBuy(address token, uint256 monIn) external view returns (uint256) {
        (uint256 sqrtP, uint256 liq, uint256 lpFee) = _state(token);
        if (monIn == 0 || liq == 0) return 0;
        uint256 inLessFee = (monIn * (PIPS - lpFee)) / PIPS;
        // currency0 in: next = L*Q96*sqrtP / (L*Q96 + in*sqrtP), rounded up as the pool does
        uint256 num = liq * Q96;
        uint256 next = FullMath.mulDivRoundingUp(num, sqrtP, num + inLessFee * sqrtP);
        return FullMath.mulDiv(liq, sqrtP - next, Q96);
    }

    /// @inheritdoc ISwapAdapter
    function quoteSell(address token, uint256 amountIn) external view returns (uint256) {
        (uint256 sqrtP, uint256 liq, uint256 lpFee) = _state(token);
        if (amountIn == 0 || liq == 0) return 0;
        uint256 inLessFee = (amountIn * (PIPS - lpFee)) / PIPS;
        // currency1 in: next = sqrtP + in*Q96/L; out0 = L*Q96*(next - sqrtP) / (next*sqrtP)
        uint256 next = sqrtP + FullMath.mulDiv(inLessFee, Q96, liq);
        return FullMath.mulDiv(liq * Q96, next - sqrtP, next) / sqrtP;
    }

    function _state(address token) internal view returns (uint256 sqrtP, uint256 liq, uint256 lpFee) {
        bytes32 id = V4.id(poolKey(token));
        uint24 f;
        (sqrtP,,, f) = stateView.getSlot0(id);
        liq = stateView.getLiquidity(id);
        lpFee = f;
    }
}
