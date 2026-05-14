#!/usr/bin/env bash
set -euo pipefail

WEB_SECURE_ORIGIN=1 \
PW_IGNORE_HTTPS_ERRORS=1 \
./test-web.sh "$@"
