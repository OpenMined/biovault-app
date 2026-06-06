#!/usr/bin/env bash
set -euo pipefail

SITES="dev prod"
MINUTES="5256000"
ROLLING_DAYS="30"
SINCE_DATE="2026-05-01"
USER_EVENT_LIMIT="50000"
USE_CACHE=0
COMBINED=0

usage() {
  cat <<'EOF'
Usage: ./report.sh [--dev | --prod] [--minutes N] [--since-date YYYY-MM-DD] [--rolling-days N] [--event-limit N] [--user-event-limit N] [--use-cache] [--combined]

Defaults:
  sites:            dev and prod
  minutes:          5256000 (10 years / effectively all-time for current BioVault metrics)
  since date:       2026-05-01
  rolling days:     30
  events:           50000 raw events per site

Outputs:
  separate dev and prod HTML reports with overview, users, calendar-month tabs, rolling month stats, daily rollup, and breakdown tabs

Examples:
  ./report.sh
  ./report.sh --dev
  ./report.sh --prod
  ./report.sh --combined
  ./report.sh --minutes 43200
  ./report.sh --since-date 2026-05-01
  ./report.sh --rolling-days 31
  ./report.sh --event-limit 1000
  ./report.sh --user-event-limit 25000
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
    --since-date)
      SINCE_DATE="${2:?--since-date requires a value}"
      shift 2
      ;;
    --rolling-days)
      ROLLING_DAYS="${2:?--rolling-days requires a value}"
      shift 2
      ;;
    --event-limit)
      USER_EVENT_LIMIT="${2:?--event-limit requires a value}"
      shift 2
      ;;
    --user-event-limit)
      USER_EVENT_LIMIT="${2:?--user-event-limit requires a value}"
      shift 2
      ;;
    --use-cache)
      USE_CACHE=1
      shift
      ;;
    --combined)
      COMBINED=1
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
OUTPUTS=()

run_user_report() {
  local sites="$1"
  local out="$2"
  local user_sites="${sites// /,}"
  local user_cmd=(
    node ./scripts/rybbit-user-report.mjs
    --sites "$user_sites"
    --minutes "$MINUTES"
    --since-date "$SINCE_DATE"
    --rolling-days "$ROLLING_DAYS"
    --event-limit "$USER_EVENT_LIMIT"
    --out "$out"
  )

  if [[ "$USE_CACHE" == "1" ]]; then
    user_cmd+=(--use-cache)
  fi

  "${user_cmd[@]}"
  OUTPUTS+=("$out")
  echo "User report written to $out"
}

if [[ "$COMBINED" == "1" ]]; then
  run_user_report "$SITES" "reports/rybbit-biovault-${STAMP}.html"
else
  for SITE in $SITES; do
    run_user_report "$SITE" "reports/rybbit-biovault-${SITE}-${STAMP}.html"
  done
fi

echo
if [[ "${#OUTPUTS[@]}" == "1" ]]; then
  echo "Report written:"
else
  echo "Reports written:"
fi
printf '  %s\n' "${OUTPUTS[@]}"
