#!/usr/bin/env bash
set -euo pipefail

# Local cross-browser WASM compatibility run.
# Wraps setup + ./test-web-compat.sh so a fresh checkout is one command:
#
#   ./web-compat.sh                 # auto-detect launchable engines, run those
#   ./web-compat.sh chromium        # single project, fastest iteration
#   ./web-compat.sh --strict        # FAIL if any expected engine can't launch
#   WEB_COMPAT_SKIP_SETUP=1 ./web-compat.sh   # skip deps/browser/fixture setup
#
# By default, engines that cannot launch on this host (e.g. WebKit on Arch,
# which Playwright does not officially support) are probed and skipped with a
# warning so the run still produces results for the engines that work. Pass
# --strict to instead fail fast when any requested engine cannot launch.
#
# Extra args are forwarded to ./test-web-compat.sh. Results are written to
# test-output/browser-compat/{results.json,results.md}.

cd "$(dirname "$0")"

# Do not run under sudo: root loses the user's Node/npx (nvm/asdf/etc.) PATH.
if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
  echo "Run this WITHOUT sudo (root can't see your node/npx)." >&2
  exit 1
fi

STRICT=0
PROJECTS="${PW_BROWSER_PROJECTS:-chromium,firefox,webkit,mobile-chromium,mobile-firefox,mobile-webkit}"
FORWARD=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --strict) STRICT=1; shift ;;
    --) shift; FORWARD+=("$@"); break ;;
    -*) FORWARD+=("$1"); shift ;;
    *) PROJECTS="$1"; shift ;;  # positional project list scopes the run
  esac
done

if [[ "${WEB_COMPAT_SKIP_SETUP:-0}" != "1" ]]; then
  if [[ ! -d node_modules ]]; then
    echo "==> npm install"
    npm install
  fi

  # Note: no --with-deps. That flag shells out to apt-get (Debian/Ubuntu CI
  # only) and fails on Arch/other distros. Install system libs via your
  # package manager if Playwright reports missing shared libraries.
  echo "==> playwright install (chromium firefox webkit)"
  npx playwright install chromium firefox webkit

  if [[ ! -f test-data/23andme/v5/hu50B3F5/genome_hu50B3F5_v5_Full.zip ]]; then
    echo "==> fetch web genomic test fixtures"
    uv run --with pyyaml ./tools/fetch_test_data.sh --web-pgx-public
  fi
fi

# Map a Playwright project to the engine it drives.
engine_of() {
  case "$1" in
    chromium|mobile-chromium) echo chromium ;;
    firefox|mobile-firefox)   echo firefox ;;
    webkit|mobile-webkit)     echo webkit ;;
    *)                        echo "$1" ;;
  esac
}

# Probe whether an engine can actually launch on this host.
can_launch() {
  timeout 60 node -e "require('playwright')['$1'].launch().then(b=>b.close()).then(()=>process.exit(0)).catch(()=>process.exit(1))" >/dev/null 2>&1
}

echo "==> probing engines for: $PROJECTS"
# Bash 3.2 (macOS system bash) has no associative arrays; memoize engine
# launch results in a newline-delimited "engine=status" string instead.
ENGINE_OK=""
engine_status() {
  local line status
  line="$(printf '%s\n' "$ENGINE_OK" | grep "^$1=" | head -n1)"
  if [[ -n "$line" ]]; then
    echo "${line#*=}"
    return
  fi
  if can_launch "$1"; then status=ok; else status=fail; fi
  ENGINE_OK="${ENGINE_OK}
$1=$status"
  echo "$status"
}

RUN_PROJECTS=()
SKIPPED=()
IFS=',' read -ra PROJ_LIST <<< "$PROJECTS"
for proj in "${PROJ_LIST[@]}"; do
  proj="${proj// /}"
  [[ -z "$proj" ]] && continue
  eng="$(engine_of "$proj")"
  if [[ "$(engine_status "$eng")" == "ok" ]]; then
    RUN_PROJECTS+=("$proj")
  else
    SKIPPED+=("$proj")
  fi
done

if [[ ${#SKIPPED[@]} -gt 0 ]]; then
  printf 'Engine cannot launch on this host: %s\n' "${SKIPPED[*]}" >&2
  if [[ "$STRICT" -eq 1 ]]; then
    echo "--strict: failing because not every requested engine can launch." >&2
    exit 1
  fi
  echo "Skipping unlaunchable projects (run with --strict to fail instead)." >&2
fi

if [[ ${#RUN_PROJECTS[@]} -eq 0 ]]; then
  echo "No launchable browser projects on this host." >&2
  exit 1
fi

joined="$(IFS=,; echo "${RUN_PROJECTS[*]}")"
echo "==> running browser compatibility smoke: $joined"
PW_BROWSER_PROJECTS="$joined" ./test-web-compat.sh ${FORWARD[@]+"${FORWARD[@]}"}

echo
echo "Results: test-output/browser-compat/results.md"
