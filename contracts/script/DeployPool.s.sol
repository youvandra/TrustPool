// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Deploy} from "./Deploy.s.sol";
import {TrustPool} from "../src/TrustPool.sol";
import {UniswapV4Adapter} from "../src/adapters/UniswapV4Adapter.sol";
import {IStateView, PoolKey, V4} from "../src/interfaces/IUniswapV4.sol";
import {V4PoolSeeder} from "../src/v4/V4PoolSeeder.sol";

interface IERC20Approve {
    function approve(address, uint256) external returns (bool);
}

/// @notice Monad testnet, pooled calls: a new TrustPool with demo params on the UniswapV4Adapter
/// and the two demo tokens that DeployV4.s.sol already put on chain. Optionally deepens both
/// pools first, because a pooled buy must move the price at most 2%: with 1 MON of depth that
/// caps a pool near 0.02 MON, under the 0.05 MON minimum. Writes deployments/<chainId>.json.
///
///   cd contracts
///   ADD_MON=4 forge script script/DeployPool.s.sol --network monad --rpc-url monad_testnet --broadcast --account trustpool-deployer
///
/// Env (all optional): ADD_MON (MON added to each pool, default 0; the token side comes from the
/// broadcaster, who holds the demo token supply), ADAPTER and TOKENS to override the addresses.
contract DeployPool is Deploy {
    address constant TESTNET_ADAPTER = 0xA50d9454E71aCf152399C872815ae6895cB53229;
    address constant TCHOG = 0x12d15135b5bBa8EEF0d1098Aa65A15AF503d09c9;
    address constant TMOE = 0x2A8361Ac23F5FfcFDe9f0D7BC7618178770332d0;

    function run() external override returns (Deployed memory d) {
        uint256 startBlock = block.number;
        UniswapV4Adapter adapter = UniswapV4Adapter(vm.envOr("ADAPTER", TESTNET_ADAPTER));
        address[] memory defaults = new address[](2);
        defaults[0] = TCHOG;
        defaults[1] = TMOE;
        address[] memory tokens = vm.envOr("TOKENS", ",", defaults);
        uint256 addMon = vm.envOr("ADD_MON", uint256(0));
        require(address(adapter).code.length != 0, "no adapter at ADAPTER");

        vm.startBroadcast();
        (, address me,) = vm.readCallers();
        if (addMon != 0) {
            V4PoolSeeder seeder = new V4PoolSeeder(adapter.manager());
            IStateView sv = adapter.stateView();
            for (uint256 i; i < tokens.length; ++i) {
                PoolKey memory key = adapter.poolKey(tokens[i]);
                (uint160 sqrtP,,,) = sv.getSlot0(V4.id(key));
                require(sqrtP != 0, "pool not initialized");
                IERC20Approve(tokens[i]).approve(address(seeder), type(uint256).max);
                seeder.add{value: addMon}(key, sqrtP, type(uint256).max);
                IERC20Approve(tokens[i]).approve(address(seeder), 0);
            }
        }

        d.pool = new TrustPool(me, me, adapter);
        for (uint256 i; i < tokens.length; ++i) {
            d.pool.setAllowed(tokens[i], true);
        }
        d.pool.setParams(_demoParams());
        vm.stopBroadcast();

        d.adapter = adapter;
        d.adapterKind = "uniswap-v4";
        d.tokens = tokens;
        _write(d, me, me, startBlock);
    }
}
