#!/usr/bin/env bash
set -euo pipefail

if command -v trufflehog >/dev/null 2>&1; then
	exec trufflehog git file://. --exclude-paths=.trufflehog-exclude --results=verified,unknown --fail
fi

if command -v docker >/dev/null 2>&1; then
	exec docker run --rm -v "$PWD:/repo" -w /repo ghcr.io/trufflesecurity/trufflehog:latest \
		filesystem /repo --exclude-paths=/repo/.trufflehog-exclude --results=verified,unknown \
		--force-skip-binaries --force-skip-archives --fail --no-update
fi

echo "trufflehog or docker is required to scan for secrets." >&2
echo "Install trufflehog, or start Docker and retry." >&2
exit 127
