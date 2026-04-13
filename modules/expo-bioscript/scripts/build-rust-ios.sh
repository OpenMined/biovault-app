#!/bin/sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
IOS_DIR="$ROOT_DIR/ios"
CARGO_HOME_DIR="${CARGO_HOME:-/tmp/expo-bioscript-cargo}"
ARTIFACTS_DIR="$IOS_DIR/Artifacts"
HEADERS_DIR="$ARTIFACTS_DIR/include"
XCFRAMEWORK_NAME="BioscriptFFI.xcframework"
XCFRAMEWORK_PATH="$ARTIFACTS_DIR/$XCFRAMEWORK_NAME"
DEVICE_TARGET="aarch64-apple-ios"
SIM_TARGET="aarch64-apple-ios-sim"
IOS_DEPLOYMENT_TARGET="${IPHONEOS_DEPLOYMENT_TARGET:-15.1}"

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

if ! command -v xcrun >/dev/null 2>&1; then
  echo "xcrun is required for iOS builds"
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

IOS_SDKROOT="$(xcrun --sdk iphoneos --show-sdk-path)"
SIM_SDKROOT="$(xcrun --sdk iphonesimulator --show-sdk-path)"
IOS_CC="$(xcrun --sdk iphoneos --find clang)"
SIM_CC="$(xcrun --sdk iphonesimulator --find clang)"
IOS_CXX="$(xcrun --sdk iphoneos --find clang++)"
SIM_CXX="$(xcrun --sdk iphonesimulator --find clang++)"
REAL_IOS_AR="$(xcrun --sdk iphoneos --find ar)"
REAL_SIM_AR="$(xcrun --sdk iphonesimulator --find ar)"
IOS_AR="$ROOT_DIR/scripts/apple-ar-wrapper.sh"
SIM_AR="$ROOT_DIR/scripts/apple-ar-wrapper.sh"
IOS_RANLIB="$(xcrun --sdk iphoneos --find ranlib)"
SIM_RANLIB="$(xcrun --sdk iphonesimulator --find ranlib)"

mkdir -p "$CARGO_HOME_DIR"

build_target() {
  TARGET="$1"
  SDKROOT="$2"
  CC="$3"
  CXX="$4"
  AR="$5"
  RANLIB="$6"

  export SDKROOT
  export IPHONEOS_DEPLOYMENT_TARGET="$IOS_DEPLOYMENT_TARGET"

  case "$TARGET" in
    aarch64-apple-ios)
      MIN_FLAG="-miphoneos-version-min=${IOS_DEPLOYMENT_TARGET}"
      CLANG_TARGET="arm64-apple-ios${IOS_DEPLOYMENT_TARGET}"
      export CC_aarch64_apple_ios="$CC"
      export CXX_aarch64_apple_ios="$CXX"
      export AR_aarch64_apple_ios="$AR"
      export RANLIB_aarch64_apple_ios="$RANLIB"
      export CARGO_TARGET_AARCH64_APPLE_IOS_LINKER="$CC"
      export EXPO_BIOSCRIPT_REAL_AR="$REAL_IOS_AR"
      export CARGO_TARGET_AARCH64_APPLE_IOS_RUSTFLAGS="-C link-arg=${MIN_FLAG}"
      ;;
    aarch64-apple-ios-sim)
      MIN_FLAG="-mios-simulator-version-min=${IOS_DEPLOYMENT_TARGET}"
      CLANG_TARGET="arm64-apple-ios${IOS_DEPLOYMENT_TARGET}-simulator"
      export CC_aarch64_apple_ios_sim="$CC"
      export CXX_aarch64_apple_ios_sim="$CXX"
      export AR_aarch64_apple_ios_sim="$AR"
      export RANLIB_aarch64_apple_ios_sim="$RANLIB"
      export CARGO_TARGET_AARCH64_APPLE_IOS_SIM_LINKER="$CC"
      export EXPO_BIOSCRIPT_REAL_AR="$REAL_SIM_AR"
      export CARGO_TARGET_AARCH64_APPLE_IOS_SIM_RUSTFLAGS="-C link-arg=${MIN_FLAG}"
      ;;
  esac

  export BINDGEN_EXTRA_CLANG_ARGS="--sysroot ${SDKROOT} --target=${CLANG_TARGET} ${MIN_FLAG}"
  export CFLAGS="-isysroot ${SDKROOT} --target=${CLANG_TARGET} ${MIN_FLAG}"
  export CXXFLAGS="$CFLAGS"
  export LDFLAGS="-isysroot ${SDKROOT} --target=${CLANG_TARGET} ${MIN_FLAG}"

  CARGO_HOME="$CARGO_HOME_DIR" cargo build --manifest-path "$RUST_MANIFEST" --target "$TARGET" --release
}

write_headers() {
  mkdir -p "$HEADERS_DIR"

  cat > "$HEADERS_DIR/bioscript_ffi.h" <<'HEADER'
#pragma once

char *bioscript_run_file_json(const char *request_json);
void bioscript_free_string(char *ptr);
HEADER

  cat > "$HEADERS_DIR/module.modulemap" <<'MODULEMAP'
module BioscriptFFI {
  header "bioscript_ffi.h"
  export *
}
MODULEMAP
}

cd "$RUST_WORKSPACE_DIR"
build_target "$DEVICE_TARGET" "$IOS_SDKROOT" "$IOS_CC" "$IOS_CXX" "$IOS_AR" "$IOS_RANLIB"
build_target "$SIM_TARGET" "$SIM_SDKROOT" "$SIM_CC" "$SIM_CXX" "$SIM_AR" "$SIM_RANLIB"

DEVICE_LIB="$RUST_WORKSPACE_DIR/target/$DEVICE_TARGET/release/libbioscript_ffi.a"
SIM_LIB="$RUST_WORKSPACE_DIR/target/$SIM_TARGET/release/libbioscript_ffi.a"

if [ ! -f "$DEVICE_LIB" ] || [ ! -f "$SIM_LIB" ]; then
  echo "Missing Rust build artifacts for Bioscript iOS packaging"
  exit 1
fi

mkdir -p "$ARTIFACTS_DIR"
rm -rf "$XCFRAMEWORK_PATH"
rm -f "$ARTIFACTS_DIR/libbioscript_ios.a" "$ARTIFACTS_DIR/libbioscript_sim.a"
write_headers

xcodebuild -create-xcframework \
  -library "$DEVICE_LIB" -headers "$HEADERS_DIR" \
  -library "$SIM_LIB" -headers "$HEADERS_DIR" \
  -output "$XCFRAMEWORK_PATH"
