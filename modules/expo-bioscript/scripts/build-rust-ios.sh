#!/bin/sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
IOS_DIR="$ROOT_DIR/ios"
CARGO_HOME_DIR="${CARGO_HOME:-/tmp/expo-bioscript-cargo}"
ARTIFACTS_DIR="$IOS_DIR/Artifacts"
DEVICE_TARGET="aarch64-apple-ios"
SIM_TARGET="aarch64-apple-ios-sim"

if [ -n "${BIOSCRIPT_ROOT:-}" ]; then
  RESOLVED_BIOSCRIPT_ROOT="$BIOSCRIPT_ROOT"
elif [ -d "$ROOT_DIR/../../bioscript/rust/bioscript-ffi" ]; then
  RESOLVED_BIOSCRIPT_ROOT="$ROOT_DIR/../../bioscript"
else
  echo "Unable to locate local bioscript runtime."
  echo "Expected: $ROOT_DIR/../../bioscript"
  echo "Or set BIOSCRIPT_ROOT to a bioscript repo root."
  exit 1
fi

RUST_WORKSPACE_DIR="$RESOLVED_BIOSCRIPT_ROOT/rust"
RUST_MANIFEST="$RUST_WORKSPACE_DIR/bioscript-ffi/Cargo.toml"

if [ -f "$HOME/.cargo/env" ]; then
  . "$HOME/.cargo/env"
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "cargo is not available in PATH"
  exit 1
fi

if ! command -v rustup >/dev/null 2>&1; then
  echo "rustup is not available in PATH"
  exit 1
fi

for RUST_TARGET in "$DEVICE_TARGET" "$SIM_TARGET"; do
  if rustup target list --installed | grep -q "^$RUST_TARGET$"; then
    continue
  fi

  echo "Missing Rust target: $RUST_TARGET"
  echo "Install it with: rustup target add $RUST_TARGET"
  exit 1
done

mkdir -p "$CARGO_HOME_DIR"

cd "$RUST_WORKSPACE_DIR"
CARGO_HOME="$CARGO_HOME_DIR" cargo build --manifest-path "$RUST_MANIFEST" --target "$DEVICE_TARGET" --release
CARGO_HOME="$CARGO_HOME_DIR" cargo build --manifest-path "$RUST_MANIFEST" --target "$SIM_TARGET" --release

DEVICE_LIB="$RUST_WORKSPACE_DIR/target/$DEVICE_TARGET/release/libbioscript_ffi.a"
SIM_LIB="$RUST_WORKSPACE_DIR/target/$SIM_TARGET/release/libbioscript_ffi.a"

if [ ! -f "$DEVICE_LIB" ] || [ ! -f "$SIM_LIB" ]; then
  echo "Missing Rust build artifacts for Bioscript iOS packaging"
  exit 1
fi

mkdir -p "$ARTIFACTS_DIR"
cp "$DEVICE_LIB" "$ARTIFACTS_DIR/libbioscript_ios.a"
cp "$SIM_LIB" "$ARTIFACTS_DIR/libbioscript_sim.a"
