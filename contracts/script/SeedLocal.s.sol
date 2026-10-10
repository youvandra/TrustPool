// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {TrustPool} from "../src/TrustPool.sol";

/// @notice Anvil only. Gives a fresh local deployment something to show: three callers
/// (anvil accounts 1 to 3) post bonds and open pooled calls, and joiners (accounts 4, 6, 7)
/// deposit into them. Run after Deploy.s.sol; reads deployments/31337.json.
///
///   forge script script/SeedLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
///
/// To see a buy, move the chain past a window and buy from the app:
///   cast rpc evm_increaseTime 1800 && cast rpc evm_mine
contract SeedLocal is Script {
    string constant MNEMONIC = "test test test test test test test test test test test junk";

    function run() external {
        require(block.chainid == 31337, "anvil only");
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/deployments/31337.json"));
        TrustPool pool = TrustPool(payable(vm.parseJsonAddress(json, ".trustPool")));
        address[] memory tokens = vm.parseJsonAddressArray(json, ".tokens");
        TrustPool.Params memory p = pool.params();

        uint256 olu = vm.deriveKey(MNEMONIC, 1);
        uint256 marisa = vm.deriveKey(MNEMONIC, 2);
        uint256 kenta = vm.deriveKey(MNEMONIC, 3);
        uint256[3] memory joiners = [vm.deriveKey(MNEMONIC, 4), vm.deriveKey(MNEMONIC, 6), vm.deriveKey(MNEMONIC, 7)];

        // tier 0: the pool cap is twice the bond, so each bond covers the minimum pool
        uint256 a = _open(
            pool,
            olu,
            40 ether,
            tokens[0],
            6 ether,
            p.maxWindow,
            5000,
            2000,
            p.maxHold,
            500,
            "CHOG holds above its launch range."
        );
        uint256 b = _open(
            pool,
            marisa,
            30 ether,
            tokens[1],
            4 ether,
            p.maxWindow / 2,
            0,
            1500,
            p.maxHold / 2,
            300,
            "MOE into the end of the month."
        );
        _open(
            pool,
            kenta,
            25 ether,
            tokens[0],
            3 ether,
            p.minWindow,
            2000,
            1000,
            p.minHold,
            0,
            "One quick pool on CHOG, nothing more."
        );

        vm.broadcast(joiners[0]);
        pool.deposit{value: 30 ether}(a);
        vm.broadcast(joiners[1]);
        pool.deposit{value: 25 ether}(a);
        vm.broadcast(joiners[2]);
        pool.deposit{value: 20 ether}(b);
        console.log("Seeded", pool.callCount(), "pooled calls");
    }

    function _open(
        TrustPool pool,
        uint256 key,
        uint256 bond,
        address token,
        uint256 stake,
        uint32 window,
        uint32 takeProfitBps,
        uint16 stopLossBps,
        uint32 maxHold,
        uint16 shareBps,
        string memory thesis
    ) internal returns (uint256 id) {
        vm.startBroadcast(key);
        pool.postBond{value: bond}();
        id = pool.openCall{value: stake}(token, window, takeProfitBps, stopLossBps, maxHold, shareBps, thesis);
        vm.stopBroadcast();
    }
}
