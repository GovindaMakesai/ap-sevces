#!/usr/bin/env bash
# Run ON THE VPS after creating a new Agora project (ap-service).
# Usage: sudo bash deploy/hostinger/update-agora-on-vps.sh
set -euo pipefail

ENV_FILE="${ENV_FILE:-/var/www/ap-services/backend/.env}"
APP_ID="${AGORA_APP_ID:?Set AGORA_APP_ID}"
CERT="${AGORA_APP_CERTIFICATE:?Set AGORA_APP_CERTIFICATE}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE"
  exit 1
fi

set_kv() {
  local key="$1"
  local val="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

set_kv AGORA_APP_ID "$APP_ID"
set_kv AGORA_APP_CERTIFICATE "$CERT"

echo "Updated Agora credentials in $ENV_FILE"
grep -E '^AGORA_' "$ENV_FILE"

pm2 restart ap-api --update-env
sleep 3
curl -sf "http://127.0.0.1:${PORT:-5000}/api/live/agora/config" | head -c 500
echo ""
echo "Done. ready:true means voice tokens will work."
