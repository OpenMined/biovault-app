#!/usr/bin/env bash
set -euo pipefail

SITES="dev prod"
MINUTES="43200"
EVENT_LIMIT="0"
USER_EVENT_LIMIT="50000"
USE_CACHE=0
METRICS="browser,device_type,country,referrer,operating_system"

usage() {
  cat <<'EOF'
Usage: ./report.sh [--dev | --prod] [--minutes N] [--event-limit N] [--user-event-limit N] [--metrics LIST|none] [--use-cache]

Defaults:
  sites:            dev and prod
  minutes:          43200 (30 days)
  aggregate events: 0 (aggregate report; avoids expensive raw-event calls)
  user events:      50000 raw events per site
  metrics:          browser,device_type,country,referrer,operating_system

Outputs:
  aggregate reports: separate dev/prod HTML files
  user report:       one combined per-user HTML file for selected sites

Examples:
  ./report.sh
  ./report.sh --dev
  ./report.sh --prod
  ./report.sh --event-limit 1000
  ./report.sh --user-event-limit 25000
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
    --user-event-limit)
      USER_EVENT_LIMIT="${2:?--user-event-limit requires a value}"
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
WRITTEN=()

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
  WRITTEN+=("$OUT")
done

USER_OUT="reports/rybbit-biovault-users-${STAMP}.html"
USER_SITES="${SITES// /,}"

USER_CMD=(
  node ./scripts/rybbit-user-report.mjs
  --sites "$USER_SITES"
  --minutes "$MINUTES"
  --event-limit "$USER_EVENT_LIMIT"
  --out "$USER_OUT"
)

if [[ "$USE_CACHE" == "1" ]]; then
  USER_CMD+=(--use-cache)
fi

"${USER_CMD[@]}"

echo "User report written to $USER_OUT"
WRITTEN+=("$USER_OUT")

echo
echo "Reports written:"
printf '  %s\n' "${WRITTEN[@]}"
