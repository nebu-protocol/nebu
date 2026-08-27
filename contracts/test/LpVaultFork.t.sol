// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {LpVault} from "../src/LpVault.sol";
import {LpVaultFactory} from "../src/LpVaultFactory.sol";
import {PoolKey, IERC20} from "../src/interfaces/IInfinity.sol";

/**
 * Integration test against REAL PancakeSwap Infinity on a BSC fork.
 * OPT-IN: set an ARCHIVE BSC_RPC_URL (public dataseed nodes prune state and won't serve
 * a fork). Skips cleanly otherwise. Proves the vault's swap executes on the real protocol
 * and the output token is custodied by the vault (not redirected).
 *
 *   BSC_RPC_URL=<archive-rpc> forge test --match-contract LpVaultForkTest -vv
 */
contract LpVaultForkTest is Test {
    // PancakeSwap Infinity — BSC mainnet
    address constant CL_POSITION_MANAGER = 0x55f4c8abA71A1e923edC303eb4fEfF14608cC226;
    address constant CL_POOL_MANAGER = 0xa0FfB9c1CE1Fe56963B0321B32E7A0302114058b;
    address constant UNIVERSAL_ROUTER = 0xd9C500DfF816a1Da21A48A732d3498Bf09dc9AEB;
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    // A live no-hook native pool discovered on-chain (~16 BNB liquidity).
    address constant TOKEN1 = 0x4B6e9d0D5033Fe6576d98f3C306e1EC0cf317777;
    uint24 constant FEE = 951290;
    int24 constant TICK_SPACING = 200;

    address owner = address(0xA11CE);
    address agent = address(0xB0B);

    function test_fork_swap_lands_in_vault() public {
        string memory rpc = vm.envOr("BSC_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);

        LpVaultFactory factory = new LpVaultFactory(CL_POSITION_MANAGER, UNIVERSAL_ROUTER, PERMIT2);
        vm.prank(owner);
        LpVault vault = LpVault(payable(factory.createVault(agent, 1 ether)));
        vm.deal(address(vault), 1 ether); // fund vault with BNB

        PoolKey memory key = PoolKey({
            currency0: address(0),
            currency1: TOKEN1,
            hooks: address(0),
            poolManager: CL_POOL_MANAGER,
            fee: FEE,
            parameters: bytes32(uint256(uint24(TICK_SPACING)) << 16)
        });

        uint256 tokenBefore = IERC20(TOKEN1).balanceOf(address(vault));
        uint256 bnbBefore = address(vault).balance;

        vm.prank(agent);
        vault.swap(key, true, 0.01 ether, 0); // buy token1 with 0.01 BNB, recipient forced = vault

        assertLt(address(vault).balance, bnbBefore, "vault BNB should decrease");
        assertGt(IERC20(TOKEN1).balanceOf(address(vault)), tokenBefore, "swap output must land in vault");
    }
}
