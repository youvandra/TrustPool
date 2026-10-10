// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {TrustPool} from "../src/TrustPool.sol";
import {ISwapAdapter} from "../src/interfaces/ISwapAdapter.sol";
import {IUniswapV2Router02} from "../src/interfaces/IUniswapV2Router02.sol";
import {UniswapV2Adapter} from "../src/adapters/UniswapV2Adapter.sol";
import {NadFunAdapter} from "../src/adapters/NadFunAdapter.sol";
import {INadFunLens} from "../src/interfaces/INadFun.sol";
import {MockToken} from "../src/mocks/MockToken.sol";
import {MockSwapAdapter} from "../src/mocks/MockSwapAdapter.sol";

/// @notice Deploys TrustPool and its adapter, allows tokens, and writes
/// deployments/<chainId>.json for `npm run sync:contracts`.
///
/// Which adapter, in order:
///   NADFUN_LENS=0x... with NADFUN_CURVE_ROUTER and NADFUN_DEX_ROUTER
///                    deploy a NadFunAdapter (curve before graduation, DEX after)
///   V2_ROUTER=0x...  deploy a UniswapV2Adapter on that router (real DEX)
///   ADAPTER=0x...    reuse an adapter that is already deployed
///   (neither)        deploy the fixed-price mock DEX and two mock tokens, CHOG and MOE.
///                    For anvil, or a testnet without a usable pool; say so in the write-up.
///
/// Optional: ADMIN and TREASURY (default: the broadcaster), TOKENS=0xa,0xb (allowed on the
/// pool), MOCK_DEX_FUNDING (MON sent to the mock DEX to pay sales, default 100 ether).
///
///   anvil:   forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --private-key <anvil key 0>
///   testnet: V2_ROUTER=0x... TOKENS=0x... forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast --account <keystore>
contract Deploy is Script {
    struct Deployed {
        TrustPool pool;
        ISwapAdapter adapter;
        string adapterKind;
        address[] tokens;
    }

    function run() external virtual returns (Deployed memory d) {
        uint256 startBlock = block.number;
        vm.startBroadcast();
        // The broadcaster, from --account, --private-key or --sender. msg.sender here is
        // Foundry's default sender whenever the key comes from a keystore.
        (, address me,) = vm.readCallers();
        address admin = vm.envOr("ADMIN", me);
        address treasury = vm.envOr("TREASURY", admin);

        address router = vm.envOr("V2_ROUTER", address(0));
        address existing = vm.envOr("ADAPTER", address(0));
        address[] memory tokens = vm.envOr("TOKENS", ",", new address[](0));

        address nadLens = vm.envOr("NADFUN_LENS", address(0));

        if (nadLens != address(0)) {
            d.adapter = new NadFunAdapter(
                INadFunLens(nadLens), vm.envAddress("NADFUN_CURVE_ROUTER"), vm.envAddress("NADFUN_DEX_ROUTER")
            );
            d.adapterKind = "nadfun";
        } else if (router != address(0)) {
            d.adapter = new UniswapV2Adapter(IUniswapV2Router02(router));
            d.adapterKind = "uniswap-v2";
        } else if (existing != address(0)) {
            d.adapter = ISwapAdapter(existing);
            d.adapterKind = "existing";
        } else {
            (d.adapter, tokens) = _mockDex(tokens);
            d.adapterKind = "mock";
        }

        // Deploy with the broadcaster as admin so it can allow tokens, then hand over.
        d.pool = new TrustPool(me, treasury, d.adapter);
        for (uint256 i; i < tokens.length; ++i) {
            d.pool.setAllowed(tokens[i], true);
        }
        if (admin != me) d.pool.transferAdmin(admin); // the new admin calls acceptAdmin()
        vm.stopBroadcast();

        d.tokens = tokens;
        _write(d, admin, treasury, startBlock);
    }

    function _mockDex(address[] memory extra) internal returns (ISwapAdapter, address[] memory tokens) {
        MockSwapAdapter dex = new MockSwapAdapter();
        payable(address(dex)).transfer(vm.envOr("MOCK_DEX_FUNDING", uint256(100 ether)));
        MockToken chog = new MockToken("Chog", "CHOG", 0);
        MockToken moe = new MockToken("Moe", "MOE", 0);
        dex.setPrice(address(chog), 0.002 ether);
        dex.setPrice(address(moe), 0.05 ether);
        tokens = new address[](extra.length + 2);
        tokens[0] = address(chog);
        tokens[1] = address(moe);
        for (uint256 i; i < extra.length; ++i) {
            tokens[i + 2] = extra[i];
        }
        return (dex, tokens);
    }

    function _write(Deployed memory d, address admin, address treasury, uint256 startBlock) internal {
        string memory k = "deployment";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeUint(k, "startBlock", startBlock);
        vm.serializeAddress(k, "trustPool", address(d.pool));
        vm.serializeAddress(k, "adapter", address(d.adapter));
        vm.serializeString(k, "adapterKind", d.adapterKind);
        vm.serializeAddress(k, "admin", admin);
        vm.serializeAddress(k, "treasury", treasury);
        string memory json = vm.serializeAddress(k, "tokens", d.tokens);
        string memory path = string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);

        console.log("TrustPool", address(d.pool));
        console.log("Adapter  ", address(d.adapter), d.adapterKind);
        for (uint256 i; i < d.tokens.length; ++i) {
            console.log("Token    ", d.tokens[i]);
        }
        console.log("Wrote    ", path);
    }
}
