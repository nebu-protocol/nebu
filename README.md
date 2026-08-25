# LP Auto — Robinhood Chain

Bot auto-LP untuk Uniswap v4 di Robinhood Chain + dashboard admin (Next.js).
Scan pool → ranking yield → strategist (gate umur/hook/APR) → executor
(swap + mint LP, default **simulasi**) → benchmark PnL vs HODL.

## Struktur

```
apps/bot         @lp/bot — scanner/strategist/executor (TypeScript + viem, node:sqlite)
apps/backoffice  dashboard Next.js (baca DB bot, kelola wallet, kill switch)
deploy/          wrapper pm2, nginx, script deploy VPS
data/lp.db       SQLite (gitignored) — semua state
```

## Prasyarat

- **Node ≥ 22.5** (butuh `node:sqlite`). Di server pakai nvm kalau sistem Node lebih lama.

## Jalan lokal

```bash
# 1. Bot
cd apps/bot && npm install
npm run backfill          # sekali: index semua pool (~10-20 mnt)
npm run collect -- once   # satu siklus, atau `collect -- 60` untuk loop

# 2. Dashboard
cd ../backoffice && npm install && npm run dev   # http://localhost:3000/dashboard/lpbot
```

Buat `.env` dari `.env.example` (isi `LPBOT_KEY_SECRET`).

## Test

```bash
npm test -w @lp/bot        # unit + regression + integration (cepat, tanpa jaringan)
npm run test:stress -w @lp/bot
npm run test:live -w @lp/bot   # smoke ke RPC
```

## Deploy (VPS + pm2 + nginx)

Ringkas — detail di `deploy/`:

```bash
# di VPS (Node 22 via nvm), sekali:
git clone https://github.com/FjrREPO/lp-auto.git ~/lp-auto && cd ~/lp-auto
cp .env.example .env && nano .env          # isi LPBOT_KEY_SECRET
bash deploy/vps-deploy.sh                   # install, build, backfill, pm2 start
# nginx + SSL:
sudo cp deploy/nginx-lp.ifajar.dev.conf /etc/nginx/sites-available/lp.ifajar.dev
sudo ln -sf /etc/nginx/sites-available/lp.ifajar.dev /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d lp.ifajar.dev
```

CI (`.github/workflows/ci.yml`) jalan typecheck + test + build tiap push.
CD (`deploy.yml`) auto-deploy ke VPS saat CI hijau — butuh repo secrets
`VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`.

## Keamanan

- Private key wallet **dienkripsi** (AES-256-GCM) sebelum disimpan; tak pernah ke client.
- `.env` & `data/` **gitignored** — jangan pernah di-commit.
- Executor default **simulasi**; transaksi live butuh `EXECUTOR_LIVE=1` **dan** wallet automation on.
- Dashboard **noindex** (robots) — panel privat, jangan terindeks.
