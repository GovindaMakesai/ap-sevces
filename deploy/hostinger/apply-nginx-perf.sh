#!/usr/bin/env bash
# Patch JS/CSS caching into the LIVE nginx site without rewriting SSL/domain.
# Safe on Hostinger when cert is for api.apservices.in (not apservices.in).
#
# Usage (as root):
#   bash deploy/hostinger/apply-nginx-perf.sh
#   bash deploy/hostinger/apply-nginx-perf.sh api.apservices.in
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/ap-services}"
SITE="${NGINX_SITE:-/etc/nginx/sites-available/ap-services}"
DOMAIN_HINT="${1:-}"

if [ ! -f "$SITE" ]; then
  echo "ERROR: nginx site not found: $SITE"
  echo "Available:"
  ls -la /etc/nginx/sites-available/ 2>/dev/null || true
  exit 1
fi

# Detect cert domains on disk
echo "==> Let's Encrypt certs present:"
ls -1 /etc/letsencrypt/live 2>/dev/null || echo "(none)"

# Prefer explicit arg, else first server_name in site that has a cert, else api.apservices.in
pick_domain() {
  if [ -n "$DOMAIN_HINT" ] && [ -f "/etc/letsencrypt/live/${DOMAIN_HINT}/fullchain.pem" ]; then
    echo "$DOMAIN_HINT"
    return
  fi
  if [ -f /etc/letsencrypt/live/api.apservices.in/fullchain.pem ]; then
    echo "api.apservices.in"
    return
  fi
  if [ -f /etc/letsencrypt/live/apservices.in/fullchain.pem ]; then
    echo "apservices.in"
    return
  fi
  # Fall back to whatever the live site already uses
  local sn
  sn="$(grep -E '^\s*server_name\s+' "$SITE" | head -1 | awk '{print $2}' | tr -d ';')"
  if [ -n "$sn" ] && [ -f "/etc/letsencrypt/live/${sn}/fullchain.pem" ]; then
    echo "$sn"
    return
  fi
  echo ""
}

DOMAIN="$(pick_domain)"
echo "==> Using domain: ${DOMAIN:-"(keep existing site as-is)"}"
echo "==> Patching cache headers in $SITE (SSL paths left untouched)"

cp -a "$SITE" "${SITE}.bak.$(date +%Y%m%d%H%M%S)"

python3 - <<'PY' "$SITE"
import re, sys
path = sys.argv[1]
text = open(path, encoding="utf-8", errors="ignore").read()

# Remove broken no-store block for html|js|css if present
text = re.sub(
    r'\n\s*location\s+~\*\s+\\\.\(html\|js\|css\)\$\s*\{[^}]*\}\s*',
    '\n',
    text,
    flags=re.I,
)

cache_block = '''
    # === AP perf cache (patched) ===
    location ~* \\.html$ {
        add_header Cache-Control "no-cache, must-revalidate" always;
        try_files $uri =404;
    }
    location ~* \\.(js|css)$ {
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        try_files $uri =404;
    }
    location ~* \\.(png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|mp3|mp4|webm)$ {
        expires 30d;
        add_header Cache-Control "public, max-age=2592000" always;
        try_files $uri =404;
    }
'''

# If already patched, replace old patched section; else insert before final location /
if 'AP perf cache (patched)' in text:
    text = re.sub(
        r'\n\s*# === AP perf cache \(patched\) ===.*?(?=\n\s*location\s+/?\s*\{|\n\})',
        '\n' + cache_block.strip() + '\n',
        text,
        count=1,
        flags=re.S,
    )
else:
    # Insert before the catch-all location /
    m = re.search(r'\n(\s*)location\s+/\s*\{', text)
    if not m:
        print('ERROR: could not find location / block to insert cache rules', file=sys.stderr)
        sys.exit(2)
    insert_at = m.start()
    text = text[:insert_at] + '\n' + cache_block + text[insert_at:]

# Lengthen socket timeouts if missing
if 'proxy_read_timeout' not in text and 'location ^~ /socket.io' in text:
    text = text.replace(
        'location ^~ /socket.io {',
        'location ^~ /socket.io {\n        proxy_read_timeout 86400s;\n        proxy_send_timeout 86400s;',
    )

open(path, 'w', encoding='utf-8').write(text)
print('Patched OK')
PY

nginx -t
systemctl reload nginx
echo "==> nginx reloaded OK"

cd "$APP_DIR"
npm install compression --omit=dev --no-fund --no-audit 2>/dev/null || true
pm2 restart ap-api >/dev/null || true

CHECK_HOST="${DOMAIN:-api.apservices.in}"
echo ""
echo "Verify (expect max-age=31536000, NOT no-store):"
curl -sI "https://${CHECK_HOST}/social-live.js" | grep -iE 'HTTP/|cache-control' || true
echo ""
echo "Also set in backend/.env if missing:"
echo "  ACCESS_TOKEN_TTL=7d"
echo "  COOKIE_SECURE=true"
echo "Then: pm2 restart ap-api --update-env"
echo "Force-close the mobile app once."
