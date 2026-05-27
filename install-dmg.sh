#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TAURI_CONF="$ROOT_DIR/desktop/src-tauri/tauri.conf.json"
TAURI_TARGET_ROOT="${TAURI_TARGET_ROOT:-$ROOT_DIR/desktop/src-tauri/target}"
DMG_PATH="${1:-}"
MOUNT_DIR=""

cleanup() {
  if [[ -n "$MOUNT_DIR" && -d "$MOUNT_DIR" ]]; then
    hdiutil detach "$MOUNT_DIR" -quiet || true
    rmdir "$MOUNT_DIR" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "install-dmg.sh only works on macOS." >&2
  exit 1
fi

if [[ -z "$DMG_PATH" ]]; then
  DMG_PATH="$(find "$TAURI_TARGET_ROOT" -path "*/release/bundle/dmg/*.dmg" -print 2>/dev/null | sort | tail -n 1)"
fi

if [[ -z "$DMG_PATH" || ! -f "$DMG_PATH" ]]; then
  echo "No DMG found. Build one first with ./build.sh or ./build-signed.sh." >&2
  exit 1
fi

PRODUCT_NAME="$(
  node -e "const fs=require('fs'); const c=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); console.log(c.productName || 'BioVaultApp')" "$TAURI_CONF"
)"

MOUNT_DIR="$(mktemp -d /tmp/biovault-app-install.XXXXXX)"
hdiutil attach "$DMG_PATH" -mountpoint "$MOUNT_DIR" -nobrowse -quiet

APP_SOURCE="$(find "$MOUNT_DIR" -maxdepth 2 -name "*.app" -type d -print | sort | head -n 1)"
if [[ -z "$APP_SOURCE" ]]; then
  echo "No .app bundle found inside $DMG_PATH." >&2
  exit 1
fi

APP_NAME="$(basename "$APP_SOURCE")"
APP_DEST="/Applications/$APP_NAME"

echo "Installing $APP_NAME from $DMG_PATH..."
if [[ -d "$APP_DEST" ]]; then
  rm -rf "$APP_DEST"
fi
cp -R "$APP_SOURCE" /Applications/
xattr -rc "$APP_DEST" 2>/dev/null || true

echo "Installed $PRODUCT_NAME to $APP_DEST"
