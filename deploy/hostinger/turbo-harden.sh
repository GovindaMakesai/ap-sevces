#!/usr/bin/env bash
# One-shot "sonic + stable" harden for Hostinger KVM.
# Usage (as root):
#   cd /var/www/ap-services && git pull && bash deploy/hostinger/turbo-harden.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/ap-services}"
ENV_FILE="$APP_DIR/backend/.env"
cd "$APP_DIR"

echo "==> 1) Env: long sessions + fast boot"
touch "$ENV_FILE"
set_env() {
  local k="$1" v="$2"
  if grep -q "^${k}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${k}=.*|${k}=${v}|" "$ENV_FILE"
  else
    echo "${k}=${v}" >> "$ENV_FILE"
  fi
}
set_env "NODE_ENV" "production"
set_env "ACCESS_TOKEN_TTL" "7d"
set_env "COOKIE_SECURE" "true"
set_env "SKIP_DB_SCHEMA_ENSURE" "true"
set_env "PG_POOL_MAX" "15"

echo "==> 2) Nginx JS/CSS cache patch"
if [ -f deploy/hostinger/apply-nginx-perf.sh ]; then
  bash deploy/hostinger/apply-nginx-perf.sh api.apservices.in || \
  bash deploy/hostinger/apply-nginx-perf.sh || true
fi

echo "==> 3) Node deps"
npm install compression --omit=dev --no-fund --no-audit 2>/dev/null || true

echo "==> 4) PM2 reload with hardened ecosystem"
pm2 delete ap-api 2>/dev/null || true
pm2 start ecosystem.config.js --update-env
pm2 save
pm2 install pm2-logrotate 2>/dev/null || true
pm2 set pm2-logrotate:max_size 10M 2>/dev/null || true
pm2 set pm2-logrotate:retain 7 2>/dev/null || true

echo "==> 5) Health check"
sleep 1
curl -sf http://127.0.0.1:5000/api/health >/dev/null && echo "API health OK" || echo "API health check failed — see: pm2 logs ap-api"
curl -sI https://api.apservices.in/social-live.js 2>/dev/null | grep -i cache-control || true

echo ""
echo "============================================"
echo " SONIC HARDEN DONE"
echo "============================================"
echo "Next (once, optional CDN — biggest free speedup):"
echo "  1. Put Cloudflare in front of api.apservices.in (orange cloud)"
echo "  2. SSL mode Full (strict)"
echo "  3. Caching level Standard + Auto Minify JS/CSS"
echo "Force-close the mobile app once."
echo ""
echo "When you need DB migrations later:"
echo "  FORCE_SCHEMA_ENSURE=true pm2 restart ap-api --update-env"
echo "  # then set SKIP_DB_SCHEMA_ENSURE=true again"
