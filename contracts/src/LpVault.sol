// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {
    PoolKey,
    CLSwapExactInputSingleParams,
    ICLPositionManager,
    IUniversalRouter,
    IPermit2,
    IERC20,
    IERC721
} from "./interfaces/IInfinity.sol";

/**
 * @title LpVault
 * @notice Trust-minimized custody for an autonomous LP agent on PancakeSwap Infinity (BSC).
 *         Funds live here. The agent can only trigger typed LP operations (swap/mint/burn)
 *         whose outputs are hardcoded back to this vault; only the owner can withdraw.
 *         A compromised agent key can degrade value at most, never steal it. See DESIGN.md.
 * @dev    EIP-1167 clone target. Protocol addresses are immutables on the implementation
 *         (shared by all clones); owner/agent live in per-clone storage set by initialize().
 */
contract LpVault {
    // --- protocol (immutable, set on implementation, shared by clones) ---
    address public immutable CL_POSITION_MANAGER;
    address public immutable CL_POOL_MANAGER; // canonical Infinity CLPoolManager — poolKey MUST use it
    address public immutable UNIVERSAL_ROUTER;
    address public immutable PERMIT2;

    // --- per-vault state ---
    address public owner; // only party that can withdraw
    address public agent; // bot operator; bounded to LP ops
    uint256 public maxNotionalPerOp; // cap on native routed per op (0 = unset => blocked)
    bool private _initialized;
    // Reentrancy lock. NOTE: set in initialize(), not a field initializer — EIP-1167 clones
    // start with zero storage, so a `= 1` initializer would leave clones locked (0 != 1).
    uint256 private _lock;

    // token => spender => approved (Permit2 two-leg approval done once)
    mapping(address => mapping(address => bool)) private _approved;

    // --- action / command bytes (identical to Uniswap v4 periphery) ---
    uint8 private constant CL_MINT = 0x02;
    uint8 private constant CL_BURN = 0x03;
    uint8 private constant CL_SWAP_IN_SINGLE = 0x06;
    uint8 private constant SETTLE_ALL = 0x0c;
    uint8 private constant SETTLE_PAIR = 0x0d;
    uint8 private constant TAKE_ALL = 0x0f;
    uint8 private constant TAKE_PAIR = 0x11;
    uint8 private constant SWEEP = 0x14;
    bytes1 private constant COMMAND_INFI_SWAP = 0x10;
    address private constant NATIVE = address(0);

    event Initialized(address indexed owner, address indexed agent);
    event AgentSet(address indexed agent);
    event MaxNotionalSet(uint256 maxNotionalPerOp);
    event Deposit(address indexed from, address indexed token, uint256 amount);
    event Withdraw(address indexed token, uint256 amount);
    event WithdrawNFT(uint256 indexed tokenId);
    event Swapped(bytes32 indexed poolId, bool zeroForOne, uint128 amountIn, uint128 minOut);
    event Minted(bytes32 indexed poolId, int24 tickLower, int24 tickUpper);
    event Burned(uint256 indexed tokenId);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier onlyAgentOrOwner() {
        require(msg.sender == agent || msg.sender == owner, "not agent");
        _;
    }

    modifier nonReentrant() {
        require(_lock == 1, "reentrant");
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(address clPositionManager, address clPoolManager, address universalRouter, address permit2) {
        require(
            clPositionManager != address(0) && clPoolManager != address(0) && universalRouter != address(0)
                && permit2 != address(0),
            "zero addr"
        );
        CL_POSITION_MANAGER = clPositionManager;
        CL_POOL_MANAGER = clPoolManager;
        UNIVERSAL_ROUTER = universalRouter;
        PERMIT2 = permit2;
        _initialized = true; // lock the implementation itself against initialize()
    }

    /// @notice One-time init for a fresh clone. owner controls funds; agent runs strategy.
    function initialize(address owner_, address agent_, uint256 maxNotionalPerOp_) external {
        require(!_initialized, "initialized");
        require(owner_ != address(0), "zero owner");
        _initialized = true;
        _lock = 1; // arm the reentrancy guard for this clone
        owner = owner_;
        agent = agent_;
        maxNotionalPerOp = maxNotionalPerOp_;
        emit Initialized(owner_, agent_);
    }

    // --- deposits (anyone may fund; only owner withdraws) ---
    receive() external payable {
        emit Deposit(msg.sender, NATIVE, msg.value);
    }

    /// @notice Pull ERC20 into the vault (caller must approve first).
    function depositToken(address token, uint256 amount) external nonReentrant {
        _safeCall(token, abi.encodeWithSelector(IERC20.transferFrom.selector, msg.sender, address(this), amount));
        emit Deposit(msg.sender, token, amount);
    }

    // --- owner-only exits ---
    function withdraw(address token, uint256 amount) external onlyOwner nonReentrant {
        if (token == NATIVE) {
            (bool ok,) = owner.call{value: amount}("");
            require(ok, "native send");
        } else {
            _safeCall(token, abi.encodeWithSelector(IERC20.transfer.selector, owner, amount));
        }
        emit Withdraw(token, amount);
    }

    function withdrawNFT(address positionManager, uint256 tokenId) external onlyOwner nonReentrant {
        IERC721(positionManager).safeTransferFrom(address(this), owner, tokenId);
        emit WithdrawNFT(tokenId);
    }

    // --- owner controls ---
    function setAgent(address agent_) external onlyOwner {
        agent = agent_; // address(0) disables automation instantly
        emit AgentSet(agent_);
    }

    function setMaxNotionalPerOp(uint256 v) external onlyOwner {
        maxNotionalPerOp = v;
        emit MaxNotionalSet(v);
    }

    // --- agent LP operations (recipient ALWAYS this vault) ---

    /// @notice Swap within the vault. Output currency is taken to this vault (msg.sender).
    function swap(PoolKey calldata key, bool zeroForOne, uint128 amountIn, uint128 minOut)
        external
        onlyAgentOrOwner
        nonReentrant
    {
        // Pin the pool manager: a compromised agent cannot route the vault's approved balance
        // through an attacker-controlled "poolManager" contract. All real Infinity pools use this.
        require(key.poolManager == CL_POOL_MANAGER, "poolManager");
        address currencyIn = zeroForOne ? key.currency0 : key.currency1;
        address currencyOut = zeroForOne ? key.currency1 : key.currency0;
        uint256 value = 0; // 0 for token-in ops (native value only when currency0 = native)
        if (currencyIn == NATIVE) {
            require(amountIn <= maxNotionalPerOp, "notional cap");
            value = amountIn;
        } else {
            _ensureApproval(currencyIn, UNIVERSAL_ROUTER);
        }

        bytes memory actions = abi.encodePacked(CL_SWAP_IN_SINGLE, SETTLE_ALL, TAKE_ALL);
        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(
            CLSwapExactInputSingleParams({
                poolKey: key,
                zeroForOne: zeroForOne,
                amountIn: amountIn,
                amountOutMinimum: minOut,
                hookData: ""
            })
        );
        params[1] = abi.encode(currencyIn, uint256(amountIn)); // SETTLE_ALL
        params[2] = abi.encode(currencyOut, uint256(minOut)); // TAKE_ALL -> msg.sender (vault)

        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(actions, params);
        IUniversalRouter(UNIVERSAL_ROUTER).execute{value: value}(
            abi.encodePacked(COMMAND_INFI_SWAP), inputs, block.timestamp
        );
        emit Swapped(_poolId(key), zeroForOne, amountIn, minOut);
    }

    /// @notice Mint a CL position owned by this vault.
    function mint(
        PoolKey calldata key,
        int24 tickLower,
        int24 tickUpper,
        uint256 liquidity,
        uint128 amount0Max,
        uint128 amount1Max
    ) external onlyAgentOrOwner nonReentrant {
        require(key.poolManager == CL_POOL_MANAGER, "poolManager"); // pin canonical manager (see swap)
        bool nativeIn = key.currency0 == NATIVE;
        uint256 value = 0; // 0 for token-in ops (native value only when currency0 = native)
        if (nativeIn) {
            require(amount0Max <= maxNotionalPerOp, "notional cap");
            value = amount0Max;
        } else {
            _ensureApproval(key.currency0, CL_POSITION_MANAGER);
        }
        if (key.currency1 != NATIVE) _ensureApproval(key.currency1, CL_POSITION_MANAGER);

        bytes memory mintParam =
            abi.encode(key, tickLower, tickUpper, liquidity, amount0Max, amount1Max, address(this), bytes(""));
        bytes memory settleParam = abi.encode(key.currency0, key.currency1);

        bytes memory actions;
        bytes[] memory params;
        if (nativeIn) {
            actions = abi.encodePacked(CL_MINT, SETTLE_PAIR, SWEEP);
            params = new bytes[](3);
            params[2] = abi.encode(key.currency0, address(this)); // SWEEP excess native -> vault
        } else {
            actions = abi.encodePacked(CL_MINT, SETTLE_PAIR);
            params = new bytes[](2);
        }
        params[0] = mintParam;
        params[1] = settleParam;

        ICLPositionManager(CL_POSITION_MANAGER).modifyLiquidities{value: value}(
            abi.encode(actions, params), block.timestamp
        );
        emit Minted(_poolId(key), tickLower, tickUpper);
    }

    /// @notice Burn a CL position; both currencies returned to this vault.
    function burn(uint256 tokenId, PoolKey calldata key) external onlyAgentOrOwner nonReentrant {
        bytes memory actions = abi.encodePacked(CL_BURN, TAKE_PAIR);
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(tokenId, uint128(0), uint128(0), bytes(""));
        params[1] = abi.encode(key.currency0, key.currency1, address(this)); // TAKE_PAIR -> vault
        ICLPositionManager(CL_POSITION_MANAGER).modifyLiquidities(abi.encode(actions, params), block.timestamp);
        emit Burned(tokenId);
    }

    // --- helpers ---

    /// @dev Two-leg Permit2 approval (token->Permit2 ERC20, Permit2->spender), once per pair.
    function _ensureApproval(address token, address spender) internal {
        if (_approved[token][spender]) return;
        _safeCall(token, abi.encodeWithSelector(IERC20.approve.selector, PERMIT2, type(uint256).max));
        IPermit2(PERMIT2).approve(token, spender, type(uint160).max, type(uint48).max);
        _approved[token][spender] = true;
    }

    /// @dev ERC20 call tolerant of non-standard BSC tokens (no / non-bool return).
    function _safeCall(address token, bytes memory data) internal {
        (bool ok, bytes memory ret) = token.call(data);
        require(ok && (ret.length == 0 || abi.decode(ret, (bool))), "token call failed");
    }

    function _poolId(PoolKey calldata key) internal pure returns (bytes32) {
        return keccak256(abi.encode(key));
    }

    /// @notice Receive LP NFTs (minted to this vault).
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
