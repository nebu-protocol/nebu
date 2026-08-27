# LpVault — trust-minimized custody for an autonomous LP agent

An on-chain vault that lets an AI agent run concentrated-liquidity LP strategies on
PancakeSwap Infinity (BSC) **without ever being able to steal the principal**. Custody
safety is a property of the contract, not a promise about the bot or the server.

## Why

The bot signs transactions with an agent key. If that key (or the VPS holding it) is
compromised, a key-holding design lets an attacker drain the wallet. The vault removes
that: funds live in the vault; the agent can only trigger **bounded LP operations whose
outputs are forced back into the vault**; only the **owner** can withdraw.

## Roles

| Role | Can | Cannot |
|------|-----|--------|
| **owner** (user, SIWE address) | deposit, withdraw (to self), set/rotate agent, set caps, withdraw NFT | — |
| **agent** (bot key) | swap / mint / burn / rebalance — all with recipient hardcoded to the vault | withdraw, change roles, set recipient, make arbitrary calls |
| **anyone** | deposit into the vault | withdraw |

## Invariants (enforced on-chain)

1. **Owner-only exit.** Only `owner` moves value out of the vault, and only to `owner`.
   `withdraw`, `withdrawNFT`, `sweep` are `onlyOwner`.
2. **Recipient is always the vault.** Every LP op (swap output, mint NFT, burn proceeds,
   native sweep) is encoded by the vault with recipient = `address(this)`. The agent
   supplies pool/amount params only — never a recipient.
3. **No arbitrary calls.** The vault exposes only typed PancakeSwap operations. There is
   no `execute(target, data)` surface the agent could point anywhere.
4. **Bounded notional.** `maxNotionalPerOp` (owner-set, native units) caps how much the
   agent can route through a single operation — limits economic blast radius.
5. **Reentrancy-safe.** All state-changing externals are `nonReentrant`.
6. **Revocable.** Owner can set the agent to `address(0)`, instantly disabling automation.

## Threat model

- **Compromised agent key / backend.** Attacker can call swap/mint/burn within
  `maxNotionalPerOp`, but every result lands back in the vault and cannot be withdrawn
  (owner-only). Worst case: economic degradation (swap into a low-value token that stays
  in the vault) — never theft. An owner pool-allowlist (v2) closes even that.
- **Malicious pool params.** Funds route through PancakeSwap and return to the vault
  regardless of pool; a rigged pool can waste value but cannot redirect funds out.
- **Buggy protocol / reentrancy.** `nonReentrant` + `call` (never `delegatecall`) to
  external contracts; the vault holds no delegated code.

## Out of scope (v1) / roadmap

- Owner pool-allowlist (defense-in-depth against value-degradation).
- Per-token allowance accounting à la SupWallet adaptors (we use typed ops instead —
  least privilege for a single-purpose bot).
- Formal audit before mainnet funds beyond test size.

## Layout

- `src/LpVault.sol` — the vault (EIP-1167 clone target).
- `src/LpVaultFactory.sol` — per-owner clone deployment.
- `src/interfaces/IInfinity.sol` — minimal PancakeSwap Infinity interfaces (self-contained).
- `test/` — unit (role/withdraw/reentrancy invariants) + BSC fork tests (real mint/swap/burn).
