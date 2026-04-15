#!/usr/bin/env bash
set -euo pipefail

# Tests for this app repo. bioscript is a submodule with its own test suite —
# run `./test.sh` inside bioscript/ to exercise that.

MODE=${1:---fast}

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

RUST_WORKSPACES=(
  "desktop/src-tauri"
)

# tauri::generate_context! panics at compile time if frontendDist
# (desktop/dist) is missing. Cargo tests don't need a real web bundle,
# so stub the dir if it's absent.
if [ ! -d "desktop/dist" ]; then
  mkdir -p desktop/dist
  : > desktop/dist/index.html
fi

echo "==> cargo fmt"
for ws in "${RUST_WORKSPACES[@]}"; do
  [ -d "$ws" ] || continue
  (cd "$ws" && cargo fmt --all)
done

echo "==> cargo clippy"
for ws in "${RUST_WORKSPACES[@]}"; do
  [ -d "$ws" ] || continue
  (cd "$ws" && cargo clippy --workspace --all-targets --all-features --no-deps -q) || true
done

run_fast() {
  echo "==> Running fast tests"
  for ws in "${RUST_WORKSPACES[@]}"; do
    [ -d "$ws" ] || continue
    (cd "$ws" && cargo test --workspace)
  done
}

run_slow() {
  echo "==> Running slow tests (ignored only)"
  for ws in "${RUST_WORKSPACES[@]}"; do
    [ -d "$ws" ] || continue
    (cd "$ws" && cargo test --workspace -- --ignored)
  done
}

case "$MODE" in
  --fast)
    run_fast
    ;;
  --slow)
    run_slow
    ;;
  --all)
    run_fast
    run_slow
    ;;
  *)
    echo "Unknown option: $MODE" >&2
    echo "Usage: $0 [--fast|--slow|--all]" >&2
    exit 2
    ;;
esac
