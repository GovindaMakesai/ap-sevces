#!/usr/bin/env bash
# Apply nginx performance config on Hostinger VPS after git pull.
# Usage (as root): bash deploy/hostinger/apply-nginx-perf.sh [domain]
set -euo pipefail

DOMAIN="${1:-}"
APP_DIR="${APP_DIR:-/var/www/ap-services}"
SITE="/etc/nginx/sites-available/ap-services"

if [ -z "$DOMAIN" ]; then
  if [ -f "$SITE" ]; then
    DOMAIN="$(awk '/server_name/ {print $2; exit}' "$SITE" | tr -d ';')"
  fi
fi
if [ -z "$DOMAIN" ] || [ "$DOMAIN" = "__DOMAIN__" ]; then
  echo "Usage: bash deploy/hostinger/apply-nginx-perf.sh your.domain.com"
  exit 1
fi

echo "==> Applying nginx perf config for $DOMAIN"
sed "s/__DOMAIN__/${DOMAIN}/g" "$APP_DIR/deploy/hostinger/nginx-ap-services.conf" > "$SITE"
nginx -t
systemctl reload nginx

echo "==> Install compression dep + restart API"
cd "$APP_DIR"
npm install compression --omit=dev --no-fund --no-audit 2>/dev/null || npm install compression
pm2 restart ap-api || pm2 start ecosystem.config.js
pm2 save

echo "DONE. Force-close the app so clients pick up cached JS with new ?v=."
