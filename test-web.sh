#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-8081}"
WEB_URL_WAS_SET="${WEB_URL+x}"
WEB_SECURE_ORIGIN="${WEB_SECURE_ORIGIN:-0}"
WEB_DOMAIN="${WEB_DOMAIN:-dev-app.biovault.net}"
WEB_SHELL_PORT="${WEB_SHELL_PORT:-4443}"
if [[ "$WEB_SECURE_ORIGIN" == "1" && -z "$WEB_URL_WAS_SET" ]]; then
  WEB_URL="https://${WEB_DOMAIN}:${WEB_SHELL_PORT}/web"
else
  WEB_URL="${WEB_URL:-http://localhost:${PORT}}"
fi
LOG_DIR=".maestro-web/logs"
FIXTURE_23ANDME="test-data/23andme/v5/hu50B3F5/genome_hu50B3F5_v5_Full.zip"
AUTO_WORKERS="$(node -e "const os=require('os'); console.log(os.availableParallelism?.() ?? os.cpus().length)")"
if [ -n "${FORCE_COLOR:-}" ]; then
  unset NO_COLOR
fi

port_has_listener() {
  nc -z -w 1 localhost "$1" >/dev/null 2>&1
}

if [ -z "$WEB_URL_WAS_SET" ] && [[ "$WEB_SECURE_ORIGIN" != "1" ]]; then
  SELECTED_PORT="$PORT"
  while port_has_listener "$SELECTED_PORT"; do
    SELECTED_PORT=$((SELECTED_PORT + 1))
  done
  if [[ "$SELECTED_PORT" != "$PORT" ]]; then
    echo "==> :$PORT is already serving; using :$SELECTED_PORT for this run"
  fi
  PORT="$SELECTED_PORT"
  WEB_URL="http://localhost:${PORT}"
fi

MODE="default"
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
    --scenario|--scenarios)
      MODE="scenario"
      ;;
    --pgx-report-scenario|--pgx-report)
      MODE="pgx-report"
      ;;
    --core-import)
      MODE="core-import"
      ;;
    --core-assays)
      MODE="core-assays"
      ;;
    --core-state)
      MODE="core-state"
      ;;
    --index-generation)
      MODE="index-generation"
      ;;
    *)
      PW_EXTRA+=("$arg")
      ;;
  esac
done
mkdir -p "$LOG_DIR" ".maestro-web/screenshots"

echo "==> Playwright workers: ${PW_WORKERS:-auto:$AUTO_WORKERS} (fully parallel: ${PW_FULLY_PARALLEL:-on})"

if [ ! -f "$FIXTURE_23ANDME" ]; then
  echo "Missing required web test fixture: $FIXTURE_23ANDME" >&2
  echo "Run ./tools/fetch_test_data.sh to download repo test fixtures, then rerun ./test-web.sh." >&2
  exit 1
fi

curl_web() {
  local url="$WEB_URL"
  if [[ "$WEB_SECURE_ORIGIN" == "1" && "$url" == */web ]]; then
    url="${url}/"
  fi
  curl --max-time 5 -Lskf "$url" >/dev/null 2>&1
}

if ! curl_web && [ -z "$WEB_URL_WAS_SET" ] && [[ "$WEB_SECURE_ORIGIN" != "1" ]]; then
  SELECTED_PORT=$((PORT + 1))
  while port_has_listener "$SELECTED_PORT"; do
    SELECTED_PORT=$((SELECTED_PORT + 1))
  done
  echo "==> $WEB_URL is not serving; using :$SELECTED_PORT for this run"
  PORT="$SELECTED_PORT"
  WEB_URL="http://localhost:${PORT}"
fi

WEB_PID=""
cleanup() {
  [ -n "$WEB_PID" ] && kill "$WEB_PID" 2>/dev/null || true
}
trap cleanup EXIT

