#!/usr/bin/env bash
set -euo pipefail

# CI uses Repoverse instead of hand-initializing a small subset of submodules.
# This follows .repoverse.yaml, clones every mapped checkout under repos/, and
# recreates the shared symlink overlay used by local development.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ensure_rv() {
  if command -v rv >/dev/null 2>&1; then
    rv --version
    return
  fi

  if ! command -v cargo >/dev/null 2>&1; then
    echo "rv is not installed and cargo is unavailable; install Rust or preinstall repoverse" >&2
    exit 1
  fi

  echo "==> Installing Repoverse from crates.io"
  cargo install repoverse
}

ensure_rv

echo "==> Initializing Repoverse workspace"
rv init --https

echo "==> Linking Repoverse workspace"
rv link

echo "==> Repoverse status"
rv status
