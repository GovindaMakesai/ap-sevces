#!/usr/bin/env bash
# Run on VPS after git pull (also invoked by GitHub Actions).
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/ap-services}"
BRANCH="${DEPLOY_BRANCH:-main}"
SKIP_GIT="${SKIP_GIT:-0}"

cd "$APP_DIR"

OLD_HEAD=""
if [ "$SKIP_GIT" != "1" ]; then
  OLD_HEAD=$(git rev-parse HEAD 2>/dev/null || echo "")
  echo "==> Fetch latest ${BRANCH}"
  git fetch origin "$BRANCH"
  git reset --hard "origin/${BRANCH}"
elif [ -n "${DEPLOY_OLD_HEAD:-}" ]; then
  OLD_HEAD="$DEPLOY_OLD_HEAD"
elif [ -f .git/ORIG_HEAD ]; then
  OLD_HEAD=$(cat .git/ORIG_HEAD 2>/dev/null || echo "")
fi

NEW_HEAD=$(git rev-parse HEAD)
if [ -n "$OLD_HEAD" ] && [ "$OLD_HEAD" = "$NEW_HEAD" ]; then
  echo "==> Already up to date ($NEW_HEAD)"
  exit 0
fi

needs_api_restart=true
needs_npm_install=true
if [ -n "$OLD_HEAD" ] && [ "$OLD_HEAD" != "$NEW_HEAD" ]; then
  CHANGED=$(git diff --name-only "$OLD_HEAD" "$NEW_HEAD" || true)
  if [ -n "$CHANGED" ]; then
    if echo "$CHANGED" | grep -qE '^(backend/|package\.json|package-lock\.json|config/|ecosystem\.config\.js)'; then
      needs_api_restart=true
      needs_npm_install=true
    elif echo "$CHANGED" | grep -qvE '^(frontend/|ap-services-app/)'; then
      needs_api_restart=true
      needs_npm_install=true
    else
      echo "==> Frontend-only change — skip API restart (no 502 window)"
      needs_api_restart=false
      needs_npm_install=false
    fi
  fi
fi

if [ "$needs_npm_install" = true ]; then
  echo "==> Install dependencies"
  if [ -f package-lock.json ]; then
    npm ci --omit=dev || npm install --production
  else
    npm install --production
  fi
fi

if [ "$needs_api_restart" = true ]; then
  echo "==> Restart API"
  if pm2 describe ap-api >/dev/null 2>&1; then
    pm2 reload ecosystem.config.js --update-env || pm2 restart ap-api
  elif [ -f ecosystem.config.js ]; then
    pm2 start ecosystem.config.js
  else
    pm2 start backend/server.js --name ap-api --cwd "$APP_DIR"
  fi
  pm2 save

  echo "==> Health check"
  sleep 5
  for i in 1 2 3 4 5; do
    if curl -sf "http://127.0.0.1:${PORT:-5000}/api/health" >/dev/null; then
      curl -sf "http://127.0.0.1:${PORT:-5000}/api/health"
      echo ""
      break
    fi
    if [ "$i" -eq 5 ]; then
      echo "ERROR: API not responding on port ${PORT:-5000}. Last logs:"
      pm2 logs ap-api --err --lines 25 --nostream || true
      exit 1
    fi
    echo "Health check attempt $i failed — retrying in 3s..."
    sleep 3
  done
else
  echo "==> Static frontend updated (nginx serves frontend/ — no API restart)"
  if pm2 describe ap-api >/dev/null 2>&1; then
    curl -sf "http://127.0.0.1:${PORT:-5000}/api/health" && echo "" || echo "WARN: API health check failed — run: pm2 restart ap-api"
  fi
fi

NGINX_SITE="${NGINX_SITE:-/etc/nginx/sites-available/ap-services}"
if [ -f deploy/hostinger/nginx-ap-services.conf ] && command -v nginx >/dev/null 2>&1; then
  DOMAIN="${AP_DOMAIN:-api.apservices.in}"
  RENDERED="/tmp/nginx-ap-services-${DOMAIN}.conf"
  sed "s/__DOMAIN__/${DOMAIN}/g" deploy/hostinger/nginx-ap-services.conf > "$RENDERED"
  if [ ! -f "$NGINX_SITE" ] || ! cmp -s "$RENDERED" "$NGINX_SITE" 2>/dev/null; then
    echo "==> Apply nginx site config for ${DOMAIN}"
    if command -v sudo >/dev/null 2>&1; then
      sudo cp "$RENDERED" "$NGINX_SITE"
      sudo ln -sf "$NGINX_SITE" "/etc/nginx/sites-enabled/ap-services"
      sudo nginx -t && sudo systemctl reload nginx
    else
      cp "$RENDERED" "$NGINX_SITE"
      ln -sf "$NGINX_SITE" "/etc/nginx/sites-enabled/ap-services"
      nginx -t && systemctl reload nginx
    fi
  fi
fi

echo "Deploy complete."
