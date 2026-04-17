#!/usr/bin/env bash
set -euo pipefail

# Phase-aware iOS smoke runner. No arg = run the whole sequence locally. In
# CI, each phase is its own workflow step so timing shows up per-phase:
#
#   ./test-ios.sh boot-sim
#   ./test-ios.sh prebuild
#   ./test-ios.sh pods
#   ./test-ios.sh build
#   ./test-ios.sh metro-start
#   ./test-ios.sh install-launch
#   ./test-ios.sh devmenu
#   ./test-ios.sh maestro
#
# FORCE_CLEAN=1 wipes ios/ + DerivedData before starting — cheap escape hatch
# when caches go stale. The common path stays fast.

BUNDLE_ID="${BUNDLE_ID:-org.openmined.biovault.dev}"
SIM_NAME="${SIM_NAME:-iPhone 16}"
FLOW="${FLOW:-.maestro/smoke.yaml}"
LOG_DIR=".maestro/logs"
REPO_ROOT="${REPO_ROOT:-$PWD}"
IOS_SCHEME="${IOS_SCHEME:-BioVaultDev}"
IOS_WORKSPACE_REL="${IOS_WORKSPACE_REL:-ios/BioVaultDev.xcworkspace}"
IOS_DERIVED_DATA_REL="${IOS_DERIVED_DATA_REL:-ios/build}"
IOS_WORKSPACE="$REPO_ROOT/$IOS_WORKSPACE_REL"
IOS_DERIVED_DATA="$REPO_ROOT/$IOS_DERIVED_DATA_REL"
APP_PATH="$IOS_DERIVED_DATA/Build/Products/Debug-iphonesimulator/${IOS_SCHEME}.app"
METRO_PID_FILE="$LOG_DIR/metro.pid"

mkdir -p "$LOG_DIR"
export PATH="$PWD/node_modules/.maestro/bin:$HOME/.maestro/bin:$PATH"

resolve_udid() {
  if [ -n "${IOS_SIMULATOR_UDID:-}" ]; then
    echo "$IOS_SIMULATOR_UDID"
    return 0
  fi
  local udid
  udid=$(xcrun simctl list devices available | grep -E "^\s*$SIM_NAME \(" | head -1 | grep -oE "[0-9A-F-]{36}")
  if [ -z "$udid" ]; then
    echo "Simulator '$SIM_NAME' not found" >&2
    return 1
  fi
  echo "$udid"
}

phase_force_clean() {
  echo "==> FORCE_CLEAN: removing ios/ and ios/build"
  rm -rf ios "$IOS_DERIVED_DATA"
}

phase_boot_sim() {
  local UDID
  UDID=$(resolve_udid) || exit 1
  echo "==> Booting simulator UDID: $UDID"
  xcrun simctl boot "$UDID" 2>/dev/null || true
  if [ -z "${CI:-}" ]; then
    open -a Simulator --args -CurrentDeviceUDID "$UDID" || true
  fi
  xcrun simctl bootstatus "$UDID" -b
}

phase_prebuild() {
  if [ -d ios ] && [ -f ios/Podfile ]; then
    echo "==> ios/ already present, skipping expo prebuild"
    return 0
  fi
  echo "==> expo prebuild --platform ios (logs: $LOG_DIR/prebuild.log)"
  npx expo prebuild --platform ios --no-install >"$LOG_DIR/prebuild.log" 2>&1 || {
    echo "expo prebuild failed. Last 50 lines:" >&2
    tail -50 "$LOG_DIR/prebuild.log" >&2
    exit 1
  }
}

