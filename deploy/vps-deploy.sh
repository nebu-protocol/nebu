#!/usr/bin/env bash
# Deploy/update di VPS. Idempotent: aman dijalankan berulang.
# Dipanggil manual (bash deploy/vps-deploy.sh) atau oleh GitHub Actions.
set -euo pipefail
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
nvm use 22 >/dev/null

REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"
# muat .env supaya build punya env (TURNSTILE dll.)
[ -f "$REPO/.env" ] && set -a && . "$REPO/.env" && set +a

echo "==> pull (skip kalau remote butuh auth / rsync-based deploy)"
git pull --ff-only 2>/dev/null || echo "   (lewati git pull — kode diasumsikan sudah sinkron via rsync)"

echo "==> install bot"
(cd apps/bot && npm install --no-audit --no-fund)

echo "==> install + build backoffice"
(cd apps/backoffice && npm install --no-audit --no-fund && npx next build)

echo "==> install + build dapp"
(cd apps/dapp && npm install --no-audit --no-fund && npx next build)

echo "==> backfill sekali kalau DB belum ada pools"
if [ ! -f data/lp.db ] || [ "$(node -e "try{const{DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('data/lp.db');console.log(d.prepare('SELECT COUNT(*) n FROM pools').get().n)}catch(e){console.log(0)}")" = "0" ]; then
  echo "   DB kosong — jalankan backfill (bisa ~10-20 menit)"
  (cd apps/bot && node_modules/.bin/tsx --env-file-if-exists="$REPO/.env" src/index.ts backfill)
fi

echo "==> pm2 reload"
pm2 startOrReload ecosystem.config.cjs
pm2 save

echo "==> selesai"
pm2 status
