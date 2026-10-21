#!/bin/bash
# BizMonitor GE — build and install a development build on a USB-connected
# iPhone from macOS, then keep the local API and Metro running for it.
#
#   bash scripts/iphone-mac.sh          install deps, build, install on iPhone
#   bash scripts/iphone-mac.sh serve    only start API + Metro (app already
#                                       installed; use this on later days)
#
# Environment overrides:
#   IOS_BUNDLE_ID   default ge.bizmonitor.app.<mac user name>
#   IOS_FREE_TEAM   1 (default) drops the push entitlement so a free Apple ID
#                   can sign; set 0 with a paid Apple Developer team.
#
# The app on the phone talks to this Mac over Wi-Fi (both must be on the same
# network) and the Mac must keep this script running while the app is used.
set -euo pipefail
MODE="${1:-build}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\n\033[1;33m!! %s\033[0m\n' "$*"; }
die() {
  printf '\n\033[1;31mXX %s\033[0m\n' "$*"
  exit 1
}
pause() { read -r -p "    დააჭირე Enter-ს როცა მზად იქნები... " _ </dev/tty; }

[ "$(uname)" = "Darwin" ] || die "ეს სკრიპტი მხოლოდ macOS-ზე მუშაობს."

# ---------------------------------------------------------------- Xcode
say "Xcode-ის შემოწმება"
if ! xcodebuild -version >/dev/null 2>&1; then
  if [ -d /Applications/Xcode.app ]; then
    warn "Xcode დაყენებულია, მაგრამ არჩეული არ არის. პაროლს მოგთხოვს:"
    sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
    sudo xcodebuild -license accept
  else
    die "Xcode არ არის დაყენებული. გახსენი App Store → Xcode → Get, დააყენე, ერთხელ გახსენი და თავიდან გაუშვი ეს სკრიპტი."
  fi
fi
xcodebuild -version | head -1
if ! xcodebuild -checkFirstLaunchStatus >/dev/null 2>&1; then
  warn "Xcode-ის პირველი გაშვების კომპონენტები ყენდება (პაროლს მოგთხოვს):"
  sudo xcodebuild -runFirstLaunch
fi

# ------------------------------------------------------- Homebrew/Node/Pods
say "Node.js 24 და CocoaPods-ის შემოწმება"
for prefix in /opt/homebrew /usr/local; do
  [ -x "$prefix/bin/brew" ] && eval "$("$prefix/bin/brew" shellenv)"
done
need_brew() {
  if ! command -v brew >/dev/null 2>&1; then
    warn "Homebrew არ არის — ვაყენებ (Mac-ის პაროლს მოგთხოვს):"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    for prefix in /opt/homebrew /usr/local; do
      [ -x "$prefix/bin/brew" ] && eval "$("$prefix/bin/brew" shellenv)"
    done
  fi
}
node_major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
if [ "$(node_major)" -lt 24 ]; then
  if command -v brew >/dev/null 2>&1 && [ -d "$(brew --prefix)/opt/node@24/bin" ]; then
    export PATH="$(brew --prefix)/opt/node@24/bin:$PATH"
  fi
fi
if [ "$(node_major)" -lt 24 ]; then
  need_brew
  brew install node@24
  export PATH="$(brew --prefix)/opt/node@24/bin:$PATH"
fi
echo "node $(node -v)"
if [ "$MODE" = "build" ] && ! command -v pod >/dev/null 2>&1; then
  need_brew
  brew install cocoapods
fi

# ------------------------------------------------------------ npm packages
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  say "npm პაკეტების დაყენება (რამდენიმე წუთი)"
  npm ci
fi

# ------------------------------------------------- LAN address and token
say "ქსელის მისამართის მომზადება"
IP=""
for iface in en0 en1 en2 en3; do
  IP="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
  [ -n "$IP" ] && break
done
[ -n "$IP" ] || die "Wi-Fi/LAN მისამართი ვერ ვიპოვე. შეაერთე Mac Wi-Fi-ს (იგივეს, რაც iPhone-ზეა)."
TOKEN="$(openssl rand -hex 32)"
mkdir -p artifacts
printf '{ "hostAddress": "%s", "token": "%s" }\n' "$IP" "$TOKEN" >artifacts/iphone-preview.json
ENV_FILE=apps/mobile/.env.local
{
  [ -f "$ENV_FILE" ] && grep -vE '^EXPO_PUBLIC_(API_URL|PREVIEW_TOKEN)=' "$ENV_FILE" || true
  echo "EXPO_PUBLIC_API_URL=http://$IP:3001"
  echo "EXPO_PUBLIC_PREVIEW_TOKEN=$TOKEN"
} >"$ENV_FILE.tmp"
mv "$ENV_FILE.tmp" "$ENV_FILE"
echo "Mac-ის მისამართი: $IP"

