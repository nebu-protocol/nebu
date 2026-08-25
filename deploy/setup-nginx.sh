#!/usr/bin/env bash
# Pasang nginx untuk lp.ifajar.dev (dapp:3016) + bo-lp.ifajar.dev (backoffice:3015).
# Jalankan: sudo bash ~/lp-auto/deploy/setup-nginx.sh
# Idempotent — aman diulang. Memperbaiki symlink menggantung juga.
set -e
D="$(cd "$(dirname "$0")" && pwd)"

cp "$D/nginx-lp.ifajar.dev.conf"    /etc/nginx/sites-available/lp.ifajar.dev
cp "$D/nginx-bo-lp.ifajar.dev.conf" /etc/nginx/sites-available/bo-lp.ifajar.dev
ln -sf /etc/nginx/sites-available/lp.ifajar.dev    /etc/nginx/sites-enabled/lp.ifajar.dev
ln -sf /etc/nginx/sites-available/bo-lp.ifajar.dev /etc/nginx/sites-enabled/bo-lp.ifajar.dev

nginx -t
systemctl reload nginx
echo "OK: nginx dimuat. lp.ifajar.dev->3016, bo-lp.ifajar.dev->3015"
echo "Lanjut (setelah DNS A record ke server ini): sudo certbot --nginx -d lp.ifajar.dev -d bo-lp.ifajar.dev"
