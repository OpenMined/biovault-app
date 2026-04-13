#!/usr/bin/env bash
set -euo pipefail

FULL_CLEAN_FLAG=0
OPEN_HTML_FLAG=${OPEN_HTML:-0}
for arg in "$@"; do
  case "$arg" in
    --full-clean|-c)
      FULL_CLEAN_FLAG=1
      ;;
    --open)
      OPEN_HTML_FLAG=1
      ;;
    --help|-h)
      echo "Usage: $0 [--full-clean|-c] [--open]"
      echo "  --full-clean, -c  Run cargo clean and remove coverage dirs before running"
      echo "  --open            Open HTML report locally (no-op in CI)"
      exit 0
      ;;
    *) ;;
  esac
done

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$ROOT_DIR/bioscript/rust"

echo "==> Formatting and linting"
cargo fmt --all
cargo clippy --workspace --all-targets --all-features -q || true

echo "==> Checking cargo-llvm-cov availability"
if ! cargo llvm-cov --version >/dev/null 2>&1; then
  if [[ "${AUTO_INSTALL_LLVM_COV:-1}" == "1" ]]; then
    echo "==> Installing cargo-llvm-cov (first run only)"
    cargo install cargo-llvm-cov
  else
    echo "cargo-llvm-cov is not installed. Install with: cargo install cargo-llvm-cov" >&2
    exit 1
  fi
fi

if ! rustup component list --installed | grep -q '^llvm-tools-preview'; then
  if [[ "${AUTO_INSTALL_LLVM_TOOLS:-1}" == "1" ]]; then
    echo "==> Installing rustup component: llvm-tools-preview (first run only)"
    rustup component add llvm-tools-preview
  else
    echo "llvm-tools-preview is missing. Install with: rustup component add llvm-tools-preview" >&2
    exit 1
  fi
fi

mkdir -p target/coverage

if [[ "${FULL_CLEAN:-0}" == "1" || "$FULL_CLEAN_FLAG" == "1" ]]; then
  echo "==> FULL_CLEAN=1: performing cargo clean and removing coverage dirs"
  cargo clean
  rm -rf target/llvm-cov target/coverage target/llvm-cov-target || true
fi

echo "==> Cleaning previous coverage artifacts"
cargo llvm-cov clean --workspace
mkdir -p target/coverage

LCOV_OUT=${LCOV_OUT:-target/coverage/lcov.info}
HTML_FLAG="--html"
OPEN_FLAG=""
if [[ "$OPEN_HTML_FLAG" == "1" ]]; then
  OPEN_FLAG="--open"
fi

cargo llvm-cov --workspace $OPEN_FLAG $HTML_FLAG
cargo llvm-cov report --workspace --lcov --output-path "$LCOV_OUT"
cargo llvm-cov report --workspace --summary-only

HTML_DIR="target/llvm-cov/html"
if [[ -d "$HTML_DIR" ]]; then
  echo "HTML report: bioscript/rust/$HTML_DIR/index.html"
fi

echo "LCOV file: bioscript/rust/$LCOV_OUT"
