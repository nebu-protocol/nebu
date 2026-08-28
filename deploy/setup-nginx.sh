#!/usr/bin/env bash
# Pasang nginx untuk nebu.ifajar.dev (dapp:3016) + bo-nebu.ifajar.dev (backoffice:3015).
# Jalankan: sudo bash ~/lp-auto/deploy/setup-nginx.sh
# Idempotent — aman diulang. Memperbaiki symlink menggantung juga.
set -e
D="$(cd "$(dirname "$0")" && pwd)"

cp "$D/nginx-nebu.ifajar.dev.conf"    /etc/nginx/sites-available/nebu.ifajar.dev
cp "$D/nginx-bo-nebu.ifajar.dev.conf" /etc/nginx/sites-available/bo-nebu.ifajar.dev
ln -sf /etc/nginx/sites-available/nebu.ifajar.dev    /etc/nginx/sites-enabled/nebu.ifajar.dev
ln -sf /etc/nginx/sites-available/bo-nebu.ifajar.dev /etc/nginx/sites-enabled/bo-nebu.ifajar.dev

nginx -t
systemctl reload nginx
echo "OK: nginx dimuat. nebu.ifajar.dev->3016, bo-nebu.ifajar.dev->3015"
echo "Lanjut (setelah DNS A record ke server ini): sudo certbot --nginx -d nebu.ifajar.dev -d bo-nebu.ifajar.dev"
