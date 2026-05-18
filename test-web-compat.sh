#!/usr/bin/env bash
set -euo pipefail

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
