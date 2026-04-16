#!/usr/bin/env bash
set -euo pipefail

WEB_URL="${WEB_URL:-http://localhost:8081}"
PORT="${PORT:-8081}"
LOG_DIR=".maestro-web/logs"
FIXTURE_23ANDME="test-data/23andme/v5/hu50B3F5/genome_hu50B3F5_v5_Full.zip"

PW_EXTRA=()
for arg in "$@"; do
  case "$arg" in
    -i|--interactive|--headed)
      PW_EXTRA+=(--headed)
      export PW_SLOWMO="${PW_SLOWMO:-600}"
      ;;
    --debug)
      export PWDEBUG=1
      ;;
    *)
      PW_EXTRA+=("$arg")
      ;;
  esac
done
mkdir -p "$LOG_DIR" ".maestro-web/screenshots"

if [ ! -f "$FIXTURE_23ANDME" ]; then
  echo "Missing required web test fixture: $FIXTURE_23ANDME" >&2
  echo "Run ./tools/fetch_test_data.sh to download repo test fixtures, then rerun ./test-web.sh." >&2
  exit 1
fi

WEB_PID=""
cleanup() {
  [ -n "$WEB_PID" ] && kill "$WEB_PID" 2>/dev/null || true
}
trap cleanup EXIT

if ! curl -sf "$WEB_URL" >/dev/null 2>&1; then
  echo "==> Starting Expo web on :$PORT (logs: $LOG_DIR/web.log)"
  (npx expo start --web --port "$PORT" >"$LOG_DIR/web.log" 2>&1) &
  WEB_PID=$!
  for _ in {1..90}; do
    curl -sf "$WEB_URL" >/dev/null 2>&1 && break
    sleep 1
  done
  curl -sf "$WEB_URL" >/dev/null 2>&1 || {
    echo "Expo web failed to start. Last 50 lines:" >&2
    tail -50 "$LOG_DIR/web.log" >&2
    exit 1
  }
fi

echo "==> Checking monty artifact freshness"
node ./scripts/check-monty-artifacts.mjs

echo "==> Ensuring Playwright browsers are installed"
if ! npx playwright install chromium; then
  echo "Playwright Chromium install failed. Fix Playwright/browser setup and rerun." >&2
  exit 1
fi

SPECS=(.maestro-web/smoke.spec.ts .maestro-web/file-picker.spec.ts .maestro-web/assay-lab.spec.ts)
echo "==> Running Playwright specs: ${SPECS[*]}"
if WEB_URL="$WEB_URL" npx playwright test \
    --config=.maestro-web/playwright.config.ts \
    ${PW_EXTRA[@]+"${PW_EXTRA[@]}"} \
    "${SPECS[@]}"; then
  echo ""
  echo "✅ Web tests PASSED"
  exit 0
else
  echo ""
  echo "❌ Web tests FAILED"
  exit 1
fi
