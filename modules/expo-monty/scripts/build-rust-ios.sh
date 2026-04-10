#!/bin/sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
IOS_DIR="$ROOT_DIR/ios"
RUST_DIR="$ROOT_DIR/rust"
CARGO_HOME_DIR="${CARGO_HOME:-/tmp/expo-monty-cargo}"
ARTIFACTS_DIR="$IOS_DIR/Artifacts"
DEVICE_TARGET="aarch64-apple-ios"
SIM_TARGET="aarch64-apple-ios-sim"

if [ -f "$HOME/.cargo/env" ]; then
  # Xcode script phases often run without the user's shell PATH.
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

cd "$RUST_DIR"
CARGO_HOME="$CARGO_HOME_DIR" cargo build --locked --manifest-path Cargo.toml --target "$DEVICE_TARGET" --release
CARGO_HOME="$CARGO_HOME_DIR" cargo build --locked --manifest-path Cargo.toml --target "$SIM_TARGET" --release

DEVICE_LIB="$RUST_DIR/target/$DEVICE_TARGET/release/libexpo_monty_ffi.a"
SIM_LIB="$RUST_DIR/target/$SIM_TARGET/release/libexpo_monty_ffi.a"

if [ ! -f "$DEVICE_LIB" ] || [ ! -f "$SIM_LIB" ]; then
  echo "Missing Rust build artifacts for vendored library packaging"
  exit 1
fi

mkdir -p "$ARTIFACTS_DIR"
cp "$DEVICE_LIB" "$ARTIFACTS_DIR/libexpo_monty_ffi_ios.a"
cp "$SIM_LIB" "$ARTIFACTS_DIR/libexpo_monty_ffi_sim.a"
