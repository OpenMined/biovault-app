#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo "==> Fetching test data"
./tools/fetch_test_data.sh

echo "==> Running root Rust tests"
./test.sh

echo "==> Checking BioScript app/core boundary"
npm run check:bioscript-boundary

echo "==> Checking BioScript CLI/WASM parity"
npm run check:bioscript-parity

echo "==> Running web tests"
./test-web.sh

echo "==> Running desktop UI tests"
./test-desktop.sh

echo "==> Running native Rust Lab tests"
./test-lib.sh

if [ -x "${ROOT}/bioscript/test.sh" ]; then
  echo "==> Running bioscript submodule tests"
  (cd bioscript && ./test.sh)
fi
