// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {LpVault} from "../src/LpVault.sol";
import {LpVaultFactory} from "../src/LpVaultFactory.sol";
import {PoolKey} from "../src/interfaces/IInfinity.sol";

// --- mocks ---
contract MockERC20 {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 a) external {
        balanceOf[to] += a;
    }

    function approve(address, uint256) external pure returns (bool) {
        return true;
    }

    function transfer(address to, uint256 a) external returns (bool) {
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        return true;
    }

    function transferFrom(address f, address t, uint256 a) external returns (bool) {
        balanceOf[f] -= a;
        balanceOf[t] += a;
        return true;
    }
}

/// Non-standard token: approve/transfer/transferFrom return NOTHING (common on BSC).
contract MockNonStandardToken {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 a) external {
        balanceOf[to] += a;
    }

    function approve(address, uint256) external {}

    function transfer(address to, uint256 a) external {
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
    }

    function transferFrom(address f, address t, uint256 a) external {
        balanceOf[f] -= a;
        balanceOf[t] += a;
    }
}

contract MockPermit2 {
    function approve(address, address, uint160, uint48) external {}
}

contract MockRouter {
    bytes public lastInput;
    uint256 public lastValue;

    function execute(bytes calldata, bytes[] calldata i, uint256) external payable {
        lastInput = i[0];
        lastValue = msg.value;
    }
}

contract MockPositionManager {
    bytes public lastPayload;
    uint256 public lastValue;

    function modifyLiquidities(bytes calldata p, uint256) external payable {
        lastPayload = p;
        lastValue = msg.value;
    }
}

/// Owner that reenters withdraw when it receives native — reentrancy probe.
contract OwnerReenterer {
    LpVault public vault;
    bool public attack;

    function setVault(LpVault v) external {
        vault = v;
    }

    function createOn(LpVaultFactory f, address agent) external returns (address) {
        return f.createVault(agent, 100 ether);
    }

    receive() external payable {
        if (attack) {
            attack = false;
            vault.withdraw(address(0), 1 ether); // reentrant
        }
    }

    function armAndWithdraw() external {
        attack = true;
        vault.withdraw(address(0), 1 ether);
    }
}

