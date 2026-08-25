#!/bin/bash
# Satu siklus collector. Dipanggil launchd/cron tiap jam. Log ke data/collect.log.
set -euo pipefail
REPO="/Users/koalaterbang/scraper/sniper"
cd "$REPO/apps/bot"
# muat .env root (LPBOT_KEY_SECRET, EXECUTOR_LIVE, dst.) kalau ada
[ -f "$REPO/.env" ] && set -a && . "$REPO/.env" && set +a
exec npx tsx src/index.ts collect once >> "$REPO/data/collect.log" 2>&1
