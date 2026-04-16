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

echo "[build-bioscript-wasm] done — artifacts live in ${DEST}"