contract LpVaultTest is Test {
    LpVaultFactory factory;
    LpVault vault;
    MockRouter router;
    MockPositionManager pm;
    MockPermit2 permit2;
    MockERC20 token;

    address owner = address(0xA11CE);
    address agent = address(0xB0B);
    address attacker = address(0xBAD);
    PoolKey key;

    function setUp() public {
        router = new MockRouter();
        pm = new MockPositionManager();
        permit2 = new MockPermit2();
        token = new MockERC20();
        // clPoolManager pinned = address(0x123) → matches the test PoolKey below (guard passes).
        factory = new LpVaultFactory(address(pm), address(0x123), address(router), address(permit2));
        vm.prank(owner);
        vault = LpVault(payable(factory.createVault(agent, 1 ether)));
        key = PoolKey({
            currency0: address(0),
            currency1: address(token),
            hooks: address(0),
            poolManager: address(0x123),
            fee: 500,
            parameters: bytes32(uint256(10) << 16)
        });
        vm.deal(address(vault), 10 ether);
        token.mint(address(vault), 1000 ether);
    }

    function test_initialize_state_and_reinit_reverts() public {
        assertEq(vault.owner(), owner);
        assertEq(vault.agent(), agent);
        assertEq(vault.maxNotionalPerOp(), 1 ether);
        vm.expectRevert(bytes("initialized"));
        vault.initialize(attacker, attacker, 0);
    }

    function test_one_vault_per_owner() public {
        vm.prank(owner);
        vm.expectRevert(bytes("vault exists"));
        factory.createVault(agent, 1 ether);
    }

    // --- INVARIANT 1: owner-only exit ---
    function test_withdraw_only_owner() public {
        vm.prank(attacker);
        vm.expectRevert(bytes("not owner"));
        vault.withdraw(address(0), 1 ether);

        vm.prank(agent);
        vm.expectRevert(bytes("not owner"));
        vault.withdraw(address(0), 1 ether);

        uint256 before = owner.balance;
        vm.prank(owner);
        vault.withdraw(address(0), 1 ether);
        assertEq(owner.balance, before + 1 ether);
    }

    function test_withdraw_erc20_to_owner() public {
        vm.prank(owner);
        vault.withdraw(address(token), 500 ether);
        assertEq(token.balanceOf(owner), 500 ether);
    }

    function test_setAgent_only_owner() public {
        vm.prank(attacker);
        vm.expectRevert(bytes("not owner"));
        vault.setAgent(attacker);
    }

    // --- INVARIANT 2 & 3: agent bounded to LP ops, no other surface ---
    function test_swap_agent_ok_attacker_reverts() public {
        vm.prank(attacker);
        vm.expectRevert(bytes("not agent"));
        vault.swap(key, true, 0.1 ether, 0);

        vm.prank(agent);
        vault.swap(key, true, 0.1 ether, 0);
        assertEq(router.lastValue(), 0.1 ether); // native forwarded to router
    }

    // Pin: a poolKey with a non-canonical poolManager (attacker-controlled routing) MUST revert.
    function test_swap_and_mint_reject_non_canonical_poolManager() public {
        PoolKey memory bad = key;
        bad.poolManager = address(0xBAD);
        vm.prank(agent);
        vm.expectRevert(bytes("poolManager"));
        vault.swap(bad, true, 0.1 ether, 0);

        vm.prank(agent);
        vm.expectRevert(bytes("poolManager"));
        vault.mint(bad, -100, 100, 1000, 0.1 ether, 0);

        // canonical manager (0x123) still works
        vm.prank(agent);
        vault.swap(key, true, 0.1 ether, 0);
    }

    function test_setAgent_zero_disables_automation() public {
        vm.prank(owner);
        vault.setAgent(address(0));
        vm.prank(agent);
        vm.expectRevert(bytes("not agent"));
        vault.swap(key, true, 0.1 ether, 0);
    }

    // --- INVARIANT 4: notional cap ---
    function test_notional_cap_on_swap() public {
        vm.prank(agent);
        vm.expectRevert(bytes("notional cap"));
        vault.swap(key, true, 2 ether, 0); // > 1 ether cap
    }

    function test_notional_cap_on_mint() public {
        vm.prank(agent);
        vm.expectRevert(bytes("notional cap"));
        vault.mint(key, -100, 100, 1000, 2 ether, 1 ether); // amount0Max > cap
    }

    // --- INVARIANT 2: recipient hardcoded to vault (decode the exact field) ---
    function test_mint_owner_is_exactly_vault() public {
        vm.prank(agent);
        vault.mint(key, -100, 100, 1000, 0.1 ether, 1 ether);
        (bytes memory actions, bytes[] memory params) = abi.decode(pm.lastPayload(), (bytes, bytes[]));
        // mintParam = (PoolKey, tickLower, tickUpper, liquidity, amount0Max, amount1Max, owner, hookData)
        (,,,,,, address mintOwner,) =
            abi.decode(params[0], (PoolKey, int24, int24, uint256, uint128, uint128, address, bytes));
        assertEq(mintOwner, address(vault), "mint owner MUST be the vault");
        assertEq(actions.length, 3, "CL_MINT+SETTLE_PAIR+SWEEP for native");
        assertEq(pm.lastValue(), 0.1 ether);
    }

    function test_burn_recipient_is_exactly_vault() public {
        vm.prank(agent);
        vault.burn(42, key);
        (, bytes[] memory params) = abi.decode(pm.lastPayload(), (bytes, bytes[]));
        // TAKE_PAIR param = (currency0, currency1, to)
        (,, address recipient) = abi.decode(params[1], (address, address, address));
        assertEq(recipient, address(vault), "burn recipient MUST be the vault");
    }

    // --- non-standard token handling (no bool return) ---
    function test_nonstandard_token_withdraw_and_swap_approve() public {
        MockNonStandardToken nst = new MockNonStandardToken();
        nst.mint(address(vault), 100 ether);
        // withdraw a token that returns no bool -> _safeCall tolerates it
        vm.prank(owner);
        vault.withdraw(address(nst), 40 ether);
        assertEq(nst.balanceOf(owner), 40 ether);
        // token->native swap exercises _ensureApproval on the non-standard token (no revert)
        PoolKey memory k = key;
        k.currency1 = address(nst);
        vm.prank(agent);
        vault.swap(k, false, 10 ether, 0);
    }

    function test_deposit_nonstandard_token() public {
        MockNonStandardToken nst = new MockNonStandardToken();
        nst.mint(address(this), 100 ether);
        vault.depositToken(address(nst), 40 ether);
        assertEq(nst.balanceOf(address(vault)), 40 ether);
    }

    // --- edge cases ---
    function test_withdraw_over_balance_reverts() public {
        vm.prank(owner);
        vm.expectRevert(); // vault holds 10 ETH; sending 100 fails
        vault.withdraw(address(0), 100 ether);
    }

    function test_cap_zero_blocks_native_but_allows_unwind() public {
        vm.prank(owner);
        vault.setMaxNotionalPerOp(0);
        vm.prank(agent);
        vm.expectRevert(bytes("notional cap"));
        vault.swap(key, true, 1, 0); // native-in blocked
        vm.prank(agent);
        vault.swap(key, false, 1 ether, 0); // token->native un-wind still allowed
    }

    // --- INVARIANT 5: reentrancy ---
    function test_reentrancy_blocked_on_withdraw() public {
        OwnerReenterer o = new OwnerReenterer();
        address v = o.createOn(factory, agent);
        o.setVault(LpVault(payable(v)));
        vm.deal(v, 5 ether);
        // reentrant withdraw via receive() → nested call fails → outer native send fails → revert
        vm.expectRevert();
        o.armAndWithdraw();
        // funds intact (no double spend)
        assertEq(v.balance, 5 ether);
    }

    // --- native handling ---
    function test_receive_native() public {
        (bool ok,) = address(vault).call{value: 3 ether}("");
        assertTrue(ok);
        assertEq(address(vault).balance, 13 ether);
    }

}
