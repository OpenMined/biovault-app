#!/usr/bin/env bash
set -euo pipefail

DESKTOP_DIR="${DESKTOP_DIR:-desktop}"
PORT="${PORT:-1420}"
WS_PORT="${WS_PORT:-17890}"
WEB_URL="${WEB_URL:-http://localhost:$PORT}"
LOG_DIR=".maestro-desktop/logs"
mkdir -p "$LOG_DIR" ".maestro-desktop/screenshots"

INTERACTIVE=0
KEEP_OPEN="${KEEP_OPEN:-0}"
for arg in "$@"; do
  case "$arg" in
    -i|--interactive) INTERACTIVE=1 ;;
    --keep-open)      KEEP_OPEN=1 ;;
    -h|--help)
      cat <<EOF
Usage: $0 [--interactive|-i] [--keep-open]
  --interactive, -i   Stream Tauri/Vite output live and run Playwright headed
  --keep-open         Leave the window open after the test (Ctrl-C to stop)
  KEEP_OPEN=1         Env var equivalent of --keep-open
  Combine: --interactive --keep-open  for live output + stay open after test
EOF
      exit 0 ;;
  esac
done

# Ensure job control so we can kill the whole process group.
set -m

TAURI_PID=""
CLEANED=0
kill_everything() {
  [ "$CLEANED" = "1" ] && return
  CLEANED=1
  if [ -n "$TAURI_PID" ]; then
    # Kill the whole process group spawned for tauri:dev.
    kill -TERM -"$TAURI_PID" 2>/dev/null || kill "$TAURI_PID" 2>/dev/null || true
    sleep 0.5
    kill -KILL -"$TAURI_PID" 2>/dev/null || true
  fi
  # Belt-and-braces: anything still bound to our ports.
  lsof -ti:"$PORT","$WS_PORT" 2>/dev/null | xargs -r kill -9 2>/dev/null || true
  # Anything matching our app name (covers stragglers from earlier sessions).
  pkill -9 -f "biovault-desktop" 2>/dev/null || true
}

on_signal() {
  echo ""
  echo "==> Caught signal, shutting down…"
  kill_everything
  exit 130
}

trap 'kill_everything' EXIT
trap 'on_signal' INT TERM HUP

# Pre-flight: if a previous run left zombies on our ports, clear them now.
if lsof -ti:"$PORT","$WS_PORT" >/dev/null 2>&1; then
  echo "==> Clearing leftover processes on ports $PORT and $WS_PORT"
  lsof -ti:"$PORT","$WS_PORT" 2>/dev/null | xargs -r kill -9 2>/dev/null || true
  pkill -9 -f "biovault-desktop" 2>/dev/null || true
  sleep 1
fi

if [ ! -d "$DESKTOP_DIR" ]; then
  echo "Desktop app directory '$DESKTOP_DIR' not found" >&2
  exit 1
fi

if [ ! -d "$DESKTOP_DIR/node_modules" ]; then
  echo "==> Installing desktop deps"
  (cd "$DESKTOP_DIR" && npm install >"../$LOG_DIR/npm-install.log" 2>&1)
fi

if [ "$INTERACTIVE" = "1" ]; then
  echo "==> Launching Tauri dev (interactive — live output below)"
  echo "---------------------------------------------------------"
  (cd "$DESKTOP_DIR" && exec npm run tauri:dev) 2>&1 | tee "$LOG_DIR/tauri.log" &
  TAURI_PID=$!
else
  echo "==> Launching Tauri dev (manages Vite + native window) — logs: $LOG_DIR/tauri.log"
  (cd "$DESKTOP_DIR" && exec npm run tauri:dev) >"$LOG_DIR/tauri.log" 2>&1 &
  TAURI_PID=$!
fi

echo "==> Waiting for Vite dev server on :$PORT"
for _ in {1..900}; do
  curl -sf "$WEB_URL" >/dev/null 2>&1 && break
  kill -0 "$TAURI_PID" 2>/dev/null || { echo "Tauri died. Last 60 lines:" >&2; tail -60 "$LOG_DIR/tauri.log" >&2; exit 1; }
  sleep 1
done

echo "==> Waiting for Rust WS server on :$WS_PORT (first run compiles ~370 crates, may take several minutes)"
for _ in {1..900}; do
  nc -z 127.0.0.1 "$WS_PORT" 2>/dev/null && break
  kill -0 "$TAURI_PID" 2>/dev/null || { echo "Tauri died. Last 60 lines:" >&2; tail -60 "$LOG_DIR/tauri.log" >&2; exit 1; }
  sleep 1
done
nc -z 127.0.0.1 "$WS_PORT" 2>/dev/null || { echo "WS server never came up. Last 60 lines:" >&2; tail -60 "$LOG_DIR/tauri.log" >&2; exit 1; }

if [ "$INTERACTIVE" = "1" ]; then
  echo ""
  echo "==> Vite + WS server up. Waiting 5s before running smoke."
  sleep 5
else
  echo "==> Giving Tauri a moment to open the native window"
  sleep 5
fi

echo "==> Ensuring Playwright browsers are installed"
npx playwright install chromium >/dev/null 2>&1 || true

PW_ARGS=()
[ "$INTERACTIVE" = "1" ] && PW_ARGS+=(--headed)

echo "==> Running Playwright specs in .maestro-desktop/"
if WEB_URL="$WEB_URL" npx playwright test \
    --config=.maestro-desktop/playwright.config.ts \
    ${PW_ARGS[@]+"${PW_ARGS[@]}"}; then
  echo ""
  echo "✅ Desktop test PASSED"
  RESULT=0
else
  echo ""
  echo "❌ Desktop test FAILED"
  RESULT=1
fi

if [ "$KEEP_OPEN" = "1" ] && kill -0 "$TAURI_PID" 2>/dev/null; then
  echo ""
  echo "==> Leaving Tauri running (PID $TAURI_PID). Ctrl-C to stop."
  wait "$TAURI_PID" 2>/dev/null || true
fi

exit $RESULT
