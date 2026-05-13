#!/usr/bin/env bash
set -euo pipefail

SITES="dev prod"
MINUTES="43200"
EVENT_LIMIT="0"
USE_CACHE=0
METRICS="browser,device_type,country,referrer,operating_system"

usage() {
  cat <<'EOF'
Usage: ./report.sh [--dev | --prod] [--minutes N] [--event-limit N] [--metrics LIST|none] [--use-cache]

Defaults:
  sites:       dev and prod, written to separate HTML files
  minutes:     43200 (30 days)
  event limit: 0 (aggregate report; avoids expensive raw-event calls)
  metrics:     browser,device_type,country,referrer,operating_system

Examples:
  ./report.sh
  ./report.sh --dev
  ./report.sh --prod
  ./report.sh --event-limit 1000
  ./report.sh --metrics none
  ./report.sh --metrics country,referrer
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
    --metrics)
      METRICS="${2:?--metrics requires a value}"
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

for SITE in $SITES; do
  OUT="reports/rybbit-biovault-${SITE}-${STAMP}.html"

  CMD=(
    npm run rybbit:report --
    --sites "$SITE"
    --minutes "$MINUTES"
    --event-limit "$EVENT_LIMIT"
    --metrics "$METRICS"
  )

  if [[ "$USE_CACHE" == "1" ]]; then
    CMD+=(--use-cache)
  fi

  CMD+=(--out "$OUT")

  "${CMD[@]}"

  echo "Report written to $OUT"
done
