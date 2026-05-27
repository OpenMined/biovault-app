#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TAURI_DIR="$ROOT_DIR/desktop/src-tauri"
TAURI_CONF="$TAURI_DIR/tauri.conf.json"
TARGET_ROOT="$TAURI_DIR/target"
SIGN_IDENTITY=""
NOTARIZE=0
APP_PATH=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app)
      APP_PATH="$2"
      shift 2
      ;;
    --sign)
      SIGN_IDENTITY="$2"
      shift 2
      ;;
    --notarize)
      NOTARIZE=1
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "DMG creation is only supported on macOS." >&2
  exit 1
fi

if [[ -z "$APP_PATH" ]]; then
  APP_PATH="$(find "$TARGET_ROOT" -path "*/release/bundle/macos/*.app" -type d -print 2>/dev/null | sort | tail -n 1)"
fi

if [[ -z "$APP_PATH" || ! -d "$APP_PATH" ]]; then
  echo "No .app bundle found under $TARGET_ROOT." >&2
  exit 1
fi

PRODUCT_NAME="$(
  node -e "const fs=require('fs'); const c=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); console.log(c.productName || 'BioVaultApp')" "$TAURI_CONF"
)"
VERSION="$(
  node -e "const fs=require('fs'); const c=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); console.log(c.version || '0.0.0')" "$TAURI_CONF"
)"

if [[ -n "${TAURI_TARGET:-}" ]]; then
  case "$TAURI_TARGET" in
    aarch64-apple-darwin) ARCH="aarch64" ;;
    x86_64-apple-darwin) ARCH="x64" ;;
    *) ARCH="$(uname -m)" ;;
  esac
else
  ARCH="$(uname -m)"
fi

APP_PARENT="$(dirname "$APP_PATH")"
DMG_DIR="$(dirname "$APP_PARENT")/dmg"
DMG_PATH="$DMG_DIR/${PRODUCT_NAME}_${VERSION}_${ARCH}.dmg"
STAGING_DIR="$(mktemp -d /tmp/biovault-dmg-stage.XXXXXX)"

cleanup() {
  rm -rf "$STAGING_DIR"
}
trap cleanup EXIT

mkdir -p "$DMG_DIR"
cp -R "$APP_PATH" "$STAGING_DIR/"
ln -s /Applications "$STAGING_DIR/Applications"

if [[ -n "$SIGN_IDENTITY" ]]; then
  codesign --force --deep --options runtime --timestamp --entitlements "$TAURI_DIR/Entitlements.plist" --sign "$SIGN_IDENTITY" "$STAGING_DIR/$(basename "$APP_PATH")"
fi

rm -f "$DMG_PATH"
hdiutil create -volname "$PRODUCT_NAME" -srcfolder "$STAGING_DIR" -ov -format UDZO "$DMG_PATH"

if [[ -n "$SIGN_IDENTITY" ]]; then
  codesign --force --timestamp --sign "$SIGN_IDENTITY" "$DMG_PATH"
fi

if [[ "$NOTARIZE" -eq 1 ]]; then
  xcrun notarytool submit "$DMG_PATH" \
    --apple-id "$APPLE_ID" \
    --password "$APPLE_PASSWORD" \
    --team-id "$APPLE_TEAM_ID" \
    --wait
  xcrun stapler staple "$DMG_PATH"
fi

echo "$DMG_PATH"
