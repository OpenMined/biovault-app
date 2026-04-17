#!/usr/bin/env bash
# Rebuild the monty wasm/worker assets and copy them into expo-bioscript's
# web-runtime directory. The loader that invokes them lives in
# ExpoBioscriptWebRuntime.ts — there's no generated .mjs to patch anymore.
#
# Usage:
#   bash modules/expo-bioscript/scripts/build-monty-web.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
MONTY_ROOT="${APP_ROOT}/bioscript/monty"
MONTY_JS_DIR="${APP_ROOT}/bioscript/monty/crates/monty-js"
DEST="${SCRIPT_DIR}/../web-runtime/monty-wasm32-wasi"

if [ ! -d "${MONTY_JS_DIR}" ]; then
  echo "[build-monty-web] monty submodule missing at ${MONTY_JS_DIR}" >&2
  echo "[build-monty-web] did you forget \`git submodule update --init --recursive\`?" >&2
  exit 1
fi

if [ ! -x "${MONTY_ROOT}/.venv/bin/python3" ]; then
  if ! command -v uv >/dev/null 2>&1; then
    echo "[build-monty-web] monty Python environment missing and uv is not installed" >&2
    echo "[build-monty-web] install uv or create ${MONTY_ROOT}/.venv manually, then rerun" >&2
    exit 1
  fi
  echo "[build-monty-web] monty Python environment missing; running uv sync --all-packages --only-dev"
  (cd "${MONTY_ROOT}" && uv sync --all-packages --only-dev)
fi

if [ ! -x "${MONTY_JS_DIR}/node_modules/.bin/run-s" ]; then
  echo "[build-monty-web] monty-js dependencies missing; running npm ci"
  (cd "${MONTY_JS_DIR}" && npm ci)
fi

echo "[build-monty-web] rebuilding monty-js (release, ESM)"
(cd "${MONTY_JS_DIR}" && npm run build)

mkdir -p "${DEST}"
# We only copy the runtime assets, not the generated .mjs loader — our own
# loader in ExpoBioscriptWebRuntime.ts talks to @napi-rs/wasm-runtime directly.
for name in monty.wasm32-wasi.wasm wasi-worker-browser.mjs wasi-worker.mjs monty.wasi.cjs; do
  src="${MONTY_JS_DIR}/${name}"
  if [ -f "${src}" ]; then
    cp "${src}" "${DEST}/"
    echo "[build-monty-web] copied ${name}"
  fi
done


# Record a source-hash marker so the stale-artifact guardrail knows the WASM
# in DEST matches the current monty source. The guardrail reads this on every
# start/test run.
node "${APP_ROOT}/scripts/check-monty-artifacts.mjs" --write

echo "[build-monty-web] done — artifacts live in ${DEST}"
