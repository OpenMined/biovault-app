#!/usr/bin/env bash
set -euo pipefail

PACKAGE="org.openmined.biovault.dev"
AVD="${AVD:-Pixel_8}"
FLOW="${FLOW:-.maestro/smoke.yaml}"
LOG_DIR=".maestro/logs"
mkdir -p "$LOG_DIR"

export PATH="$PWD/node_modules/.maestro/bin:$HOME/.maestro/bin:$PATH"
command -v maestro >/dev/null || { echo "maestro not found; run npm run install-maestro" >&2; exit 1; }

ANDROID_SDK="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$ANDROID_SDK/platform-tools:$ANDROID_SDK/emulator:$PATH"

echo "==> Ensuring emulator $AVD is running"
if ! adb devices | grep -q "emulator-.*device$"; then
  if ! emulator -list-avds | grep -qx "$AVD"; then
    echo "AVD '$AVD' not found. Available: $(emulator -list-avds | tr '\n' ' ')" >&2
    exit 1
  fi
  echo "==> Booting emulator $AVD (logs: $LOG_DIR/emulator.log)"
  (emulator -avd "$AVD" -no-snapshot-save >"$LOG_DIR/emulator.log" 2>&1) &
fi

echo "==> Waiting for device"
adb wait-for-device
until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do
  sleep 2
done
SERIAL=$(adb devices | awk '/emulator-.*device$/ {print $1; exit}')
echo "==> Using device $SERIAL"

METRO_PID=""
cleanup() { [ -n "$METRO_PID" ] && kill "$METRO_PID" 2>/dev/null || true; }
trap cleanup EXIT

if ! curl -sf http://localhost:8081/status >/dev/null 2>&1; then
  echo "==> Starting Metro (logs: $LOG_DIR/metro.log)"
  (npx expo start --dev-client >"$LOG_DIR/metro.log" 2>&1) &
  METRO_PID=$!
  for i in {1..60}; do
    curl -sf http://localhost:8081/status >/dev/null 2>&1 && break
    sleep 1
  done
fi
adb reverse tcp:8081 tcp:8081 >/dev/null || true

echo "==> Building & installing app (logs: $LOG_DIR/build-android.log)"
npx expo run:android >"$LOG_DIR/build-android.log" 2>&1 || {
  echo "Build failed. Last 50 lines:" >&2
  tail -50 "$LOG_DIR/build-android.log" >&2
  exit 1
}

echo "==> Waiting for app to finish loading"
sleep 8

echo "==> Running Maestro flow: $FLOW"
if maestro --device "$SERIAL" test "$FLOW"; then
  echo ""
  echo "✅ Android test PASSED"
  exit 0
else
  echo ""
  echo "❌ Android test FAILED"
  exit 1
fi