phase_pods() {
  if [ ! -f ios/Podfile ]; then
    echo "ios/Podfile missing — run prebuild first" >&2
    exit 1
  fi
  # We don't skip pod install even when Manifest.lock matches: several
  # podspecs (ExpoSQLite, ExpoBioscript, ...) do real side effects when
  # CocoaPods evaluates them — copying vendored C sources, running
  # prepare_command scripts — and those outputs live outside ios/ so they
  # aren't all captured by the ios/ cache. Skipping leaves the build with
  # dangling input files like node_modules/expo-sqlite/ios/sqlite3.c.
  echo "==> pod install (no repo-update, logs: $LOG_DIR/pods.log)"
  (cd ios && pod install >"../$LOG_DIR/pods.log" 2>&1) || {
    echo "pod install failed. Last 50 lines:" >&2
    tail -50 "$LOG_DIR/pods.log" >&2
    exit 1
  }
}

phase_rust_ios() {
  # The BioscriptFFI.xcframework is normally built by expo-bioscript's pod
  # prepare_command during `pod install`. When we skip pod install (fast
  # path), the xcframework may be missing from the cached ios/ directory
  # because it lives outside ios/ (modules/expo-bioscript/ios/Artifacts/).
  # Rebuild if missing; cargo's incremental + Rust cache make it fast.
  local script="modules/expo-bioscript/scripts/build-rust-ios.sh"
  local xcf="modules/expo-bioscript/ios/Artifacts/BioscriptFFI.xcframework"
  if [ ! -f "$script" ]; then
    echo "==> build-rust-ios.sh not found, skipping rust-ios phase"
    return 0
  fi
  if [ -d "$xcf/ios-arm64-simulator" ] && [ -d "$xcf/ios-arm64" ]; then
    echo "==> BioscriptFFI.xcframework slices present, skipping rust-ios build"
    return 0
  fi
  echo "==> build-rust-ios.sh (streaming + tee to $LOG_DIR/rust-ios.log)"
  sh "$script" 2>&1 | tee "$LOG_DIR/rust-ios.log"
  echo "==> xcframework slices after build:"
  ls -la "$xcf" 2>&1 || true
  for slice in ios-arm64 ios-arm64-simulator; do
    if [ -f "$xcf/$slice/libbioscript_ffi.a" ]; then
      echo "-- $slice/libbioscript_ffi.a:"
      ls -la "$xcf/$slice/libbioscript_ffi.a"
      nm "$xcf/$slice/libbioscript_ffi.a" 2>/dev/null | grep -E "bioscript_(run_file_json|free_string)" || echo "  (symbols not found via nm)"
    else
      echo "-- $slice/libbioscript_ffi.a MISSING"
    fi
  done
}

phase_build() {
  if [ ! -d "$IOS_WORKSPACE" ]; then
    echo "Workspace missing at $IOS_WORKSPACE — run pods first" >&2
    exit 1
  fi
  local UDID
  UDID=$(resolve_udid) || exit 1
  echo "==> xcodebuild (streaming + tee to $LOG_DIR/build.log)"
  # CI speed flags:
  # - COMPILER_INDEX_STORE_ENABLE=NO: skip source indexing (only for IDE)
  # - -skipPackagePluginValidation / -skipMacroValidation: skip SPM prompts
  # - NSUnbufferedIO=YES: don't buffer xcodebuild output line-by-line
  # Stream full output so the actual error (e.g. linker failure) is visible in
  # CI logs — redirecting to a file + tailing 50 lines was hiding real errors.
  env NSUnbufferedIO=YES xcodebuild \
    -workspace "$IOS_WORKSPACE" \
    -scheme "$IOS_SCHEME" \
    -configuration Debug \
    -destination "id=$UDID" \
    -derivedDataPath "$IOS_DERIVED_DATA" \
    -skipPackagePluginValidation \
    -skipMacroValidation \
    COMPILER_INDEX_STORE_ENABLE=NO \
    build 2>&1 | tee "$LOG_DIR/build.log"
  if [ ! -d "$APP_PATH" ]; then
    echo "Built app not found at $APP_PATH" >&2
    tail -50 "$LOG_DIR/build.log" >&2 || true
    exit 1
  fi
  echo "==> Built: $APP_PATH"
}

