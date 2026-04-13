#!/usr/bin/env bash
set -euo pipefail

MODE=${1:---fast}

cd bioscript/rust

echo "==> cargo fmt"
cargo fmt --all

echo "==> cargo clippy"
cargo clippy --workspace --all-targets --all-features -q || true

run_fast() {
  echo "==> Running fast tests"
  cargo test --workspace
}

run_slow() {
  echo "==> Running slow tests (ignored only)"
  cargo test --workspace -- --ignored
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
