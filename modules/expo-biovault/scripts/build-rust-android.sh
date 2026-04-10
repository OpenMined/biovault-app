#!/bin/sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUST_DIR="$ROOT_DIR/rust"
ANDROID_DIR="$ROOT_DIR/android"
JNI_LIBS_DIR="$ANDROID_DIR/src/main/jniLibs"
CARGO_HOME_DIR="${CARGO_HOME:-/tmp/expo-biovault-cargo}"
SDK_ROOT_DIR="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
APP_ANDROID_LOCAL_PROPERTIES="$ROOT_DIR/../../android/local.properties"

if [ "$#" -eq 0 ]; then
  set -- arm64-v8a armeabi-v7a x86 x86_64
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

  echo "Building $ABI ($RUST_TARGET)"
  NDK_ARGS="$NDK_ARGS -t $ABI"
done

mkdir -p "$CARGO_HOME_DIR" "$JNI_LIBS_DIR"
rm -f \
  "$JNI_LIBS_DIR/arm64-v8a/libbiovault_rust_lib.so" \
  "$JNI_LIBS_DIR/armeabi-v7a/libbiovault_rust_lib.so" \
  "$JNI_LIBS_DIR/x86/libbiovault_rust_lib.so" \
  "$JNI_LIBS_DIR/x86_64/libbiovault_rust_lib.so"

cd "$RUST_DIR"
# shellcheck disable=SC2086
CARGO_HOME="$CARGO_HOME_DIR" cargo ndk $NDK_ARGS --platform 31 -o "$JNI_LIBS_DIR" build --manifest-path Cargo.toml --release
