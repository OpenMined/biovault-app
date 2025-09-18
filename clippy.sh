#!/usr/bin/env bash
set -euo pipefail

cd biovault_rust_lib

# Enforce formatting
cargo fmt --all -- --check

# Lint everything (lib, bins, tests, benches, examples), treat warnings as errors
cargo clippy --all-targets --all-features --no-deps -- -D warnings
