#!/usr/bin/env bash
# Install Monday weekly DB backup cron on the VPS.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/ap-services}"
SCRIPT="$APP_DIR/deploy/hostinger/backup-db.sh"
CRON_MARK="# ap-services-db-backup-monday"

[[ -x "$SCRIPT" ]] || chmod +x "$SCRIPT"
[[ -f "$SCRIPT" ]] || { echo "Missing $SCRIPT"; exit 1; }

# Monday 03:00 UTC (~08:30 IST). Keep 8 weekly dumps under /var/backups/ap-services-db.
CRON_LINE="0 3 * * 1 $SCRIPT >> /var/backups/ap-services-db/cron.log 2>&1 $CRON_MARK"

tmpdir="$(mktemp)"
crontab -l 2>/dev/null | grep -v "$CRON_MARK" >"$tmpdir" || true
echo "$CRON_LINE" >>"$tmpdir"
crontab "$tmpdir"
rm -f "$tmpdir"

echo "Installed cron:"
crontab -l | grep "$CRON_MARK"
echo
echo "Run once now: $SCRIPT"
