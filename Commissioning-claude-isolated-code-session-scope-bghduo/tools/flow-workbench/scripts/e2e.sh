#!/usr/bin/env bash
# Full end-to-end run: starts the relay and a headless Chromium, drives the page,
# then tears both down. Needs Node 18+ and a Chromium binary.
set -euo pipefail
cd "$(dirname "$0")/.."

# Termux and other Android environments have no /tmp.
TMP="${TMPDIR:-/tmp}"

CHROME="${CHROME:-}"
if [ -z "$CHROME" ]; then
  for c in /opt/pw-browsers/chromium "$(command -v chromium || true)" \
           "$(command -v chromium-browser || true)" "$(command -v google-chrome || true)"; do
    [ -n "$c" ] && [ -x "$c" ] && CHROME="$c" && break
  done
fi
if [ -z "$CHROME" ]; then echo "No Chromium found. Set CHROME=/path/to/chrome"; exit 2; fi

relay_pid=""; chrome_pid=""
cleanup() {
  [ -n "$relay_pid" ] && kill "$relay_pid" 2>/dev/null || true
  [ -n "$chrome_pid" ] && kill "$chrome_pid" 2>/dev/null || true
}
trap cleanup EXIT

python3 local_agent.py >"$TMP/wb-relay.log" 2>&1 & relay_pid=$!
for _ in $(seq 1 40); do
  curl -sf -o /dev/null http://127.0.0.1:8765/api/health && break
  sleep 0.25
done

"$CHROME" --headless --no-sandbox --disable-gpu --disable-dev-shm-usage \
  --remote-debugging-port=9222 about:blank >"$TMP/wb-chrome.log" 2>&1 & chrome_pid=$!
sleep 3

node scripts/browser-test.mjs
echo
node scripts/layout-test.mjs
