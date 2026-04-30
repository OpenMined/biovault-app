#!/usr/bin/env bash
set -euo pipefail

DESKTOP_DIR="${DESKTOP_DIR:-desktop}"

if [ ! -d "$DESKTOP_DIR" ]; then
  echo "Desktop app directory '$DESKTOP_DIR' not found" >&2
  exit 1
fi

echo "==> Running shared Lab scenarios through native Rust runtime"
echo "==> This suite does not launch Tauri UI or Playwright"

cargo test --manifest-path "$DESKTOP_DIR/src-tauri/Cargo.toml" desktop_lab_runs_shared_ -- --test-threads=1

echo ""
echo "✅ Native Rust Lab scenario tests PASSED"
