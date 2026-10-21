#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
APP="$ROOT/artifacts/iphone-server/BizMonitorGE.app"
if [ ! -d "$APP/_CodeSignature" ]; then
  echo "მზა ბილდი ჯერ არ არის. იხილე artifacts/iphone-server/status.json"
  exit 1
fi
python3 - "$ROOT" <<'PYVERIFY'
from pathlib import Path
import sys,json,plistlib,subprocess
root=Path(sys.argv[1]);out=root/'artifacts/iphone-server'
status=json.loads((out/'status.json').read_text())
app=out/'BizMonitorGE.app';info=plistlib.loads((app/'Info.plist').read_bytes())
if status.get('state')!='ready' or status.get('mode')!='server-client' or str(status.get('version'))!=str(info.get('CFBundleShortVersionString')) or str(status.get('build'))!=str(info.get('CFBundleVersion')):
 raise SystemExit('ბილდის ვერსია არ ემთხვევა. საჭიროა შენახული ბილდის შემოწმება.')
subprocess.run(['codesign','--verify','--deep','--strict',str(app)],check=True)
print('მოწმდება სერვერის კლიენტი: '+info['CFBundleShortVersionString'])
PYVERIFY
DEVICE="${IOS_DEVICE_ID:-582CFAEA-884C-53E3-B620-232F8D9AB8D9}"
echo "iPhone უნდა იყოს შეერთებული, განბლოკილი და Developer Mode ჩართული."
xcrun devicectl device install app --device "$DEVICE" "$APP"
echo "აპი ჩაიწერა. Mac-ზე გაუშვით iPhone-start.command. Metro საჭირო არ არის."