phase_metro_start() {
  if curl -sf http://localhost:8081/status >/dev/null 2>&1; then
    echo "==> Metro already running"
    return 0
  fi
  echo "==> Starting Metro in background (logs: $LOG_DIR/metro.log)"
  nohup npx expo start --dev-client --no-dev --minify \
    >"$LOG_DIR/metro.log" 2>&1 </dev/null &
  echo $! > "$METRO_PID_FILE"
  disown || true
  for i in {1..60}; do
    curl -sf http://localhost:8081/status >/dev/null 2>&1 && {
      echo "==> Metro is up (pid=$(cat "$METRO_PID_FILE"))"
      return 0
    }
    sleep 1
  done
  echo "Metro did not come up within 60s" >&2
  tail -30 "$LOG_DIR/metro.log" >&2 || true
  exit 1
}

phase_metro_stop() {
  if [ -f "$METRO_PID_FILE" ]; then
    local pid
    pid=$(cat "$METRO_PID_FILE")
    kill "$pid" 2>/dev/null || true
    rm -f "$METRO_PID_FILE"
  fi
}

phase_install_launch() {
  if [ ! -d "$APP_PATH" ]; then
    echo "Built app not found at $APP_PATH — run build first" >&2
    exit 1
  fi
  local UDID
  UDID=$(resolve_udid) || exit 1
  echo "==> simctl install"
  xcrun simctl install "$UDID" "$APP_PATH"
  echo "==> simctl launch $BUNDLE_ID"
  xcrun simctl launch "$UDID" "$BUNDLE_ID"
}

phase_devmenu() {
  local UDID
  UDID=$(resolve_udid) || exit 1
  echo "==> Disabling expo-dev-menu onboarding"
  xcrun simctl spawn "$UDID" defaults write "$BUNDLE_ID" EXDevMenuIsOnboardingFinished -bool YES 2>/dev/null || true
  xcrun simctl spawn "$UDID" defaults write host.exp.Exponent EXDevMenuIsOnboardingFinished -bool YES 2>/dev/null || true
}

phase_maestro() {
  command -v maestro >/dev/null || { echo "maestro not found; run npm run install-maestro" >&2; exit 1; }
  local UDID
  UDID=$(resolve_udid) || exit 1
  echo "==> Running Maestro flow: $FLOW"
  if maestro --device "$UDID" test "$FLOW"; then
    echo "✅ iOS test PASSED"
  else
    echo "❌ iOS test FAILED"
    exit 1
  fi
}

phase_all() {
  [ "${FORCE_CLEAN:-}" = "1" ] && phase_force_clean
  phase_boot_sim
  phase_prebuild
  phase_pods
  phase_rust_ios
  phase_metro_start
  if [ -n "${CI:-}" ]; then
    phase_build
    phase_install_launch
  else
    local UDID
    UDID=$(resolve_udid) || exit 1
    echo "==> Building & installing app on $UDID (local, via expo run:ios, logs: $LOG_DIR/build.log)"
    npx expo run:ios --device "$UDID" >"$LOG_DIR/build.log" 2>&1 || {
      echo "Build failed. Last 50 lines:" >&2
      tail -50 "$LOG_DIR/build.log" >&2
      exit 1
    }
  fi
  phase_devmenu
  phase_maestro
  phase_metro_stop
}

cmd="${1:-all}"
case "$cmd" in
  force-clean) phase_force_clean ;;
  boot-sim) phase_boot_sim ;;
  prebuild) phase_prebuild ;;
  pods) phase_pods ;;
  rust-ios) phase_rust_ios ;;
  build) phase_build ;;
  metro-start) phase_metro_start ;;
  metro-stop) phase_metro_stop ;;
  install-launch) phase_install_launch ;;
  devmenu) phase_devmenu ;;
  maestro) phase_maestro ;;
  all) phase_all ;;
  *) echo "Usage: $0 [force-clean|boot-sim|prebuild|pods|rust-ios|build|metro-start|metro-stop|install-launch|devmenu|maestro|all]" >&2; exit 2 ;;
esac
