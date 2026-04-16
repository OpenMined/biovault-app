#!/usr/bin/env bash
set -euo pipefail

BUNDLE_ID="org.openmined.biovault.dev"
SIM_NAME="${SIM_NAME:-iPhone 16}"
FLOW="${FLOW:-.maestro/smoke.yaml}"
LOG_DIR=".maestro/logs"
mkdir -p "$LOG_DIR"

export PATH="$PWD/node_modules/.maestro/bin:$HOME/.maestro/bin:$PATH"
command -v maestro >/dev/null || { echo "maestro not found; run npm run install-maestro" >&2; exit 1; }

# Allow CI to pin a specific UDID (chosen to match Xcode's iOS SDK) instead
# of looking up by $SIM_NAME, which picks the first match across runtimes
# and can land on an iOS runtime whose platform SDK isn't in Xcode.
if [ -n "${IOS_SIMULATOR_UDID:-}" ]; then
  UDID="$IOS_SIMULATOR_UDID"
  echo "==> Using simulator UDID: $UDID"
else
  echo "==> Booting simulator: $SIM_NAME"
  UDID=$(xcrun simctl list devices available | grep -E "^\s*$SIM_NAME \(" | head -1 | grep -oE "[0-9A-F-]{36}")
  if [ -z "$UDID" ]; then
    echo "Simulator '$SIM_NAME' not found" >&2
    exit 1
  fi
fi
xcrun simctl boot "$UDID" 2>/dev/null || true
open -a Simulator --args -CurrentDeviceUDID "$UDID"
xcrun simctl bootstatus "$UDID" -b

METRO_PID=""
cleanup() {
  [ -n "$METRO_PID" ] && kill "$METRO_PID" 2>/dev/null || true
}
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

echo "==> Building & installing app on $UDID (logs: $LOG_DIR/build.log)"
npx expo run:ios --device "$UDID" >"$LOG_DIR/build.log" 2>&1 || {
  echo "Build failed. Last 50 lines:" >&2
  tail -50 "$LOG_DIR/build.log" >&2
  exit 1
}

echo "==> Disabling expo-dev-menu onboarding (tests shouldn't see the sheet)"
xcrun simctl spawn "$UDID" defaults write "$BUNDLE_ID" EXDevMenuIsOnboardingFinished -bool YES 2>/dev/null || true
xcrun simctl spawn "$UDID" defaults write host.exp.Exponent EXDevMenuIsOnboardingFinished -bool YES 2>/dev/null || true

echo "==> Waiting for app to finish loading from Metro"
sleep 8

echo "==> Running Maestro flow: $FLOW"
if maestro --device "$UDID" test "$FLOW"; then
  echo ""
  echo "✅ iOS test PASSED"
  exit 0
else
  echo ""
  echo "❌ iOS test FAILED"
  exit 1
fi
