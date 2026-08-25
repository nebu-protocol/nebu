#!/usr/bin/env bash
# pm2 menjalankan dapp publik (Next.js) di $PORT (default 3016). Node 22 via nvm.
set -euo pipefail
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
nvm use 22 >/dev/null
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO/apps/dapp"
[ -f "$REPO/.env" ] && set -a && . "$REPO/.env" && set +a
exec node_modules/next/dist/bin/next start -p "${PORT:-3016}"
