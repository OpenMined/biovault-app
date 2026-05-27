#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$ROOT_DIR/desktop"
TAURI_DIR="$DESKTOP_DIR/src-tauri"

cd "$ROOT_DIR"

if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

if [[ "${1:-}" == "--clean" ]]; then
  echo "Cleaning desktop Tauri build output..."
  cargo clean --manifest-path "$TAURI_DIR/Cargo.toml"
  rm -rf "$TAURI_DIR/target/release/bundle" "$TAURI_DIR/target"/*/release/bundle 2>/dev/null || true
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "build-signed.sh currently supports signed/notarized DMG builds on macOS only." >&2
  exit 1
fi

if [[ -z "${APPLE_ID:-}" || -z "${APPLE_PASSWORD:-}" || -z "${APPLE_TEAM_ID:-}" ]]; then
  echo "Missing Apple notarization env: APPLE_ID, APPLE_PASSWORD, and APPLE_TEAM_ID are required." >&2
  exit 1
fi

if [[ -z "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  if [[ -n "${SIGNING_CERTIFICATE_P12_DATA:-}" && -n "${SIGNING_CERTIFICATE_PASSWORD:-}" ]]; then
    KEYCHAIN_PATH="${RUNNER_TEMP:-$ROOT_DIR/.tmp}/biovault-signing.keychain-db"
    KEYCHAIN_PASSWORD="${KEYCHAIN_PASSWORD:-$(uuidgen)}"
    CERT_PATH="${RUNNER_TEMP:-$ROOT_DIR/.tmp}/biovault-signing.p12"
    mkdir -p "$(dirname "$CERT_PATH")"

    echo "$SIGNING_CERTIFICATE_P12_DATA" | base64 --decode > "$CERT_PATH"
    security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
    security set-keychain-settings -lut 21600 "$KEYCHAIN_PATH"
    security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
    security import "$CERT_PATH" -P "$SIGNING_CERTIFICATE_PASSWORD" -A -t cert -f pkcs12 -k "$KEYCHAIN_PATH"
    security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
    security list-keychains -d user -s "$KEYCHAIN_PATH" $(security list-keychains -d user | tr -d '"')
  fi

  APPLE_SIGNING_IDENTITY="$(
    security find-identity -v -p codesigning 2>/dev/null \
      | sed -n 's/.*"\(Developer ID Application:.*\)"/\1/p' \
      | head -n 1
  )"
  export APPLE_SIGNING_IDENTITY
fi

if [[ -z "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  echo "Missing APPLE_SIGNING_IDENTITY and no Developer ID Application certificate was found." >&2
  exit 1
fi

echo "Using signing identity: $APPLE_SIGNING_IDENTITY"

if ! security find-certificate -c "$APPLE_SIGNING_IDENTITY" -p | openssl x509 -noout -checkend $((60 * 60 * 24 * 30)); then
  echo "Signing certificate is expired or expires within 30 days: $APPLE_SIGNING_IDENTITY" >&2
  security find-certificate -c "$APPLE_SIGNING_IDENTITY" -p | openssl x509 -noout -dates -subject || true
  exit 1
fi

if [[ ! -d "$DESKTOP_DIR/node_modules" ]]; then
  (cd "$DESKTOP_DIR" && npm install)
fi

BUILD_ARGS=(build)
if [[ -n "${TAURI_TARGET:-}" ]]; then
  BUILD_ARGS+=(--target "$TAURI_TARGET")
fi

if ! (cd "$DESKTOP_DIR" && npm run tauri -- "${BUILD_ARGS[@]}"); then
  echo "Tauri packaging failed; attempting signed simple DMG fallback from the built .app..."
  "$ROOT_DIR/scripts/create-desktop-dmg.sh" --sign "$APPLE_SIGNING_IDENTITY" --notarize
fi

find "$TAURI_DIR/target" -type f \( -name "*.dmg" -o -name "*.app.tar.gz" -o -name "*.sig" \) -print0 2>/dev/null \
  | xargs -0 -I{} xattr -c "{}" 2>/dev/null || true

echo
echo "Built desktop artifacts:"
find "$TAURI_DIR/target" -path "*/release/bundle/*" -type f \( -name "*.dmg" -o -name "*.app.tar.gz" -o -name "*.sig" \) -print 2>/dev/null | sort
echo
echo "Gatekeeper check:"
echo "  ./check-gatekeeper.sh ./desktop/src-tauri/target/release/bundle/dmg/*.dmg"
