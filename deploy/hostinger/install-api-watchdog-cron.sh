#!/usr/bin/env bash
# Install a port-only API watchdog (does not restart on slow DB).
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/ap-services}"
SRC="$APP_DIR/deploy/hostinger/ap-api-watchdog.sh"
DEST="/usr/local/bin/ap-api-watchdog.sh"
CRON_MARK="# ap-services-api-watchdog"

[[ -f "$SRC" ]] || { echo "Missing $SRC"; exit 1; }
install -m 755 "$SRC" "$DEST"

# Every 2 minutes; script no-ops if :5000 is listening.
CRON_LINE="*/2 * * * * $DEST $CRON_MARK"

tmpdir="$(mktemp)"
crontab -l 2>/dev/null | grep -v "$CRON_MARK" | grep -v 'ap-api-watchdog.sh' >"$tmpdir" || true
echo "$CRON_LINE" >>"$tmpdir"
crontab "$tmpdir"
rm -f "$tmpdir"

echo "Installed watchdog cron:"
crontab -l | grep -E 'ap-api-watchdog|ap-services-api-watchdog'
