#!/usr/bin/env bash
# Weekly full PostgreSQL backup (pg_dump) for AP Services.
# Intended cron: every Monday (see install-db-backup-cron.sh).
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/ap-services}"
ENV_FILE="${ENV_FILE:-$APP_DIR/backend/.env}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/ap-services-db}"
KEEP_WEEKS="${KEEP_WEEKS:-8}"
LOG_FILE="${LOG_FILE:-$BACKUP_DIR/backup.log}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

ts() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }

log() {
  echo "[$(ts)] $*" | tee -a "$LOG_FILE"
}

die() {
  log "ERROR: $*"
  exit 1
}

[[ -f "$ENV_FILE" ]] || die "Missing env file: $ENV_FILE"

# Prefer a client that matches Supabase Postgres 17+.
PG_DUMP_BIN="${PG_DUMP_BIN:-}"
if [[ -z "$PG_DUMP_BIN" ]]; then
  for candidate in /usr/lib/postgresql/17/bin/pg_dump /usr/lib/postgresql/18/bin/pg_dump pg_dump; do
    if command -v "$candidate" >/dev/null 2>&1 || [[ -x "$candidate" ]]; then
      PG_DUMP_BIN="$candidate"
      break
    fi
  done
fi
[[ -n "$PG_DUMP_BIN" ]] || die "pg_dump not found (install postgresql-client-17)"

# Prefer an explicit direct URL for dumps; fall back to DATABASE_URL.
pick_env() {
  local key="$1"
  awk -F= -v k="$key" '
    $0 ~ "^[[:space:]]*" k "=" {
      v=$0; sub(/^[^=]+=/,"",v); gsub(/\r/,"",v); print v; exit
    }
  ' "$ENV_FILE"
}
DB_URL="$(pick_env BACKUP_DATABASE_URL)"
[[ -n "${DB_URL:-}" ]] || DB_URL="$(pick_env DATABASE_URL_DIRECT)"
[[ -n "${DB_URL:-}" ]] || DB_URL="$(pick_env DATABASE_URL)"
[[ -n "${DB_URL:-}" ]] || die "No DATABASE_URL in $ENV_FILE"

# Strip surrounding quotes if present.
DB_URL="${DB_URL%\"}"
DB_URL="${DB_URL#\"}"
DB_URL="${DB_URL%\'}"
DB_URL="${DB_URL#\'}"

# Supabase transaction pooler (6543) cannot run pg_dump reliably.
# Prefer session mode on the same host (5432), or a direct db.*.supabase.co URL via BACKUP_DATABASE_URL.
if [[ "$DB_URL" == *":6543/"* ]] || [[ "$DB_URL" == *":6543?"* ]]; then
  DB_URL="${DB_URL/:6543/:5432}"
  log "Using session-mode port 5432 for dump (was 6543 pooler)"
fi

STAMP="$(date -u '+%Y%m%d')"
OUT="$BACKUP_DIR/ap-services-full-$STAMP.dump"
TMP="$OUT.tmp"

log "Starting full DB backup -> $OUT"

# Custom format (-Fc): compressed, restorable with pg_restore.
# --no-owner/--no-acl: safer for restore on another role/project.
log "Using $PG_DUMP_BIN ($("$PG_DUMP_BIN" --version 2>/dev/null | head -1))"

if ! "$PG_DUMP_BIN" "$DB_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="$TMP" \
  2>>"$LOG_FILE"; then
  rm -f "$TMP"
  die "pg_dump failed (see $LOG_FILE). If using Supabase, set BACKUP_DATABASE_URL to the Direct connection (db.<ref>.supabase.co:5432)."
fi

mv -f "$TMP" "$OUT"
SIZE="$(du -h "$OUT" | awk '{print $1}')"
log "Backup OK ($SIZE): $OUT"

# Retention: keep newest KEEP_WEEKS dump files.
mapfile -t OLD < <(ls -1t "$BACKUP_DIR"/ap-services-full-*.dump 2>/dev/null | tail -n +$((KEEP_WEEKS + 1)) || true)
if ((${#OLD[@]})); then
  for f in "${OLD[@]}"; do
    rm -f "$f"
    log "Removed old backup: $f"
  done
fi

log "Done. Keeping last $KEEP_WEEKS weekly dump(s)."
