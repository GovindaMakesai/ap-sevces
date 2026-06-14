#!/usr/bin/env bash
# Run ON VPS as root after DNS A record → 62.72.56.74
# Usage: bash deploy/hostinger/setup-https.sh api.yourdomain.com your@email.com
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-admin@${DOMAIN}}"

if [ -z "$DOMAIN" ]; then
  echo "Usage: bash deploy/hostinger/setup-https.sh api.yourdomain.com [email@example.com]"
  exit 1
fi

APP_DIR="${APP_DIR:-/var/www/ap-services}"
ENV_FILE="$APP_DIR/backend/.env"
HTTPS_ORIGIN="https://${DOMAIN}"

echo "==> Domain: $DOMAIN"
echo "==> Email:  $EMAIL"

apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y nginx certbot

mkdir -p /var/www/certbot

echo "==> Step 1: HTTP-only nginx (for certbot challenge)"
sed "s/__DOMAIN__/${DOMAIN}/g" "$APP_DIR/deploy/hostinger/nginx-ap-services-http.conf" \
  > /etc/nginx/sites-available/ap-services
ln -sf /etc/nginx/sites-available/ap-services /etc/nginx/sites-enabled/ap-services
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl enable nginx && systemctl reload nginx

echo "==> Step 2: Let's Encrypt certificate"
certbot certonly --webroot -w /var/www/certbot -d "$DOMAIN" \
  --agree-tos --non-interactive -m "$EMAIL"

echo "==> Step 3: Full HTTPS nginx (API + auth + frontend + socket.io)"
sed "s/__DOMAIN__/${DOMAIN}/g" "$APP_DIR/deploy/hostinger/nginx-ap-services.conf" \
  > /etc/nginx/sites-available/ap-services
nginx -t && systemctl reload nginx

echo "==> Step 4: backend/.env"
touch "$ENV_FILE"
set_env() {
  local k="$1" v="$2"
  if grep -q "^${k}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${k}=.*|${k}=${v}|" "$ENV_FILE"
  else
    echo "${k}=${v}" >> "$ENV_FILE"
  fi
}

set_env "FRONTEND_URL" "$HTTPS_ORIGIN"
set_env "OAUTH_CALLBACK_BASE" "$HTTPS_ORIGIN"
set_env "GOOGLE_REDIRECT_URI" "${HTTPS_ORIGIN}/auth/google/callback"
set_env "GOOGLE_CALLBACK_URL" "${HTTPS_ORIGIN}/auth/google/callback"
set_env "GITHUB_CALLBACK_URL" "${HTTPS_ORIGIN}/auth/github/callback"
set_env "FACEBOOK_CALLBACK_URL" "${HTTPS_ORIGIN}/auth/facebook/callback"
set_env "PUBLIC_HTTPS_URL" "$HTTPS_ORIGIN"

echo "==> Step 5: Restart API"
cd "$APP_DIR"
pm2 restart ap-api 2>/dev/null || pm2 start backend/server.js --name ap-api
pm2 save

echo ""
echo "============================================"
echo " DONE: $HTTPS_ORIGIN"
echo "============================================"
curl -sf "${HTTPS_ORIGIN}/api/health" && echo "" || echo "(health check failed — check pm2 logs)"
echo ""
echo "Add to Google / GitHub / Facebook:"
echo "  ${HTTPS_ORIGIN}/auth/google/callback"
echo "  ${HTTPS_ORIGIN}/auth/github/callback"
echo "  ${HTTPS_ORIGIN}/auth/facebook/callback"
echo ""
echo "On PC: set USE_HTTPS_DOMAIN=true in config/domain.js + ap-config.js, then git push."
