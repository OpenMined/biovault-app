#!/usr/bin/env bash
set -euo pipefail

# Scenario-focused web tests. Pass --interactive or --headed to watch Chromium.
exec ./test-web.sh --scenario "$@"
