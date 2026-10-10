// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {TrustPool} from "../src/TrustPool.sol";
import {MockToken} from "../src/mocks/MockToken.sol";
import {MockSwapAdapter} from "../src/mocks/MockSwapAdapter.sol";

/// @notice Local chain only (anvil). Deploys the pool on a mock DEX with two allowed tokens.
/// forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --private-key <anvil key 0>
contract DeployLocal is Script {
    function run() external {
        vm.startBroadcast();
        address me = msg.sender;
        MockSwapAdapter dex = new MockSwapAdapter();
        payable(address(dex)).transfer(1_000 ether);
        TrustPool pool = new TrustPool(me, me, dex);
        MockToken chog = new MockToken("Chog", "CHOG", 0);
        MockToken moe = new MockToken("Moe", "MOE", 0);
        dex.setPrice(address(chog), 0.002 ether);
        dex.setPrice(address(moe), 0.05 ether);
        pool.setAllowed(address(chog), true);
        pool.setAllowed(address(moe), true);
        vm.stopBroadcast();
        console.log("TrustPool", address(pool));
        console.log("Adapter  ", address(dex));
        console.log("CHOG     ", address(chog));
        console.log("MOE      ", address(moe));
    }
}
