# Nebu — Autonomous Liquidity Agent on BNB Chain

An AI agent that runs a **concentrated‑liquidity strategy on PancakeSwap Infinity (BNB Smart Chain)** end‑to‑end: it discovers pools, ranks them by real demand, sizes positions by conviction, provides liquidity, and manages exits — all while the funds sit in an **on‑chain vault the agent can never drain**. Every position's PnL is benchmarked against simply holding (HODL).

Built for the BNB **Smart Money Era** hackathon. Multi‑chain by design (default **BNB**; Uniswap v4 / Robinhood Chain supported via the same adapter).

---

## Why it's different

- **Non‑custodial by construction.** Funds live in an `LpVault` smart contract. The agent key can *only* call typed LP operations (mint / burn / swap) whose recipient is hard‑coded to the vault itself. **Withdrawals are owner‑only.** A compromised agent key cannot move funds out — it can only trade within the vault. (Design informed by SupWallet's typed‑op vault pattern.)
- **Honest accounting.** PnL is **realized native (BNB/ETH) net vs HODL**, computed from the actual balance returned at exit — not an unrealized mark that slippage never delivers. Win‑rate matches what GMGN would show.
- **Research‑grounded strategy.** Entry gates and ranking follow the LP‑as‑short‑vol literature (fee − LVR, LVR ∝ σ²): an LVR‑adjusted APR hurdle, momentum/anti‑extension gates, a TVL‑trend rug filter, demand‑acceleration ranking, and ¼‑Kelly‑style conviction sizing.
- **PancakeSwap Infinity native.** Full support for Infinity's 6‑field `PoolKey` (incl. `bytes32 parameters`) and **hooked, dynamic‑fee pools** — the pools where BSC's real liquidity lives. poolId derivation verified against 38/38 on‑chain pools (28 no‑hook + 10 hooked).

---

## Architecture

```
apps/bot        @lp/bot — the agent: scanner → strategist → executor → exit-manager
                TypeScript + viem + node:sqlite. DEX-agnostic via a DexAdapter interface.
apps/dapp       Next.js 16 dashboard — portfolio, vault, leaderboard, status.
                Wallet via Dynamic.xyz + SIWE. Bilingual EN/ID. Dynamic per-chain UI.
apps/backoffice legacy admin panel (Robinhood-era)
contracts/      Foundry — LpVault + LpVaultFactory (EIP-1167 clones). Slither-audited.
data/lp.db      SQLite state (gitignored)
```

### The pipeline (one `collect` cycle)

```
price → activity → snapshot → plan(yield+decide) → execute(swap+mint) →
pnl → positions-live → exit-manager
```

- **scanner** — `backfill` indexes `Initialize` events (pool creation); `activity` measures swap volume; `snapshot` records pool state + feeGrowth.
- **strategist** (`decide`, pure & unit‑tested) — gates candidates (age, LVR‑hurdle APR, momentum, TVL trend, demand), ranks by a demand score (volume accel + TVL trend, *not* raw APR), and sizes by conviction (∝ √demand, √‑compressed to avoid over‑concentration).
- **executor** — swaps native→token then mints the LP position. **Simulation by default**; live requires `EXECUTOR_LIVE=1` + an armed wallet, and routes every write through the vault.
- **exit‑manager** — trailing take‑profit, stop‑loss, tick‑based price‑stop (fail‑safe even when valuation is stale), out‑of‑range, and a time‑stop that recycles capital.

---

## On‑chain contracts

`LpVault` holds the funds; the agent is a bounded operator.

| | |
|---|---|
| Agent can call | `mint`, `burn`, `swap` — recipient/owner hard‑coded to the vault |
| Owner‑only | `withdraw`, `setAgent` (kill‑switch), notional cap |
| Safety | `nonReentrant`, CEI, per‑op notional cap, `_safeCall` for non‑standard ERC‑20s |
| Deploy | `LpVaultFactory` mints EIP‑1167 minimal‑proxy clones (one vault per owner) |

**Deployed (BSC mainnet):** `LpVaultFactory` at [`0xA94218Dbdb142A10e32eF7b494105D27F47f7045`](https://bscscan.com/address/0xA94218Dbdb142A10e32eF7b494105D27F47f7045) · also on BSC testnet.

Audited with **Slither** (two real bugs found + fixed: a clone reentrancy‑lock init bug, and non‑standard‑token approve/transfer). **19 Foundry tests** (17 unit + 2 mainnet‑fork, incl. a vault swap on a real hooked BNB/CAKE pool).

---

## Run it

Requires **Node ≥ 22.5** (`node:sqlite`) and, for contracts, **Foundry**.

```bash
# --- Bot on BSC (data → a dedicated BSC DB) ---
cd apps/bot && npm install
# do NOT set BSC_RPC_URL (single RPC = no fallback → getLogs rate-limits); the default
# multi-RPC fallback handles public-RPC limits.
CHAIN=bsc DB_PATH=../../data/lp-bsc.db npm run backfill      # discover pools
CHAIN=bsc DB_PATH=../../data/lp-bsc.db npm run collect -- 60 # run the cycle every 60m
#   For a full landing table on a public RPC (sparse discovery, short spans), relax the
#   yield guards: YIELD_MIN_SPAN_MIN / YIELD_MIN_SWAPS_PER_H / YIELD_MIN_VOL_ETH.
#   Production-quality APR needs the collector running over time on an archive/paid RPC.

# --- Dashboard (reads the same DB) ---
cd ../dapp && npm install
LPBOT_DB_PATH=$(pwd)/../../data/lp-bsc.db npm run dev        # http://localhost:3000
```

Chain is chosen by `CHAIN` (bot) / `NEXT_PUBLIC_CHAIN` (dapp), default `bsc`. The dapp's chain name, logo, and native symbol (BNB vs ETH) all follow it automatically.

The agent's private key is **encrypted (AES‑256‑GCM via `LPBOT_KEY_SECRET`)** and never leaves the bot process. Copy `.env.example` → `.env`.

---

## The dapp

- **Portfolio** — real on‑chain value, net vs HODL, positions, one‑click deposit/withdraw, agent‑wallet management.
- **Vault card** — create your `LpVault`, deposit, set the per‑op notional cap.
- **Leaderboard / Status** — cross‑wallet PnL, collector heartbeat, RPC / price‑feed / DB health.
- **Bilingual EN 🇬🇧 / ID 🇮🇩** (default EN) with a header toggle — cookie‑based, no reload.
- **Dynamic per‑chain identity** — one config drives the chain name, BNB logo, and native currency symbol everywhere.

---

## Testing

```bash
npm test -w @lp/bot          # 105 unit/regression tests (no network)
npm run typecheck -w @lp/bot
npm run test:live -w @lp/bot # RPC smoke (active chain)
forge test --root contracts  # 19 contract tests (fork tests need BSC_RPC_URL)
```

---

## Security

- Agent key encrypted at rest; funds in the vault; **owner‑only** withdraw; compromised agent can't drain.
- Executor is **simulation by default**; live trading is double‑gated (`EXECUTOR_LIVE=1` + armed wallet).
- `.env` and `data/` are gitignored — never commit keys or state.
- Contracts Slither‑audited; withdrawals restricted to the SIWE‑verified owner.
