#!/usr/bin/env bash
set -euo pipefail

if [ -z "${PW_CONNECT_WS_ENDPOINT:-}" ]; then
  echo "PW_CONNECT_WS_ENDPOINT is required for remote browser compatibility runs." >&2
  echo "Prefer npm run test:web-compat:remote-matrix with browser-compat-endpoints.json, WEB_COMPAT_REMOTE_ENDPOINTS_FILE, WEB_COMPAT_REMOTE_ENDPOINTS_JSON, BROWSER_COMPAT_REMOTE_ENDPOINTS_FILE, or BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON." >&2
  exit 2
fi

if [ -z "${WEB_URL:-}" ]; then
  echo "WEB_URL must be reachable by the remote browser provider." >&2
  echo "Use a deployed preview URL, provider local tunnel URL, or another public HTTPS URL." >&2
  exit 2
fi

case "${WEB_URL}" in
  http://localhost*|https://localhost*|http://127.0.0.1*|https://127.0.0.1*|http://\[::1\]*|https://\[::1\]*|*.localhost*|*.local*)
    if [ "${WEB_COMPAT_ALLOW_LOCAL_WEB_URL:-}" != "1" ]; then
      echo "WEB_URL points at a local-only host and will usually be unreachable by the remote browser provider." >&2
      echo "Use a deployed preview URL, provider local tunnel URL, or set WEB_COMPAT_ALLOW_LOCAL_WEB_URL=1 when a provider tunnel maps this local host." >&2
      exit 2
    fi
    ;;
esac

if [ "${WEB_COMPAT_REMOTE_PRECHECK_ONLY:-}" = "1" ]; then
  echo "Remote browser compatibility wrapper precheck passed."
  exit 0
fi

WEB_COMPAT_APPEND_RESULTS="${WEB_COMPAT_APPEND_RESULTS:-1}" \
PW_BROWSER_PROJECTS="${PW_BROWSER_PROJECTS:-chromium}" \
PW_WORKERS="${PW_WORKERS:-1}" \
WEB_REPORT_NO_PRIVATE="${WEB_REPORT_NO_PRIVATE:-1}" \
WEB_COMPAT_SAMPLE_ID="${WEB_COMPAT_SAMPLE_ID:-23andme-v5-hu50B3F5}" \
WEB_COMPAT_STRICT_ARTIFACTS="${WEB_COMPAT_STRICT_ARTIFACTS:-1}" \
./test-web.sh --wasm-compat "$@"
