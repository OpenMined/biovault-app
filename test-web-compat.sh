#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Real-device runtimes (not Playwright engine/viewport emulation):
#   ./test-web-compat.sh --ios       REAL Mobile Safari on the iOS Simulator (Appium/XCUITest)
#   ./test-web-compat.sh --android   REAL Chrome on a real Android emulator (Playwright _android)
# Both load the app, run the demo genome through Monty + bioscript-wasm,
# and verify the report's 4 artifacts. Configure via env, e.g.:
#   WEB_COMPAT_IOS_VERSION=18.3 WEB_COMPAT_IOS_UDID=<udid> ./test-web-compat.sh --ios
#   ANDROID_SERIAL=emulator-5554 WEB_URL=http://localhost:8082 ./test-web-compat.sh --android
case "${1:-}" in
  --ios)
    shift
    exec node "$HERE/scripts/run-local-ios-browser-compat.mjs" "$@"
    ;;
  --android)
    shift
    exec node "$HERE/scripts/run-local-android-browser-compat-demo.mjs" "$@"
    ;;
esac

OUTPUT_DIR="${WEB_COMPAT_OUTPUT_DIR:-test-output/browser-compat}"
if [[ "${WEB_COMPAT_APPEND_RESULTS:-0}" != "1" ]]; then
  rm -rf "$OUTPUT_DIR"
fi

if [[ "${WEB_COMPAT_PRECHECK_ONLY:-0}" == "1" ]]; then
  echo "Browser compatibility wrapper precheck passed."
  exit 0
fi

WEB_SECURE_ORIGIN="${WEB_SECURE_ORIGIN:-0}" \
PW_IGNORE_HTTPS_ERRORS="${PW_IGNORE_HTTPS_ERRORS:-1}" \
PW_BROWSER_PROJECTS="${PW_BROWSER_PROJECTS:-chromium,firefox,webkit,mobile-chromium,mobile-firefox,mobile-webkit}" \
PW_WORKERS="${PW_WORKERS:-1}" \
WEB_REPORT_NO_PRIVATE="${WEB_REPORT_NO_PRIVATE:-1}" \
WEB_COMPAT_SAMPLE_ID="${WEB_COMPAT_SAMPLE_ID:-23andme-v5-hu50B3F5}" \
WEB_COMPAT_STRICT_ARTIFACTS="${WEB_COMPAT_STRICT_ARTIFACTS:-1}" \
./test-web.sh --wasm-compat "$@"
