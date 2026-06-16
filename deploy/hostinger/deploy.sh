#!/usr/bin/env bash
# Run on VPS after git pull (also invoked by GitHub Actions).
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/ap-services}"
BRANCH="${DEPLOY_BRANCH:-main}"
SKIP_GIT="${SKIP_GIT:-0}"

cd "$APP_DIR"

if [ "$SKIP_GIT" != "1" ]; then
  echo "==> Fetch latest ${BRANCH}"
  git fetch origin "$BRANCH"
  git reset --hard "origin/${BRANCH}"
fi

echo "==> Install dependencies"
if [ -f package-lock.json ]; then
  npm ci --omit=dev || npm install --production
else
  npm install --production
fi

echo "==> Restart API"
if pm2 describe ap-api >/dev/null 2>&1; then
  pm2 delete ap-api || true
fi
if [ -f ecosystem.config.js ]; then
  pm2 start ecosystem.config.js
else
  pm2 start backend/server.js --name ap-api --cwd "$APP_DIR"
fi
pm2 save

echo "==> Health check"
sleep 4
if ! curl -sf "http://127.0.0.1:${PORT:-5000}/api/health" >/dev/null; then
  echo "ERROR: API not responding on port ${PORT:-5000}. Last logs:"
  pm2 logs ap-api --err --lines 25 --nostream || true
  exit 1
fi
curl -sf "http://127.0.0.1:${PORT:-5000}/api/health"
echo ""
echo "Deploy complete."
