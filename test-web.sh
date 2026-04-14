#!/usr/bin/env bash
set -euo pipefail

WEB_URL="${WEB_URL:-http://localhost:8081}"
PORT="${PORT:-8081}"
LOG_DIR=".maestro-web/logs"
mkdir -p "$LOG_DIR" ".maestro-web/screenshots"

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

echo "==> Ensuring Playwright browsers are installed"
npx playwright install chromium >/dev/null 2>&1 || true

echo "==> Running Playwright smoke: .maestro-web/smoke.spec.ts"
if WEB_URL="$WEB_URL" npx playwright test \
    --config=.maestro-web/playwright.config.ts \
    .maestro-web/smoke.spec.ts; then
  echo ""
  echo "✅ Web test PASSED"
  exit 0
else
  echo ""
  echo "❌ Web test FAILED"
  exit 1
fi
