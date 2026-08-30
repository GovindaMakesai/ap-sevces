#!/usr/bin/env bash
# Run on VPS after reboot: bash deploy/hostinger/recover-api.sh
set -euo pipefail
APP_DIR="${APP_DIR:-/var/www/ap-services}"
cd "$APP_DIR"

echo "==> Memory / disk"
free -h || true
df -h / /var || true

echo "==> Redis"
systemctl is-active redis-server 2>/dev/null || systemctl is-active redis 2>/dev/null || echo "redis unknown"

echo "==> PM2"
pm2 list || true
pm2 restart ap-api --update-env || pm2 start ecosystem.config.js
pm2 save

echo "==> Health (up to 60s)"
for i in $(seq 1 12); do
  if curl -sf "http://127.0.0.1:${PORT:-5000}/api/health" >/dev/null; then
    curl -sf "http://127.0.0.1:${PORT:-5000}/api/health"
    echo ""
    echo "API online"
    exit 0
  fi
  echo "attempt $i..."
  sleep 5
done

echo "ERROR: API still down"
pm2 logs ap-api --err --lines 30 --nostream || true
exit 1
