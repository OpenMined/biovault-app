#!/usr/bin/env bash
# Build bioscript-wasm (wasm-bindgen target=web) and copy the artifact +
# generated loader into expo-bioscript's web-runtime directory. This is the
# single source of truth for all file/assay/variant logic on web — see
# docs/architecture/bioscript-is-source-of-truth.md.
#
# Usage:
#   bash modules/expo-bioscript/scripts/build-bioscript-wasm.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
CRATE_DIR="${APP_ROOT}/bioscript/rust/bioscript-wasm"
DEST="${SCRIPT_DIR}/../src/bioscript-wasm"
# Also mirror the wasm-pack outputs into web-runtime/ so they're reachable at
# static URLs (not behind Metro's JS bundler). The CRAM Web Worker lives there
# and `import`s the bindings via relative URL.
WORKER_DEST="${SCRIPT_DIR}/../web-runtime/bioscript-wasm"

if ! command -v wasm-pack >/dev/null 2>&1; then
  echo "[build-bioscript-wasm] wasm-pack not found — install via 'cargo install wasm-pack'" >&2
  exit 1
fi

PROFILE="${BIOSCRIPT_WASM_PROFILE:-dev}"
echo "[build-bioscript-wasm] building (${PROFILE}, target=web)"
if [ "${PROFILE}" = "release" ]; then
  (cd "${CRATE_DIR}" && wasm-pack build --target web --release --out-dir pkg)
else
  (cd "${CRATE_DIR}" && wasm-pack build --target web --dev --out-dir pkg)
fi

mkdir -p "${DEST}"
for name in bioscript_wasm.js bioscript_wasm.d.ts bioscript_wasm_bg.wasm; do
  src="${CRATE_DIR}/pkg/${name}"
  if [ ! -f "${src}" ]; then
    echo "[build-bioscript-wasm] missing expected output: ${src}" >&2
    exit 1
  fi
  cp "${src}" "${DEST}/"
  echo "[build-bioscript-wasm] copied ${name}"
done

# Metro (used by Expo web) can't parse `import.meta.url`, which wasm-pack
# emits as a fallback for when the caller doesn't pass `module_or_path`. We
# always pass it explicitly from BioscriptWasm.ts, so that branch is dead —
# rewrite it to something Metro can parse.
JS_TARGET="${DEST}/bioscript_wasm.js"
if sed --version >/dev/null 2>&1; then
  sed -i "s|import.meta.url|''|g" "${JS_TARGET}"
else
  sed -i '' "s|import.meta.url|''|g" "${JS_TARGET}"
fi
echo "[build-bioscript-wasm] stripped import.meta.url for Metro compatibility"

# Mirror into web-runtime/bioscript-wasm for the Web Worker. We publish the
# bindings as a .mjs so the worker's `import(url)` resolves them as an ES
# module regardless of Metro's JS bundler (which would otherwise try to
# transform them).
mkdir -p "${WORKER_DEST}"
cp "${JS_TARGET}" "${WORKER_DEST}/bioscript_wasm.mjs"
cp "${DEST}/bioscript_wasm_bg.wasm" "${WORKER_DEST}/bioscript_wasm_bg.wasm"
echo "[build-bioscript-wasm] mirrored bindings + wasm into ${WORKER_DEST}"

echo "[build-bioscript-wasm] done — artifacts live in ${DEST} (+ worker copy in ${WORKER_DEST})"
