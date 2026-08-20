#!/usr/bin/env bash
# Restart ap-api only if nothing is listening on the API port.
# Do not curl /api/health: a slow database used to fail that check and
# SIGINT-restart the process every 2 minutes (slow → restart → slow).
set -u

PORT="${PORT:-5000}"
APP_NAME="${APP_NAME:-ap-api}"
APP_DIR="${APP_DIR:-/var/www/ap-services}"
LOCK="${DEPLOY_LOCK:-/var/lock/ap-api-deploy.lock}"

port_up() {
  ss -lptn 2>/dev/null | grep -qE ":${PORT}[[:space:]]"
}

if port_up; then
  exit 0
fi

# A deploy or graceful reload may have dropped the port for a few seconds.
if [[ -f "$LOCK" ]] && command -v fuser >/dev/null 2>&1 && fuser "$LOCK" >/dev/null 2>&1; then
  logger -t ap-api-watchdog "port ${PORT} down during deploy — skip"
  exit 0
fi

sleep 8
if port_up; then
  exit 0
fi

logger -t ap-api-watchdog "port ${PORT} down — restarting ${APP_NAME}"
if command -v pm2 >/dev/null 2>&1 && pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 restart "$APP_NAME" --update-env >/dev/null 2>&1 || true
elif [[ -f "$APP_DIR/ecosystem.config.js" ]]; then
  pm2 start "$APP_DIR/ecosystem.config.js" >/dev/null 2>&1 || true
fi
