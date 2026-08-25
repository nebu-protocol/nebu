#!/usr/bin/env bash
# pm2 menjalankan ini untuk collector loop (activity→snapshot→plan→execute→pnl tiap jam).
# Node 22 via nvm. Loop internal aman di bawah pm2 (bukan sesi ephemeral).
set -euo pipefail
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
nvm use 22 >/dev/null
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO/apps/bot"
[ -f "$REPO/.env" ] && set -a && . "$REPO/.env" && set +a
exec node_modules/.bin/tsx --env-file-if-exists="$REPO/.env" src/index.ts collect 60