# --------------------------------------------------------------- local API
say "ლოკალური API სერვერის გაშვება (ლოგი: artifacts/api.log)"
if lsof -nP -iTCP:3001 -sTCP:LISTEN >/dev/null 2>&1; then
  warn "პორტი 3001 უკვე დაკავებულია — ძველ API პროცესს ვაჩერებ."
  kill $(lsof -tnP -iTCP:3001 -sTCP:LISTEN) 2>/dev/null || true
  sleep 2
fi
RS_PREVIEW_HOST="$IP" RS_PREVIEW_TOKEN="$TOKEN" npm run local -w @biz/api >artifacts/api.log 2>&1 &
API_PID=$!
trap 'kill $API_PID 2>/dev/null || true' EXIT INT TERM
for _ in $(seq 1 60); do
  curl -fs "http://127.0.0.1:3001/health" >/dev/null 2>&1 && break
  kill -0 $API_PID 2>/dev/null || die "API ვერ ჩაირთო. იხილე artifacts/api.log"
  sleep 1
done
curl -fs "http://127.0.0.1:3001/health" >/dev/null || die "API არ პასუხობს. იხილე artifacts/api.log"
echo "API მუშაობს: http://$IP:3001"
echo "(თუ macOS იკითხავს node-ისთვის შემომავალ კავშირებს — დააჭირე Allow.)"

export REACT_NATIVE_PACKAGER_HOSTNAME="$IP"
export IOS_FREE_TEAM="${IOS_FREE_TEAM:-1}"
USER_SLUG="$(whoami | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9')"
export IOS_BUNDLE_ID="${IOS_BUNDLE_ID:-ge.bizmonitor.app.${USER_SLUG:-dev}}"
cd apps/mobile

if [ "$MODE" = "serve" ]; then
  say "Metro ჩაირთო. გახსენი BizMonitor GE iPhone-ზე. გასაჩერებლად: Ctrl+C"
  npx expo start --dev-client --lan --port 8081
  exit
fi

# ------------------------------------------------------- code signing check
say "Apple ხელმოწერის (signing) შემოწმება"
if ! security find-identity -v -p codesigning 2>/dev/null | grep -q "Apple Development"; then
  warn "Mac-ზე Apple Development სერტიფიკატი ვერ ვიპოვე. ერთჯერადად:"
  echo "    1. გახსენი Xcode → Settings (⌘,) → Accounts → '+' → Apple ID → შედი შენი Apple ID-ით"
  echo "    2. აირჩიე ანგარიში → Manage Certificates… → '+' → Apple Development → Done"
  open -a Xcode || true
  pause
  security find-identity -v -p codesigning 2>/dev/null | grep -q "Apple Development" ||
    warn "სერტიფიკატი ჯერ კიდევ არ ჩანს — ვცდი მაინც; Expo თავად შემოგთავაზებს გუნდის არჩევას."
fi

say "iPhone-ის მომზადება"
echo "    • iPhone შეაერთე კაბელით, განბლოკე და 'Trust This Computer' → Trust"
echo "    • iPhone: Settings → Privacy & Security → Developer Mode → ჩართე (გადაიტვირთება)"
echo "    • iPhone და Mac ერთსა და იმავე Wi-Fi-ზე უნდა იყოს"
pause

say "iOS ნატიური პროექტის გენერაცია (bundle id: $IOS_BUNDLE_ID)"
npx expo prebuild --platform ios --clean

say "ბილდი და iPhone-ზე დაყენება (პირველად 10–20 წუთი)"
echo "    თუ რამდენიმე მოწყობილობას შემოგთავაზებს — აირჩიე შენი iPhone (ისრებით + Enter)."
echo "    თუ Signing Team-ს გკითხავს — აირჩიე შენი Apple ID-ის გუნდი."
npx expo run:ios --device

# expo run:ios keeps Metro running in the foreground after installing; when
# it exits we land here and the trap stops the API.
