#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
node_modules/.bin/esbuild apps/api/src/cpanel-server.ts --bundle --platform=node --format=esm --target=node24 --packages=external --alias:@biz/shared=./packages/shared/src/index.ts --outfile=deploy/cpanel/dist/server.mjs
python3 - <<'PY'
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib,json
root=Path('deploy/cpanel')
files=['app.js','package.json','package-lock.json','.env.example','.puppeteerrc.cjs','generate-keys.cjs','check-browser.cjs','schema.sql','README.md','dist/server.mjs']
out=Path('artifacts/BizMonitor-cPanel-server.zip');out.parent.mkdir(exist_ok=True)
with ZipFile(out,'w',ZIP_DEFLATED) as z:
 for name in files:z.write(root/name,name)
with ZipFile(out) as z:assert z.testzip() is None
out.with_suffix('.sha256').write_text(hashlib.sha256(out.read_bytes()).hexdigest()+'  '+out.name+'\n')
print(json.dumps({'archive':str(out.resolve()),'bytes':out.stat().st_size,'files':len(files)},ensure_ascii=False))
PY
