#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TAURI_TARGET_ROOT="${TAURI_TARGET_ROOT:-$ROOT_DIR/desktop/src-tauri/target}"
INPUT_PATH="${1:-}"
MOUNT_DIR=""

cleanup() {
  if [[ -n "$MOUNT_DIR" && -d "$MOUNT_DIR" ]]; then
    hdiutil detach "$MOUNT_DIR" -quiet || true
    rmdir "$MOUNT_DIR" 2>/dev/null || true
  fi
}
trap cleanup EXIT

latest_matching() {
  local pattern="$1"
  find "$TAURI_TARGET_ROOT" -path "$pattern" -print 2>/dev/null | sort | tail -n 1
}

if [[ -z "$INPUT_PATH" ]]; then
  INPUT_PATH="$(latest_matching "*/release/bundle/dmg/*.dmg")"
  if [[ -z "$INPUT_PATH" ]]; then
    INPUT_PATH="$(latest_matching "*/release/bundle/macos/*.app")"
  fi
fi

if [[ -z "$INPUT_PATH" ]]; then
  echo "No DMG or app bundle found under $TAURI_TARGET_ROOT." >&2
  exit 1
fi

if [[ ! -e "$INPUT_PATH" ]]; then
  echo "Path does not exist: $INPUT_PATH" >&2
  exit 1
fi

APP_PATH="$INPUT_PATH"
if [[ "$INPUT_PATH" == *.dmg ]]; then
  MOUNT_DIR="$(mktemp -d /tmp/biovault-app-dmg.XXXXXX)"
  hdiutil attach "$INPUT_PATH" -mountpoint "$MOUNT_DIR" -nobrowse -quiet
  APP_PATH="$(find "$MOUNT_DIR" -maxdepth 2 -name "*.app" -type d -print | sort | head -n 1)"
  if [[ -z "$APP_PATH" ]]; then
    echo "No .app bundle found inside $INPUT_PATH." >&2
    exit 1
  fi
fi

echo "Checking app bundle: $APP_PATH"

echo
echo "Quarantine/provenance attributes:"
if xattr -lr "$APP_PATH" 2>/dev/null | grep -E "com.apple.(quarantine|provenance)" >/tmp/biovault-gatekeeper-xattrs.txt; then
  cat /tmp/biovault-gatekeeper-xattrs.txt
  echo "Unexpected quarantine/provenance attributes found." >&2
  exit 1
else
  echo "OK: no quarantine/provenance attributes found."
fi

echo
echo "Executable signing checks:"
while IFS= read -r -d '' file; do
  if [[ -f "$file" ]]; then
    codesign --verify --verbose=1 "$file" >/dev/null
  fi
done < <(find "$APP_PATH/Contents" -type f \( -perm -111 -o -name "*.dylib" -o -name "*.so" \) -print0 2>/dev/null)
echo "OK: executable files verify with codesign."

echo
echo "App signature:"
codesign --verify --deep --strict --verbose=2 "$APP_PATH"

echo
echo "Gatekeeper assessment:"
spctl --assess --type exec --verbose "$APP_PATH"

if [[ "$INPUT_PATH" == *.dmg ]]; then
  echo
  echo "DMG signature:"
  codesign --verify --verbose=2 "$INPUT_PATH" || true

  echo
  echo "DMG Gatekeeper assessment:"
  spctl --assess --type open --context context:primary-signature --verbose "$INPUT_PATH"
fi

echo
echo "Gatekeeper check passed."
