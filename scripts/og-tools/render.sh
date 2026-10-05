#!/bin/bash
# Renders the /tools/ Open Graph posters (1200×630 JPEG) from the HTML templates here with
# headless Chrome, so emoji and system fonts look right. Run on a Mac after changing a template:
#   scripts/og-tools/render.sh
# Pages are served over a throwaway local HTTP server (Chrome can't read file:// URLs under
# ~/Documents), and Chrome is stopped once the screenshot lands (headless=new lingers).
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(cd ../.. && pwd)"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PORT="${PORT:-8811}"
TMP="$(mktemp -d)"
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT" >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null; rm -rf "$TMP"' EXIT
sleep 1
render() { # template output
  rm -f "$TMP/out.png"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=1200,630 --virtual-time-budget=3000 --user-data-dir="$TMP/profile" \
    --screenshot="$TMP/out.png" "http://127.0.0.1:$PORT/scripts/og-tools/$1" >/dev/null 2>&1 &
  local pid=$! i
  for i in $(seq 1 60); do [ -s "$TMP/out.png" ] && break; sleep 0.5; done
  sleep 0.5; kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true
  [ -s "$TMP/out.png" ] || { echo "✗ $1: no screenshot" >&2; exit 1; }
  sips -s format jpeg -s formatOptions 86 "$TMP/out.png" --out "$ROOT/$2" >/dev/null
  echo "✓ $2 $(sips -g pixelWidth -g pixelHeight "$ROOT/$2" | awk '/pixel/{printf "%s ", $2}')"
}
render ark.html   tools/ark/assets/og.jpg
render crew.html  tools/ark/assets/og-crew.jpg
render tools.html tools/assets/og.jpg
