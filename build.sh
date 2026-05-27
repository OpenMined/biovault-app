#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$ROOT_DIR/desktop"
TAURI_DIR="$DESKTOP_DIR/src-tauri"

cd "$ROOT_DIR"

if [[ "${1:-}" == "--clean" ]]; then
  echo "Cleaning desktop Tauri build output..."
  cargo clean --manifest-path "$TAURI_DIR/Cargo.toml"
  rm -rf "$TAURI_DIR/target/release/bundle" "$TAURI_DIR/target"/*/release/bundle 2>/dev/null || true
fi

if [[ ! -d "$DESKTOP_DIR/node_modules" ]]; then
  (cd "$DESKTOP_DIR" && npm install)
fi

BUILD_ARGS=(build --config '{"bundle":{"createUpdaterArtifacts":false}}')
if [[ -n "${TAURI_TARGET:-}" ]]; then
  BUILD_ARGS+=(--target "$TAURI_TARGET")
fi

if ! (cd "$DESKTOP_DIR" && npm exec -- tauri "${BUILD_ARGS[@]}"); then
  if [[ "$(uname -s)" == "Darwin" ]]; then
    echo "Tauri packaging failed; attempting simple DMG fallback from the built .app..."
    "$ROOT_DIR/scripts/create-desktop-dmg.sh"
  else
    exit 1
  fi
fi

if [[ "$(uname -s)" == "Darwin" ]]; then
  find "$TAURI_DIR/target" -type f \( -name "*.dmg" -o -name "*.app.tar.gz" -o -name "*.sig" \) -print0 2>/dev/null \
    | xargs -0 -I{} xattr -c "{}" 2>/dev/null || true
fi

echo
echo "Built desktop artifacts:"
find "$TAURI_DIR/target" -path "*/release/bundle/*" -type f -print 2>/dev/null | sort
