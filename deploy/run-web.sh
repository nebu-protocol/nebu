#!/usr/bin/env bash
# pm2 menjalankan ini untuk web (Next.js). Paksa Node 22 via nvm — sistem Node 20
# tidak punya node:sqlite. Port dari $PORT (default 3005).
set -euo pipefail
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
nvm use 22 >/dev/null
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO/apps/backoffice"
[ -f "$REPO/.env" ] && set -a && . "$REPO/.env" && set +a
exec node_modules/next/dist/bin/next start -p "${PORT:-3005}"
