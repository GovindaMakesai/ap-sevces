#!/usr/bin/env bash
# Run ON THE VPS after editing backend/.env with your OAuth secrets.
# Usage: bash deploy/hostinger/apply-oauth-env.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/ap-services}"
ENV_FILE="$APP_DIR/backend/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE — copy deploy/hostinger/vps.env.template first:"
  echo "  cp deploy/hostinger/vps.env.template backend/.env && nano backend/.env"
  exit 1
fi

set_or_append() {
  local key="$1"
  local val="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

echo "==> Setting OAuth callback URLs (Vercel HTTPS → VPS backend)"
set_or_append FRONTEND_URL "https://ap-sevces.vercel.app"
set_or_append OAUTH_CALLBACK_BASE "https://ap-sevces.vercel.app"
set_or_append GOOGLE_REDIRECT_URI "https://ap-sevces.vercel.app/auth/google/callback"
set_or_append GOOGLE_CALLBACK_URL "https://ap-sevces.vercel.app/auth/google/callback"
set_or_append GITHUB_CALLBACK_URL "https://ap-sevces.vercel.app/auth/github/callback"
set_or_append FACEBOOK_CALLBACK_URL "https://ap-sevces.vercel.app/auth/facebook/callback"

echo "==> Restart API"
cd "$APP_DIR"
pm2 restart ap-api
sleep 2

echo "==> Health"
curl -sf "http://127.0.0.1:${PORT:-5000}/api/health" && echo ""

echo "==> OAuth URLs loaded by server (check pm2 logs if empty):"
pm2 logs ap-api --lines 15 --nostream 2>/dev/null | grep -i "OAuth callbacks" || true

echo ""
echo "Done. Register the SAME URLs in Google / GitHub / Facebook consoles (see deploy/hostinger/OAUTH-SETUP.md)."
