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
DEST="${SCRIPT_DIR}/../web-runtime/bioscript-wasm"

if ! command -v wasm-pack >/dev/null 2>&1; then
  echo "[build-bioscript-wasm] wasm-pack not found — install via 'cargo install wasm-pack'" >&2
  exit 1
fi

echo "[build-bioscript-wasm] building (release, target=web)"
(cd "${CRATE_DIR}" && wasm-pack build --target web --release --out-dir pkg)

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

echo "[build-bioscript-wasm] done — artifacts live in ${DEST}"
