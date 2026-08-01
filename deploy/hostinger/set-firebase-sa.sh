#!/usr/bin/env bash
# Fix FIREBASE_SERVICE_ACCOUNT_JSON on the VPS and restart API.
# Usage on VPS:
#   cd /var/www/ap-services
#   python3 - <<'PY'
#   # paste JSON into a file first, then:
#   # bash deploy/hostinger/set-firebase-sa.sh /path/to/sa.json
#   PY
# Or: bash deploy/hostinger/set-firebase-sa.sh ./firebase-sa.json
set -euo pipefail
ROOT="${1:-}"
ENV_FILE="${2:-/var/www/ap-services/backend/.env}"
if [[ -z "$ROOT" || ! -f "$ROOT" ]]; then
  echo "Usage: $0 /path/to/serviceAccount.json [backend/.env]"
  exit 1
fi
python3 - "$ROOT" "$ENV_FILE" <<'PY'
import json, sys, pathlib, re
src, env_path = sys.argv[1], sys.argv[2]
sa = json.loads(pathlib.Path(src).read_text(encoding='utf-8'))
assert sa.get('type') == 'service_account', 'not a service account json'
assert sa.get('private_key') and sa.get('client_email'), 'missing private_key/client_email'
# ensure real newlines in private_key before dumping one-line
if isinstance(sa.get('private_key'), str):
    sa['private_key'] = sa['private_key'].replace('\\n', '\n')
line = 'FIREBASE_SERVICE_ACCOUNT_JSON=' + json.dumps(sa, separators=(',', ':'))
path = pathlib.Path(env_path)
text = path.read_text(encoding='utf-8') if path.exists() else ''
if re.search(r'^FIREBASE_SERVICE_ACCOUNT_JSON=', text, re.M):
    text = re.sub(r'^FIREBASE_SERVICE_ACCOUNT_JSON=.*$', line, text, count=1, flags=re.M)
else:
    text = text.rstrip() + '\n' + line + '\n'
path.write_text(text, encoding='utf-8')
print('Updated', env_path)
print('project_id=', sa.get('project_id'))
print('client_email=', sa.get('client_email'))
print('private_key_lines=', sa['private_key'].count('\n') + 1)
PY
pm2 restart ap-api
pm2 logs ap-api --lines 30 --nostream | grep -i PushService || true
echo "Done. Test: POST /api/push/test with a logged-in user JWT"
