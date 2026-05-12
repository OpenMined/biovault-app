#!/usr/bin/env bash
# Run exvitae's full report test suite (samples.yaml + samples.private.yaml)
# through the wasm artifact instead of the rust CLI, by handing
# `test_reports.py` a `bs`-shaped shim (`tools/bs-wasm`) that invokes Node +
# wasm under the hood. Produces the same 4 artifacts per case in a
# separate output directory so you can diff them against the CLI output
# for parity.
#
# Prereqs:
#   1. Node-targeted wasm built:
#        cd bioscript/rust/bioscript-wasm && \
#          RUSTFLAGS='--cfg getrandom_backend="wasm_js"' \
#          wasm-pack build --target nodejs --dev --out-dir pkg-node
#   2. Test fixtures fetched (handled by exvitae's tools/fetch_test_data.sh).
#
# Usage:
#   ./test-wasm.sh                            # run every case
#   ./test-wasm.sh --sample 23andme-v5-hu50B3F5
#   ./test-wasm.sh --keep-going

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXVITAE_DIR="${EXVITAE_DIR:-/Users/madhavajay/dev/exvitae-data/exvitae}"
WASM_PKG_DIR="${SCRIPT_DIR}/bioscript/rust/bioscript-wasm/pkg-node"
BS_WASM="${SCRIPT_DIR}/tools/bs-wasm"

# Always rebuild — fast incremental on second run, and avoids the
# "wasm artifact stale relative to checked-in rust" footgun where you
# tweak `bioscript-wasm/src/*.rs` and forget to re-pack.
echo "==> Building Node-targeted wasm (pkg-node)"
(cd "${SCRIPT_DIR}/bioscript/rust/bioscript-wasm" && \
  RUSTFLAGS='--cfg getrandom_backend="wasm_js"' \
  wasm-pack build --target nodejs --dev --out-dir pkg-node)

if [ ! -d "${EXVITAE_DIR}" ]; then
  echo "EXVITAE_DIR not found: ${EXVITAE_DIR}" >&2
  echo "Set EXVITAE_DIR=/path/to/exvitae or check out exvitae locally." >&2
  exit 1
fi

# Re-route output_dir so wasm artifacts land in a separate tree we can diff
# against the CLI's `test-output/report-tests*` outputs.
export BIOSCRIPT_BIN="${BS_WASM}"

cd "${EXVITAE_DIR}"
./test.sh --bioscript "${BS_WASM}" "$@"
