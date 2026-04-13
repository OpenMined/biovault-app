#!/bin/sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/android"
JNI_LIBS_DIR="$ANDROID_DIR/src/main/jniLibs"
CARGO_HOME_DIR="${CARGO_HOME:-/tmp/expo-bioscript-cargo}"
SDK_ROOT_DIR="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
APP_ANDROID_LOCAL_PROPERTIES="$ROOT_DIR/../../android/local.properties"
OUTPUT_LIBRARY_NAME="libbioscript_ffi.so"

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

if [ "$#" -eq 0 ]; then
  set -- arm64-v8a x86_64
fi

if [ -f "$HOME/.cargo/env" ]; then
  . "$HOME/.cargo/env"
fi

if [ -z "$SDK_ROOT_DIR" ] && [ -f "$APP_ANDROID_LOCAL_PROPERTIES" ]; then
  SDK_ROOT_DIR="$(sed -n 's/^sdk\.dir=//p' "$APP_ANDROID_LOCAL_PROPERTIES" | tail -n 1)"
fi

if [ -z "$SDK_ROOT_DIR" ] && [ -d "$HOME/Library/Android/sdk" ]; then
  SDK_ROOT_DIR="$HOME/Library/Android/sdk"
fi

if [ -z "$SDK_ROOT_DIR" ]; then
  echo "ANDROID_HOME or ANDROID_SDK_ROOT must be set"
  exit 1
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "cargo is not available in PATH"
  exit 1
fi

if ! command -v rustup >/dev/null 2>&1; then
  echo "rustup is not available in PATH"
  exit 1
fi

if ! command -v cargo-ndk >/dev/null 2>&1; then
  echo "cargo-ndk is required for Android builds"
  echo "Install it with: cargo install cargo-ndk"
  exit 1
fi

NDK_ARGS=""

for ABI in "$@"; do
  case "$ABI" in
    armeabi-v7a)
      RUST_TARGET="armv7-linux-androideabi"
      ;;
    arm64-v8a)
      RUST_TARGET="aarch64-linux-android"
      ;;
    x86)
      RUST_TARGET="i686-linux-android"
      ;;
    x86_64)
      RUST_TARGET="x86_64-linux-android"
      ;;
    *)
      echo "Unsupported Android ABI: $ABI"
      exit 1
      ;;
  esac

  if ! rustup target list --installed | grep -q "^$RUST_TARGET$"; then
    echo "Missing Rust target: $RUST_TARGET"
    echo "Install it with: rustup target add $RUST_TARGET"
    exit 1
  fi

  NDK_ARGS="$NDK_ARGS -t $ABI"
done

mkdir -p "$CARGO_HOME_DIR"
rm -rf "$JNI_LIBS_DIR"
mkdir -p "$JNI_LIBS_DIR"

cd "$RUST_WORKSPACE_DIR"
# shellcheck disable=SC2086
CARGO_HOME="$CARGO_HOME_DIR" cargo ndk $NDK_ARGS -o "$JNI_LIBS_DIR" build --manifest-path "$RUST_MANIFEST" --release

find "$JNI_LIBS_DIR" -type f ! -name "$OUTPUT_LIBRARY_NAME" -delete
find "$JNI_LIBS_DIR" -type d -empty -delete
