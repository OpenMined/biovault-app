#!/bin/sh
set -eu

REAL_AR="${EXPO_BIOSCRIPT_REAL_AR:-$(xcrun --find ar)}"

sanitize_arg() {
  arg="$1"
  case "$arg" in
    *D*)
      cleaned="$(printf %s "$arg" | tr -d 'D')"
      if [ -n "$cleaned" ]; then
        printf '%s' "$cleaned"
      fi
      ;;
    *)
      printf '%s' "$arg"
      ;;
  esac
}

set -- "$(sanitize_arg "$1")" "${@:2}"
if [ -z "$1" ]; then
  shift
fi
exec "$REAL_AR" "$@"
