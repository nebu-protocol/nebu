# Nebu — the onchain agent labor market (BNB Agent Studio Marketplace)

**Hackathon:** The Smart Money Era — "Build the Era" (BNB Agent Studio Marketplace).
Main prize $30k + official adoption. Build 5 Aug → **9 Sep** (submit), judging 9–23 Sep.

## Thesis

> **Verify. Hire. Pay for performance — never your keys.**

Not a directory of agents. A **labor market**: verify an agent's on-chain track record,
**hire** it non-custodially (it works your capital, can't withdraw), and pay only when it
performs. The three things people fear about AI agents — *can I trust it, can it rug me,
is it worth paying* — solved at once.

## Judging → our answer (weighting)

| Criterion | Weight | How we win it |
|---|---|---|
| Functionality | 40% | Land → browse by category → understand → **activate**, one smooth flow. Deployed & live. |
| Data quality | 30% | Real-time, **on-chain-verifiable** performance per agent (realized PnL, reconciles w/ GMGN). |
| Agent diversity | 30% | All **4 categories** live on BSC: rebalancing, grid, yield, health-factor. |

## Innovation pillars (each demoable)

1. **Proof-of-Performance identity (ERC-8004)** — trustless leaderboard, realized PnL settled on-chain. Not reviews.
2. **Non-custodial hire = scoped vault session** — spend-cap, allowlist, expiry, revoke. Agent executes, can't withdraw. *(reuse LpVault; maps Altana track)*
3. **Pay-for-performance (x402)** — success-fee / benchmark-slashing; bad agents starve. *(maps TermiX)*
4. **AI Concierge front door** — NL intent → compose a *team* of agents into one vault. *(Functionality 40%)*

North-star (stretch): meta-agent that reallocates budget across hired agents by live performance.

## One build → four prize pools

- **Main $30k** — the 4-category marketplace.
- **PancakeSwap 1000 CAKE** — Nebu LP already benefits LPs.
- **Altana 50k XP** — vault = sessions/caps/revocation/Keystore.
- **TermiX $10k** — Agent Advantage Report from real PnL.

## Reuse map (~70% exists)

| Existing asset | Becomes |
|---|---|
| `LpVault` (act, can't withdraw) | non-custodial **hire** primitive |
| LP/yield bot (range rebalance + fees) | flagship **rebalancing** agent, live on BSC |
| Honest realized PnL (`positions_pnl`, `pnl_history`) | **data-quality** layer + leaderboard |
| Next.js dashboard (deployed live) | marketplace **shell** |
| Honeypot/fee gate | "won't hire you into a scam" safety |

## Workstreams

**A. Marketplace shell** — `app/marketplace` (land/browse), agent registry `lib/agents.ts`,
agent detail page, activate flow. → *Functionality.*

**B. 4 agents live on BSC** — rebalancing ✅ (Nebu LP), + build thin but real:
- **Yield** — auto-compound / best-pool finder on PancakeSwap.
- **Grid** — buy-low/sell-high in a range (reuse swap+vault).
- **Health-factor** — Venus position guard (repay/add before liquidation).

**C. Data layer (BNB, verifiable)** — per-agent metrics from DB; **must read `lp-bsc.db`, not
Robinhood `lp.db`**; native symbol = **BNB** (fix 0x0 → BNB, currently mislabeled "ETH");
seed/collect **real BNB pools** (CAKE/BNB etc.) so listings are BNB tokens, not four.meme junk.

**D. Hire = scoped session** — vault session UI (cap/allowlist/expiry/revoke). Altana or vault-native.

**E. Standards (bonus)** — ERC-8004 identity registration, x402 payment, TermiX advantage report.

## 12-day milestones (demoable each day)

1. Shell + registry + 4 category browse (static metrics). ← today
2. Agent detail page + activate CTA (mock).
3. Data layer: flagship live metrics from `lp-bsc.db` (BNB), fix native=BNB.
4. Seed real BNB pools; leaderboard trustless.
5–6. Build Grid agent (real, on BSC).
7. Build Health-factor agent (Venus).
8. Build Yield agent.
9. Non-custodial hire flow (vault session: cap/expiry/revoke).
10. AI Concierge (NL → recommend/compose team).
11. ERC-8004 + x402 (bonus) + TermiX report auto-gen.
12. Polish, e2e, deploy, record demo. All 4 agents live + public.

## Honest risks

- ERC-8004/x402/Altana = new standards → **bonus, not blockers**.
- Diversity must be **real** (no fake agents).
- BNB data currently thin/four.meme; needs real-pool seeding (workstream C).
- Value prop is **deterministic** (discovery/trust/non-custodial) — no "guaranteed profit" claim.
