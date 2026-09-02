#!/usr/bin/env bash
# Run ON THE VPS to add Twilio Verify env vars without overwriting existing values.
# Usage (do not paste secrets into shell history — use a local file):
#   export TWILIO_ACCOUNT_SID=AC...
#   export TWILIO_API_KEY_SID=SK...
#   export TWILIO_API_KEY_SECRET=...
#   export TWILIO_VERIFY_SERVICE_SID=VA...
#   bash deploy/hostinger/apply-twilio-env.sh
#
# Or one-liner from your machine (SSH):
#   ssh root@VPS 'bash -s' < deploy/hostinger/apply-twilio-env.sh
set -euo pipefail

ENV_FILE="${ENV_FILE:-/var/www/ap-services/backend/.env}"

set_or_append() {
  local key="$1"
  local val="$2"
  if [ -z "$val" ]; then
    echo "SKIP $key (empty)"
    return
  fi
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
    echo "UPDATED $key"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
    echo "ADDED $key"
  fi
}

for key in TWILIO_ACCOUNT_SID TWILIO_API_KEY_SID TWILIO_API_KEY_SECRET TWILIO_VERIFY_SERVICE_SID; do
  val="${!key:-}"
  set_or_append "$key" "$val"
done

echo "==> Restarting API"
pm2 restart ap-api --update-env || pm2 restart ap-api
sleep 2
pm2 status ap-api || true
curl -sf http://127.0.0.1:5000/api/health | head -c 200 || echo "health check pending"
