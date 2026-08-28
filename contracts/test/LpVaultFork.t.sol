// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {LpVault} from "../src/LpVault.sol";
import {LpVaultFactory} from "../src/LpVaultFactory.sol";
import {PoolKey, IERC20} from "../src/interfaces/IInfinity.sol";

interface ICLPoolManagerRead {
    function getSlot0(bytes32 id) external view returns (uint160 sqrtPriceX96, int24 tick, uint24, uint24);
}

interface IERC721Ext {
    function balanceOf(address) external view returns (uint256);
    function ownerOf(uint256) external view returns (address);
}

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

    bytes32 constant TRANSFER = 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef;

    /// Full lifecycle: swap -> mint (NFT to vault) -> burn (funds back). Needs an ARCHIVE
    /// BSC_RPC_URL (the mint reads tick-data state a pruned node won't serve).
    function test_fork_mint_and_burn_custody() public {
        string memory rpc = vm.envOr("BSC_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);
        LpVaultFactory factory = new LpVaultFactory(CL_POSITION_MANAGER, UNIVERSAL_ROUTER, PERMIT2);
        vm.prank(owner);
        LpVault vault = LpVault(payable(factory.createVault(agent, 5 ether)));
        vm.deal(address(vault), 5 ether);

        PoolKey memory key = PoolKey({
            currency0: address(0),
            currency1: TOKEN1,
            hooks: address(0),
            poolManager: CL_POOL_MANAGER,
            fee: FEE,
            parameters: bytes32(uint256(uint24(TICK_SPACING)) << 16)
        });

        vm.prank(agent);
        vault.swap(key, true, 0.05 ether, 0);
        uint128 t1 = uint128(IERC20(TOKEN1).balanceOf(address(vault)));
        assertGt(t1, 0, "have token1 to mint with");

        bytes32 poolId = keccak256(abi.encode(key));
        (, int24 tick,,) = ICLPoolManagerRead(CL_POOL_MANAGER).getSlot0(poolId);
        int24 ts = TICK_SPACING;
        int24 aligned = (tick / ts) * ts;
        // Single-sided BNB range (entirely ABOVE current tick) → needs only token0=BNB.
        // Avoids matching L to this memecoin's tiny token1 balance; still exercises the full
        // vault.mint path (CL_MINT_POSITION + SETTLE_PAIR + SWEEP) and NFT custody.
        int24 lower = aligned + 2 * ts;
        int24 upper = aligned + 6 * ts;

        vm.recordLogs();
        vm.prank(agent);
        vault.mint(key, lower, upper, 1e12, uint128(address(vault).balance), t1);
        assertEq(IERC721Ext(CL_POSITION_MANAGER).balanceOf(address(vault)), 1, "vault MUST own the LP NFT");

        uint256 tokenId = _mintedTokenId(address(vault));
        assertEq(IERC721Ext(CL_POSITION_MANAGER).ownerOf(tokenId), address(vault), "NFT owner = vault");

        uint256 tok1BeforeBurn = IERC20(TOKEN1).balanceOf(address(vault));
        vm.prank(agent);
        vault.burn(tokenId, key);
        assertEq(IERC721Ext(CL_POSITION_MANAGER).balanceOf(address(vault)), 0, "NFT burned");
        assertGe(IERC20(TOKEN1).balanceOf(address(vault)), tok1BeforeBurn, "burn returns token1 to vault");
    }

    /// Swap on a real HOOKED, dynamic-fee pool (BNB/CAKE, ~493 BNB liq) — proves the agent
    /// can trade BSC's legit liquid pools (not just no-hook four.meme). Needs BSC_RPC_URL.
    function test_fork_hooked_pool_swap() public {
        string memory rpc = vm.envOr("BSC_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);
        LpVaultFactory factory = new LpVaultFactory(CL_POSITION_MANAGER, UNIVERSAL_ROUTER, PERMIT2);
        vm.prank(owner);
        LpVault vault = LpVault(payable(factory.createVault(agent, 1 ether)));
        vm.deal(address(vault), 1 ether);

        address CAKE = 0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82;
        PoolKey memory key = PoolKey({
            currency0: address(0),
            currency1: CAKE,
            hooks: 0x32C59D556B16DB81DFc32525eFb3CB257f7e493d, // dynamic-fee hook
            poolManager: CL_POOL_MANAGER,
            fee: 8388608, // 0x800000 = dynamic fee flag
            parameters: 0x00000000000000000000000000000000000000000000000000000000000a00c2
        });

        vm.prank(agent);
        vault.swap(key, true, 0.01 ether, 0); // buy CAKE with 0.01 BNB, recipient forced = vault

        assertGt(IERC20(CAKE).balanceOf(address(vault)), 0, "hooked-pool swap output must land in vault");
        assertLt(address(vault).balance, 1 ether, "vault BNB spent");
    }

    function _mintedTokenId(address to) internal returns (uint256) {
        VmSafe.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i = 0; i < logs.length; i++) {
            if (
                logs[i].emitter == CL_POSITION_MANAGER && logs[i].topics.length == 4 && logs[i].topics[0] == TRANSFER
                    && logs[i].topics[1] == bytes32(0) && logs[i].topics[2] == bytes32(uint256(uint160(to)))
            ) {
                return uint256(logs[i].topics[3]);
            }
        }
        revert("no mint Transfer log");
    }
}
