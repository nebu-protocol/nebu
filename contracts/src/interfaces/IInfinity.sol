// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Minimal, self-contained PancakeSwap Infinity (CLAMM) interfaces used by LpVault.
/// Kept local (not the full periphery) so the vault is small and auditable.

/// @dev Infinity PoolKey — 6 fields; poolId = keccak256(abi.encode(this)).
struct PoolKey {
    address currency0; // native = address(0)
    address currency1;
    address hooks;
    address poolManager; // CLPoolManager
    uint24 fee;
    bytes32 parameters; // tickSpacing at bits [16,40) for no-hook pools
}

/// @dev Param tuple for CL_SWAP_EXACT_IN_SINGLE (action 0x06).
struct CLSwapExactInputSingleParams {
    PoolKey poolKey;
    bool zeroForOne;
    uint128 amountIn;
    uint128 amountOutMinimum;
    bytes hookData;
}

interface ICLPositionManager {
    function modifyLiquidities(bytes calldata payload, uint256 deadline) external payable;
}

interface IUniversalRouter {
    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable;
}

interface IPermit2 {
    function approve(address token, address spender, uint160 amount, uint48 expiration) external;
}

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IERC721 {
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
}
