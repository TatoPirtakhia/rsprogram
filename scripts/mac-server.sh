#!/bin/bash
# Starts only the API, not Metro. Keep the pairing key stable across restarts.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if ! command -v node >/dev/null; then echo "Node.js 24 საჭიროა."; exit 1; fi
IP=""
for iface in en0 en1 en2 en3; do
  IP="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
  [ -n "$IP" ] && break
done
[ -n "$IP" ] || { echo "შეაერთეთ Mac ქსელთან."; exit 1; }
mkdir -p artifacts
MAC_SERVER_HOST="$IP" python3 - <<'PY'
from pathlib import Path
import os,json,secrets
p=Path('artifacts/mac-server.json')
try: old=json.loads(p.read_text())
except (OSError,ValueError): old={}
token=old.get('token') or secrets.token_hex(32)
p.write_text(json.dumps({'hostAddress':os.environ['MAC_SERVER_HOST'],'token':token}))
p.chmod(0o600)
PY
export RS_PREVIEW_HOST="$IP"
export RS_PREVIEW_TOKEN="$(node -p "JSON.parse(require('fs').readFileSync('artifacts/mac-server.json','utf8')).token")"
echo "Mac-ის სერვერი: http://$IP:3001"
echo "iPhone იმავე ქსელში უნდა იყოს. ახალი მისამართი საჭიროებისას მიუთითეთ აპის სერვერის პარამეტრებში."
exec caffeinate -i npm run local -w @biz/api