if ! curl_web; then
  if [[ "$WEB_SECURE_ORIGIN" == "1" && -z "$WEB_URL_WAS_SET" ]]; then
    echo "==> Starting secure web shell on ${WEB_URL} (logs: $LOG_DIR/web.log)"
    (EXPO_PUBLIC_DISABLE_ANALYTICS=1 \
      DEV_WEB_OPEN=0 \
      DEV_WEB_HTTPS=1 \
      DEV_WEB_ALLOW_SELF_SIGNED=1 \
      DEV_WEB_DOMAIN="$WEB_DOMAIN" \
      DEV_WEB_PORT="$WEB_SHELL_PORT" \
      ./dev-web.sh >"$LOG_DIR/web.log" 2>&1) &
    WEB_PID=$!
    for _ in {1..90}; do
      curl_web && break
      kill -0 "$WEB_PID" 2>/dev/null || break
      sleep 1
    done
  else
    for _attempt in {1..10}; do
      echo "==> Starting Expo web on :$PORT (logs: $LOG_DIR/web.log)"
      (EXPO_PUBLIC_DISABLE_ANALYTICS=1 BROWSER=none npx expo start --web --localhost --port "$PORT" >"$LOG_DIR/web.log" 2>&1) &
      WEB_PID=$!
      for _ in {1..90}; do
        curl_web && break
        kill -0 "$WEB_PID" 2>/dev/null || break
        sleep 1
      done
      curl_web && break
      if ! kill -0 "$WEB_PID" 2>/dev/null; then
        wait "$WEB_PID" 2>/dev/null || true
        WEB_PID=""
        if grep -Eq 'Port .* (is being used|is running)' "$LOG_DIR/web.log"; then
          PORT=$((PORT + 1))
          WEB_URL="http://localhost:${PORT}"
          echo "==> Expo reported a port conflict; retrying on :$PORT"
          continue
        fi
      fi
      echo "Expo web failed to start. Last 50 lines:" >&2
      tail -50 "$LOG_DIR/web.log" >&2
      exit 1
    done
  fi
  if ! curl_web; then
    if ! kill -0 "$WEB_PID" 2>/dev/null; then
      wait "$WEB_PID" 2>/dev/null || true
      WEB_PID=""
    fi
    echo "Expo web failed to start. Last 50 lines:" >&2
    tail -50 "$LOG_DIR/web.log" >&2
    exit 1
  fi
fi

echo "==> Checking monty artifact freshness"
node ./scripts/check-monty-artifacts.mjs

echo "==> Ensuring Playwright browsers are installed"
if ! env -u NO_COLOR -u FORCE_COLOR npx playwright install chromium; then
  echo "Playwright Chromium install failed. Fix Playwright/browser setup and rerun." >&2
  exit 1
fi

case "$MODE" in
  default)
    SPECS=(
      .maestro-web/smoke.spec.ts
      .maestro-web/file-picker.spec.ts
      .maestro-web/lab-file-classification.spec.ts
      .maestro-web/lab-pgx.spec.ts
      .maestro-web/lab-pgx-package.spec.ts
      .maestro-web/lab-assay-picker.spec.ts
      .maestro-web/lab-remote-cache.spec.ts
      .maestro-web/lab-layout-and-onboarding.spec.ts
      .maestro-web/lab-persistent-handles.spec.ts
    )
    ;;
  core-import)
    SPECS=(
      .maestro-web/smoke.spec.ts
      .maestro-web/file-picker.spec.ts
      .maestro-web/lab-file-classification.spec.ts
    )
    ;;
  core-assays)
    SPECS=(
      .maestro-web/lab-pgx.spec.ts
      .maestro-web/lab-pgx-package.spec.ts
      .maestro-web/lab-assay-picker.spec.ts
    )
    ;;
  core-state)
    SPECS=(
      .maestro-web/lab-remote-cache.spec.ts
      .maestro-web/lab-layout-and-onboarding.spec.ts
      .maestro-web/lab-persistent-handles.spec.ts
    )
    ;;
  scenario)
    SPECS=(
      .maestro-web/lab-format-matrix.spec.ts
      .maestro-web/lab-user-scenarios.spec.ts
    )
    ;;
  pgx-report)
    SPECS=(.maestro-web/lab-pgx-report-matrix.spec.ts)
    ;;
  index-generation)
    SPECS=(.maestro-web/lab-index-generation.spec.ts)
    ;;
  *)
    echo "Unknown web test mode: $MODE" >&2
    exit 2
    ;;
esac
echo "==> Running Playwright specs: ${SPECS[*]}"
if WEB_URL="$WEB_URL" env -u NO_COLOR -u FORCE_COLOR npx playwright test \
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
