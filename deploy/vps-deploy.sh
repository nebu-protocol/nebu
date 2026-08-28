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

echo "==> nginx vhost + SSL untuk nebu.ifajar.dev (idempotent)"
if command -v nginx >/dev/null 2>&1; then
  SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo -n"
  if [ ! -e /etc/nginx/sites-enabled/nebu.ifajar.dev ]; then
    $SUDO cp deploy/nginx-nebu.ifajar.dev.conf /etc/nginx/sites-available/nebu.ifajar.dev 2>/dev/null \
      && $SUDO ln -sf /etc/nginx/sites-available/nebu.ifajar.dev /etc/nginx/sites-enabled/nebu.ifajar.dev 2>/dev/null \
      && echo "   vhost nebu.ifajar.dev dipasang" || echo "   (gagal pasang vhost — perlu sudo)"
  fi
  if $SUDO nginx -t 2>/dev/null; then
    $SUDO systemctl reload nginx 2>/dev/null && echo "   nginx reload OK"
    if command -v certbot >/dev/null 2>&1 && [ ! -d /etc/letsencrypt/live/nebu.ifajar.dev ]; then
      $SUDO certbot --nginx -d nebu.ifajar.dev --non-interactive --agree-tos \
        --register-unsafely-without-email --redirect 2>/dev/null \
        && echo "   SSL nebu.ifajar.dev OK" || echo "   (certbot gagal — jalankan manual: sudo certbot --nginx -d nebu.ifajar.dev)"
    fi
  else
    echo "   (nginx -t / sudo tak tersedia — lewati; jalankan deploy/setup-nginx.sh manual)"
  fi
else
  echo "   (nginx tak terpasang — lewati)"
fi

echo "==> selesai"
pm2 status
