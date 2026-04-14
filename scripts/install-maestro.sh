#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/node_modules/.maestro"
BIN="$DIR/bin/maestro"

if [[ -x "$BIN" ]]; then
  echo "Maestro already installed at $BIN"
  exit 0
fi

VERSION="${MAESTRO_VERSION:-}"
if [[ -z "$VERSION" ]]; then
  VERSION="$(curl -fsSL https://api.github.com/repos/mobile-dev-inc/maestro/releases/latest \
    | grep '"tag_name"' | head -1 | cut -d '"' -f 4)"
fi
[[ -n "$VERSION" ]] || { echo "Could not resolve Maestro version" >&2; exit 1; }

URL="https://github.com/mobile-dev-inc/maestro/releases/download/${VERSION}/maestro.zip"
echo "Installing Maestro $VERSION from $URL"

mkdir -p "$DIR"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

curl -fsSL "$URL" -o "$TMP/maestro.zip"
unzip -q -o "$TMP/maestro.zip" -d "$TMP"

SRC="$(find "$TMP" -maxdepth 2 -type d -name maestro | head -1)"
[[ -n "$SRC" ]] || { echo "Unexpected archive layout" >&2; exit 1; }

rm -rf "$DIR"
mkdir -p "$DIR"
cp -R "$SRC/." "$DIR/"
chmod +x "$BIN"
echo "Maestro installed at $BIN"
