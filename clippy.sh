#!/usr/bin/env bash
set -euo pipefail

cd bioscript/rust
cargo fmt --all
cargo clippy --workspace --all-targets --all-features --fix --allow-dirty --no-deps -- -D warnings
