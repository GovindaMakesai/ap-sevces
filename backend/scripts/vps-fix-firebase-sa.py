#!/usr/bin/env python3
import json
import pathlib
import re
import sys

ROOT = pathlib.Path("/var/www/ap-services")
SA_PATH = ROOT / "backend" / "firebase-sa.json"
ENV_PATH = ROOT / "backend" / ".env"

sa = json.loads(SA_PATH.read_text(encoding="utf-8"))
assert sa.get("type") == "service_account", "bad type"
assert sa.get("project_id") == "muqaddas-technology", "bad project"
assert "BEGIN PRIVATE KEY" in (sa.get("private_key") or ""), "bad private_key"

one = json.dumps(sa, separators=(",", ":"))
assert "\n" not in one, "json.dumps produced newlines"
line = "FIREBASE_SERVICE_ACCOUNT_JSON=" + one

text = ENV_PATH.read_text(encoding="utf-8") if ENV_PATH.exists() else ""
lines = text.splitlines(True)
out = []
skip = False
for ln in lines:
    if ln.startswith("FIREBASE_SERVICE_ACCOUNT_JSON="):
        skip = True
        continue
    if skip:
        if re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", ln):
            skip = False
            out.append(ln)
        continue
    if ln.startswith("GOOGLE_APPLICATION_CREDENTIALS="):
        continue
    out.append(ln)

text2 = "".join(out).rstrip() + "\n" + line + "\n"
text2 += "GOOGLE_APPLICATION_CREDENTIALS=/var/www/ap-services/backend/firebase-sa.json\n"
ENV_PATH.write_text(text2, encoding="utf-8")

m = re.search(r"^FIREBASE_SERVICE_ACCOUNT_JSON=(.*)$", ENV_PATH.read_text(encoding="utf-8"), re.M)
assert m, "missing env line"
j = json.loads(m.group(1))
print("ENV_OK", j["project_id"], j["client_email"], "key_newlines", j["private_key"].count("\n"))
print("FILE_OK", SA_PATH.exists(), SA_PATH.stat().st_size)
sys.exit(0)
