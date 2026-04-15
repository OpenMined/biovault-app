#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

export BIOSCRIPT_TEST_DATA_REPO_ROOT="${REPO_ROOT}"
exec "${REPO_ROOT}/bioscript/tools/fetch_test_data.sh" "$@"
