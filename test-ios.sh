#!/usr/bin/env bash
set -euo pipefail

# Phase-aware iOS Lab runner. No arg = run the whole sequence locally. In
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
# By default the Maestro phase generates a flow from tests/lab-scenarios.yaml
# so iOS exercises the shared Lab scenario DSL. Use FLOW=.maestro/smoke.yaml
# for the older shell-only smoke flow.
#
# FORCE_CLEAN=1 wipes ios/ + DerivedData before starting — cheap escape hatch
# when caches go stale. The common path stays fast.

BUNDLE_ID="${BUNDLE_ID:-org.openmined.biovault.dev}"
SIM_NAME="${SIM_NAME:-iPhone 16}"
FLOW="${FLOW:-tests/lab-scenarios.yaml}"
LOG_DIR=".maestro/logs"
GENERATED_FLOW_DIR=".maestro/generated"
REPO_ROOT="${REPO_ROOT:-$PWD}"
# Auto-detect the workspace expo prebuild produced. The project name comes
# from app.config.ts `name` slugified — depending on Expo SDK version the
# Dev variant ends up as "BioVault" or "BioVaultDev", and the prod variant
# is just "BioVault". Pick whatever .xcworkspace is sitting in ios/, falling
# back to BioVault for first-time runs before prebuild has happened.
detect_ios_scheme() {
  if [ -n "${IOS_SCHEME:-}" ]; then
    echo "$IOS_SCHEME"; return 0
  fi
  if [ -d "$REPO_ROOT/ios" ]; then
    local ws
    ws=$(ls -1d "$REPO_ROOT"/ios/*.xcworkspace 2>/dev/null | head -1)
    if [ -n "$ws" ]; then
      basename "$ws" .xcworkspace
      return 0
    fi
  fi
  echo "BioVault"
}
IOS_SCHEME="$(detect_ios_scheme)"
IOS_WORKSPACE_REL="${IOS_WORKSPACE_REL:-ios/${IOS_SCHEME}.xcworkspace}"
IOS_DERIVED_DATA_REL="${IOS_DERIVED_DATA_REL:-ios/build}"
IOS_WORKSPACE="$REPO_ROOT/$IOS_WORKSPACE_REL"
IOS_DERIVED_DATA="$REPO_ROOT/$IOS_DERIVED_DATA_REL"
# PRODUCT_NAME can differ from the scheme name (the Dev variant in
# app.config.ts produces scheme=BioVault but PRODUCT_NAME=BioVaultDev).
# Resolve at call time so first-run (before build) and post-build both work.
resolve_app_path() {
  local products="$IOS_DERIVED_DATA/Build/Products/Debug-iphonesimulator"
  local found
  if [ -d "$products" ]; then
    found=$(ls -1d "$products"/*.app 2>/dev/null | head -1)
    if [ -n "$found" ]; then echo "$found"; return; fi
  fi
  echo "$products/${IOS_SCHEME}.app"
}
APP_PATH="$(resolve_app_path)"
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

resolve_dev_server_url() {
  if [ -n "${EXPO_DEV_SERVER_URL:-}" ]; then
    echo "$EXPO_DEV_SERVER_URL"
    return 0
  fi
  local iface ip
  iface=$(route get default 2>/dev/null | awk '/interface:/{print $2; exit}' || true)
  if [ -n "$iface" ]; then
    ip=$(ipconfig getifaddr "$iface" 2>/dev/null || true)
  fi
  if [ -z "${ip:-}" ]; then
    ip=$(ifconfig 2>/dev/null | awk '/inet / && $2 !~ /^127\\./ {print $2; exit}' || true)
  fi
  if [ -n "${ip:-}" ]; then
    echo "http://$ip:8081"
  else
    echo "http://127.0.0.1:8081"
  fi
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
  # The script itself stamps Cargo manifests + Rust sources so it no-ops
  # when nothing changed.
  local script="modules/expo-bioscript/scripts/build-rust-ios.sh"
  local xcf="modules/expo-bioscript/ios/Artifacts/BioscriptFFI.xcframework"
  if [ ! -f "$script" ]; then
    echo "==> build-rust-ios.sh not found, skipping rust-ios phase"
    return 0
  fi
  # Sim-only by default for test-ios.sh (we only run on the simulator).
  # Override: BIOSCRIPT_SIM_ONLY=0 to also build the device slice.
  local sim_only="${BIOSCRIPT_SIM_ONLY:-1}"
  echo "==> build-rust-ios.sh (sim_only=$sim_only, streaming + tee to $LOG_DIR/rust-ios.log)"
  EXPO_BIOSCRIPT_SIM_ONLY="$sim_only" sh "$script" 2>&1 | tee "$LOG_DIR/rust-ios.log"
  echo "==> xcframework slices after build:"
  ls -la "$xcf" 2>&1 || true
  local slices="ios-arm64-simulator"
  [ "$sim_only" = "0" ] && slices="ios-arm64 ios-arm64-simulator"
  for slice in $slices; do
    if [ -f "$xcf/$slice/libbioscript_ffi.a" ]; then
      echo "-- $slice/libbioscript_ffi.a:"
      ls -la "$xcf/$slice/libbioscript_ffi.a"
      nm "$xcf/$slice/libbioscript_ffi.a" 2>/dev/null | grep -E " T _bioscript_(run_file_json|free_string)" || echo "  (symbols not found via nm)"
    else
      echo "-- $slice/libbioscript_ffi.a MISSING"
    fi
  done
  # Force xcodebuild to re-copy the xcframework and re-link the app only
  # when the stamp file says we actually rebuilt. With ios/ (and therefore
  # ios/build) cached across runs, Xcode's build manifest treats
  # XCFrameworkIntermediates/ExpoBioscript as up-to-date and skips "[CP]
  # Copy XCFrameworks" — even after we just rebuilt the xcframework. Only
  # invalidate if the xcframework was actually re-emitted (mtime newer
  # than the build product), so warm runs stay fast.
  if [ -d "$IOS_DERIVED_DATA" ]; then
    local manifest="$IOS_DERIVED_DATA/XCBuildData"
    local need_invalidate=0
    if [ ! -d "$manifest" ]; then
      need_invalidate=0
    elif [ "$xcf" -nt "$manifest" ]; then
      need_invalidate=1
    fi
    if [ "$need_invalidate" = "1" ]; then
      echo "==> xcframework newer than build manifest — invalidating Products + XCBuildData to force re-link"
      rm -rf "$IOS_DERIVED_DATA/Build/Products" "$IOS_DERIVED_DATA/XCBuildData" || true
    else
      echo "==> xcframework unchanged — keeping Products + XCBuildData warm"
    fi
  fi
}

phase_build() {
  if [ ! -d "$IOS_WORKSPACE" ]; then
    echo "Workspace missing at $IOS_WORKSPACE — run pods first" >&2
    exit 1
  fi
  local UDID
  UDID=$(resolve_udid) || exit 1
  echo "==> xcodebuild (streaming + tee to $LOG_DIR/build.log)"
  # Speed flags:
  # - COMPILER_INDEX_STORE_ENABLE=NO: skip source indexing (only used by the IDE).
  # - -skipPackagePluginValidation / -skipMacroValidation: skip SPM prompts.
  # - NSUnbufferedIO=YES: don't buffer xcodebuild output line-by-line.
  # - ONLY_ACTIVE_ARCH=YES + ARCHS=arm64: build a single sim arch — host is
  #   arm64 macOS so we never need x86_64 here.
  # - CODE_SIGNING_*=NO: simulator builds don't need a real cert; explicit
  #   skips trim the entitlements/codesign step.
  # - Xcode 26 compilation cache + explicit modules: caches Clang/Swift
  #   module compilation across builds. CAS lives under
  #   $IOS_DERIVED_DATA/CompilationCache so it survives rust-ios
  #   re-links. Pre-warming the modules graph is what makes the second
  #   xcodebuild invocation drop from minutes to ~tens of seconds.
  # Stream full output so the actual error (e.g. linker failure) is visible
  # in CI logs — redirecting to a file + tailing 50 lines was hiding real
  # errors.
  local cache_dir="$IOS_DERIVED_DATA/CompilationCache"
  mkdir -p "$cache_dir"
  env NSUnbufferedIO=YES xcodebuild \
    -workspace "$IOS_WORKSPACE" \
    -scheme "$IOS_SCHEME" \
    -configuration Debug \
    -destination "id=$UDID" \
    -derivedDataPath "$IOS_DERIVED_DATA" \
    -skipPackagePluginValidation \
    -skipMacroValidation \
    -clonedSourcePackagesDirPath "$IOS_DERIVED_DATA/SourcePackages" \
    COMPILER_INDEX_STORE_ENABLE=NO \
    ONLY_ACTIVE_ARCH=YES \
    ARCHS=arm64 \
    SWIFT_ENABLE_EXPLICIT_MODULES=YES \
    CLANG_ENABLE_EXPLICIT_MODULES=YES \
    COMPILATION_CACHE_ENABLE_CACHING=YES \
    COMPILATION_CACHE_CAS_PATH="$cache_dir" \
    DEBUG_INFORMATION_FORMAT=dwarf \
    build 2>&1 | tee "$LOG_DIR/build.log"
  APP_PATH="$(resolve_app_path)"
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
  APP_PATH="$(resolve_app_path)"
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
  local flow="$FLOW"
  if [ "${LAB_SCENARIOS:-}" = "1" ] || [ "$flow" = "tests/lab-scenarios.yaml" ]; then
    mkdir -p "$GENERATED_FLOW_DIR"
    echo "==> Generating Maestro flow from shared Lab scenarios"
    flow=$(PLATFORM=ios BUNDLE_ID="$BUNDLE_ID" EXPO_DEV_SERVER_URL="$(resolve_dev_server_url)" OUT="$GENERATED_FLOW_DIR/lab-ios.yaml" node scripts/generate-maestro-lab-flow.mjs)
  fi
  echo "==> Running Maestro flow: $flow"
  if maestro --device "$UDID" test "$flow"; then
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
  # Use the optimized phase_build path (Xcode 26 explicit modules + compile
  # cache + sim-only arch + skipped codesign) on both local and CI runs.
  # By this point prebuild + pods have ensured ios/ and Pods/ exist, so the
  # one-shot expo run:ios flow is no longer needed.
  phase_build
  phase_install_launch
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
