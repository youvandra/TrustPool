// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {TrustPool} from "../src/TrustPool.sol";

/// @notice Anvil only. Gives a fresh local deployment something to show: three callers
/// (anvil accounts 1 to 3) post bonds and open calls, and one exit is announced.
/// Run after Deploy.s.sol; reads deployments/31337.json.
///
///   forge script script/SeedLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
///
/// To see exits settle, move the chain forward and execute from the app:
///   cast rpc evm_increaseTime 259200 && cast rpc evm_mine
contract SeedLocal is Script {
    string constant MNEMONIC = "test test test test test test test test test test test junk";

    function run() external {
        require(block.chainid == 31337, "anvil only");
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/deployments/31337.json"));
        TrustPool pool = TrustPool(payable(vm.parseJsonAddress(json, ".trustPool")));
        address[] memory tokens = vm.parseJsonAddressArray(json, ".tokens");

        uint256 olu = vm.deriveKey(MNEMONIC, 1);
        uint256 marisa = vm.deriveKey(MNEMONIC, 2);
        uint256 kenta = vm.deriveKey(MNEMONIC, 3);

        _open(pool, olu, 25 ether, tokens[0], 120 ether, 3 days, 12 hours, "CHOG holds above its launch range.");
        uint256 announced =
            _open(pool, marisa, 18 ether, tokens[1], 300 ether, 1 days, 1 days, "MOE into the end of the month.");
        _open(pool, kenta, 10 ether, tokens[0], 45 ether, 1 days, 6 hours, "One day on CHOG, nothing more.");

        vm.broadcast(marisa);
        pool.announceExit(announced);
        console.log("Seeded", pool.callCount(), "calls; exit announced on", announced);
    }

    function _open(
        TrustPool pool,
        uint256 key,
        uint256 bond,
        address token,
        uint256 mon,
        uint64 lock,
        uint32 notice,
        string memory thesis
    ) internal returns (uint256 id) {
        vm.startBroadcast(key);
        pool.postBond{value: bond}();
        id = pool.openCall{value: mon}(token, lock, notice, 0, thesis);
        vm.stopBroadcast();
    }
}
