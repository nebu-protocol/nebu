// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {LpVault} from "./LpVault.sol";

/// @title LpVaultFactory
/// @notice Deploys one LpVault clone (EIP-1167 minimal proxy) per owner. The implementation
///         holds the protocol addresses as immutables; clones are cheap and share that code.
contract LpVaultFactory {
    address public immutable implementation;
    mapping(address => address) public vaultOf; // owner => vault

    event VaultCreated(address indexed owner, address indexed vault, address agent);

    constructor(address clPositionManager, address clPoolManager, address universalRouter, address permit2) {
        implementation = address(new LpVault(clPositionManager, clPoolManager, universalRouter, permit2));
    }

    /// @notice Deploy the caller's vault. One per owner. `agent` runs the strategy (revocable).
    function createVault(address agent, uint256 maxNotionalPerOp) external returns (address vault) {
        require(vaultOf[msg.sender] == address(0), "vault exists");
        vault = _clone(implementation);
        vaultOf[msg.sender] = vault; // checks-effects-interactions: record before the external init
        LpVault(payable(vault)).initialize(msg.sender, agent, maxNotionalPerOp);
        emit VaultCreated(msg.sender, vault, agent);
    }

    /// @dev Standard EIP-1167 minimal-proxy deployment.
    function _clone(address impl) internal returns (address instance) {
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
            mstore(add(ptr, 0x14), shl(0x60, impl))
            mstore(add(ptr, 0x28), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)
            instance := create(0, ptr, 0x37)
        }
        require(instance != address(0), "clone failed");
    }
}
