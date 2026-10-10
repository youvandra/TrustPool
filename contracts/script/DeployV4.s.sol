// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Deploy} from "./Deploy.s.sol";
import {TrustPool} from "../src/TrustPool.sol";
import {UniswapV4Adapter} from "../src/adapters/UniswapV4Adapter.sol";
import {IPoolManager, IStateView} from "../src/interfaces/IUniswapV4.sol";
import {DemoToken} from "../src/v4/DemoToken.sol";
import {V4PoolSeeder} from "../src/v4/V4PoolSeeder.sol";

/// @notice Monad testnet on Uniswap v4: two fixed-supply demo tokens, a (MON, token) v4 pool
/// for each seeded with full-range liquidity from the broadcaster, a UniswapV4Adapter, and
/// TrustPool with demo-sized params. Writes deployments/<chainId>.json like Deploy.s.sol.
///
///   cd contracts
///   forge script script/DeployV4.s.sol --network monad --rpc-url monad_testnet --broadcast --account <keystore>
///
/// Env (all optional): V4_POOL_MANAGER, V4_STATE_VIEW (default: Monad testnet), SEED_MON (MON
/// per pool, default 1), DEMO_PARAMS=0 to keep the contract's production defaults.
/// The seeded MON stays in the pools for good; the seeder never withdraws.
contract DeployV4 is Deploy {
    address constant TESTNET_MANAGER = 0x451D64ab3b650040d2aE1886602b97ed6eDc643d;
    address constant TESTNET_STATE_VIEW = 0xB639209539c61BaF67AC04876315786F8D0b153c;
    uint160 constant SQRT_500 = 1771595571142957102961017161607; // 500 tCHOG per MON (0.002 MON each)
    uint160 constant SQRT_20 = 354319114228591420592203432321; // 20 tMOE per MON (0.05 MON each)
    uint256 constant SUPPLY = 1_000_000_000 ether;

    function run() external override returns (Deployed memory d) {
        uint256 startBlock = block.number;
        IPoolManager manager = IPoolManager(vm.envOr("V4_POOL_MANAGER", TESTNET_MANAGER));
        IStateView stateView = IStateView(vm.envOr("V4_STATE_VIEW", TESTNET_STATE_VIEW));
        uint256 seedMon = vm.envOr("SEED_MON", uint256(1 ether));

        vm.startBroadcast();
        address me = msg.sender;
        UniswapV4Adapter adapter = new UniswapV4Adapter(manager, stateView, 3000, 60);
        V4PoolSeeder seeder = new V4PoolSeeder(manager);

        d.tokens = new address[](2);
        d.tokens[0] = _pool(adapter, seeder, "Test Chog", "tCHOG", SQRT_500, seedMon, me);
        d.tokens[1] = _pool(adapter, seeder, "Test Moe", "tMOE", SQRT_20, seedMon, me);

        d.pool = new TrustPool(me, me, adapter);
        for (uint256 i; i < d.tokens.length; ++i) {
            d.pool.setAllowed(d.tokens[i], true);
        }
        if (vm.envOr("DEMO_PARAMS", true)) {
            // Small enough to demo with faucet MON, short enough to film a whole call.
            d.pool
                .setParams(
                    TrustPool.Params({
                        minBond: 0.5 ether,
                        minLock: 10 minutes,
                        maxLock: 30 days,
                        minNotice: 5 minutes,
                        bondCooldown: 1 hours,
                        releaseGrace: 10 minutes,
                        maxHold: 1 days
                    })
                );
        }
        vm.stopBroadcast();

        d.adapter = adapter;
        d.adapterKind = "uniswap-v4";
        _write(d, me, me, startBlock);
    }

    function _pool(
        UniswapV4Adapter adapter,
        V4PoolSeeder seeder,
        string memory name,
        string memory symbol,
        uint160 sqrtPrice,
        uint256 seedMon,
        address me
    ) internal returns (address) {
        DemoToken t = new DemoToken(name, symbol, SUPPLY, me);
        t.approve(address(seeder), SUPPLY);
        seeder.seed{value: seedMon}(adapter.poolKey(address(t)), sqrtPrice, SUPPLY);
        return address(t);
    }
}
