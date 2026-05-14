#!/usr/bin/env bash
set -euo pipefail

SITES="dev,prod"
MINUTES="43200"
EVENT_LIMIT="50000"
USE_CACHE=0

usage() {
  cat <<'EOF'
Usage: ./user-report.sh [--dev | --prod] [--minutes N] [--event-limit N] [--use-cache]

Defaults:
  sites:       dev and prod in one per-user HTML report
  minutes:     43200 (30 days)
  event limit: 50000 raw events per site

Examples:
  ./user-report.sh
  ./user-report.sh --prod
  ./user-report.sh --event-limit 25000
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dev)
      SITES="dev"
      shift
      ;;
    --prod)
      SITES="prod"
      shift
      ;;
    --minutes)
      MINUTES="${2:?--minutes requires a value}"
      shift 2
      ;;
    --event-limit)
      EVENT_LIMIT="${2:?--event-limit requires a value}"
      shift 2
      ;;
    --use-cache)
      USE_CACHE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="reports/rybbit-biovault-users-${STAMP}.html"

CMD=(
  node ./scripts/rybbit-user-report.mjs
  --sites "$SITES"
  --minutes "$MINUTES"
  --event-limit "$EVENT_LIMIT"
  --out "$OUT"
)

if [[ "$USE_CACHE" == "1" ]]; then
  CMD+=(--use-cache)
fi

"${CMD[@]}"

echo "User report written to $OUT"
