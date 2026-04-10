#!/bin/sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUST_DIR="$ROOT_DIR/rust"
IOS_DIR="$ROOT_DIR/ios"
ARTIFACTS_DIR="$IOS_DIR/rust"
CARGO_HOME_DIR="${CARGO_HOME:-/tmp/expo-biovault-cargo}"
DEVICE_TARGET="aarch64-apple-ios"
SIM_ARM_TARGET="aarch64-apple-ios-sim"
SIM_X86_TARGET="x86_64-apple-ios"

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

if ! command -v cbindgen >/dev/null 2>&1; then
  echo "cbindgen is required for iOS builds"
  echo "Install it with: cargo install cbindgen"
  exit 1
fi

for RUST_TARGET in "$DEVICE_TARGET" "$SIM_ARM_TARGET"; do
  if ! rustup target list --installed | grep -q "^$RUST_TARGET$"; then
    echo "Missing Rust target: $RUST_TARGET"
    echo "Install it with: rustup target add $RUST_TARGET"
    exit 1
  fi
done

mkdir -p "$CARGO_HOME_DIR" "$ARTIFACTS_DIR"
rm -f \
  "$ARTIFACTS_DIR/biovault_rust_lib.h" \
  "$ARTIFACTS_DIR/libbiovault_rust_lib_ios.a" \
  "$ARTIFACTS_DIR/libbiovault_rust_lib_sim.a"

cd "$RUST_DIR"
CARGO_HOME="$CARGO_HOME_DIR" cargo build --release --target "$DEVICE_TARGET"
CARGO_HOME="$CARGO_HOME_DIR" cargo build --release --target "$SIM_ARM_TARGET"

if rustup target list --installed | grep -q "^$SIM_X86_TARGET$"; then
  CARGO_HOME="$CARGO_HOME_DIR" cargo build --release --target "$SIM_X86_TARGET"
fi

cbindgen --lang c --crate expo_biovault_ffi --output expo_biovault_ffi.h

DEVICE_LIB="$RUST_DIR/target/$DEVICE_TARGET/release/libexpo_biovault_ffi.a"
SIM_ARM_LIB="$RUST_DIR/target/$SIM_ARM_TARGET/release/libexpo_biovault_ffi.a"
HEADER_FILE="$RUST_DIR/expo_biovault_ffi.h"
DEVICE_OUTPUT="$ARTIFACTS_DIR/libexpo_biovault_ffi_ios.a"
SIM_OUTPUT="$ARTIFACTS_DIR/libexpo_biovault_ffi_sim.a"

if [ -f "$RUST_DIR/target/$SIM_X86_TARGET/release/libexpo_biovault_ffi.a" ]; then
  lipo -create \
    "$SIM_ARM_LIB" \
    "$RUST_DIR/target/$SIM_X86_TARGET/release/libexpo_biovault_ffi.a" \
    -output "$SIM_OUTPUT"
else
  cp "$SIM_ARM_LIB" "$SIM_OUTPUT"
fi

cp "$DEVICE_LIB" "$DEVICE_OUTPUT"
cp "$HEADER_FILE" "$ARTIFACTS_DIR/expo_biovault_ffi.h"
