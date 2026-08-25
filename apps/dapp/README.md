# Sowee dapp

Web app for Sowee — compliant invoice financing on Hedera. Issuers tokenize
unpaid invoices as compliant bonds; investors fund them at a discount in USDC
and trade them on a compliant secondary market; settlement happens
automatically at maturity.

Everything on screen is **mock data** (`src/lib/mock/`) — Hedera testnet
wiring lands in a later issue. Wallet connect (Dynamic) is live.

## Stack

Next.js (App Router) · Tailwind CSS v4 · @dynamic-labs (wallet) ·
@tanstack/react-query · phantom-ui (loading skeletons) · lucide-react.

## Run

This directory is its own pnpm root (see `pnpm-workspace.yaml`), independent
of the monorepo workspace:

```bash
cd apps/dapp
pnpm install
pnpm dev        # http://localhost:3000
pnpm build      # production build
pnpm typecheck
```

Optional env vars: copy `.env.example` to `.env` (works with none set).

## Lint

Biome, using the repo-root config (this dir is gitignored from the root's
VCS view, so disable VCS integration):

```bash
# from the repo root
pnpm exec biome check --vcs-enabled=false apps/dapp
```

## Pages

| Route            | What                                                            |
| ---------------- | --------------------------------------------------------------- |
| `/`              | Marketplace: invoice bonds with APY, funding progress, filters  |
| `/invoices/[id]` | Bond detail: funding, buy panel, HCS audit trail, document hash |
| `/portfolio`     | Investor holdings + claimable settlements (wallet-gated)        |
| `/issuer`        | Issuer dashboard: my invoices and statuses (wallet-gated)       |
| `/issuer/new`    | Submit invoice: payor, face value, due date, client-side SHA-256 |
