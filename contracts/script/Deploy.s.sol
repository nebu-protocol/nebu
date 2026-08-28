// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {LpVaultFactory} from "../src/LpVaultFactory.sol";

/// @notice Deploys LpVaultFactory. Addresses default to PancakeSwap Infinity BSC mainnet;
///         override via env for testnet.
///   forge script script/Deploy.s.sol --rpc-url $BSC_RPC_URL --broadcast --private-key $PK
contract Deploy is Script {
    function run() external {
        address clPositionManager =
            vm.envOr("CL_POSITION_MANAGER", address(0x55f4c8abA71A1e923edC303eb4fEfF14608cC226));
        address clPoolManager =
            vm.envOr("CL_POOL_MANAGER", address(0xa0FfB9c1CE1Fe56963B0321B32E7A0302114058b));
        address universalRouter =
            vm.envOr("UNIVERSAL_ROUTER", address(0xd9C500DfF816a1Da21A48A732d3498Bf09dc9AEB));
        address permit2 = vm.envOr("PERMIT2", address(0x000000000022D473030F116dDEE9F6B43aC78BA3));

        vm.startBroadcast();
        LpVaultFactory factory = new LpVaultFactory(clPositionManager, clPoolManager, universalRouter, permit2);
        vm.stopBroadcast();

        console.log("LpVaultFactory:", address(factory));
        console.log("LpVault implementation:", factory.implementation());
    }
}
