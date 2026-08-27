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
        factory = new LpVaultFactory(address(pm), address(router), address(permit2));
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

    // --- INVARIANT 2: recipient hardcoded to vault (agent can't redirect) ---
    function test_mint_encodes_vault_as_owner() public {
        vm.prank(agent);
        vault.mint(key, -100, 100, 1000, 0.1 ether, 1 ether);
        // mint param encodes owner=address(this)=vault → vault address must appear as a word
        assertTrue(_containsAddress(pm.lastPayload(), address(vault)), "mint recipient must be vault");
        assertEq(pm.lastValue(), 0.1 ether);
    }

    function test_burn_encodes_vault_as_recipient() public {
        vm.prank(agent);
        vault.burn(42, key);
        assertTrue(_containsAddress(pm.lastPayload(), address(vault)), "burn recipient must be vault");
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

    // helper: does `data` contain `addr` as a right-aligned 32-byte word?
    function _containsAddress(bytes memory data, address addr) internal pure returns (bool) {
        bytes32 target = bytes32(uint256(uint160(addr)));
        if (data.length < 32) return false;
        for (uint256 i = 0; i + 32 <= data.length; i++) {
            bytes32 word;
            assembly {
                word := mload(add(add(data, 0x20), i))
            }
            if (word == target) return true;
        }
        return false;
    }
}
