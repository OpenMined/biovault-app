#!/usr/bin/env bash
set -uo pipefail

# Opinionated linter. Auto-fixes by default.
# Usage:
#   ./lint.sh               # lint everything (Rust + TS), auto-fix
#   ./lint.sh --rust        # only Rust
#   ./lint.sh --ts          # only TypeScript
#   ./lint.sh --check       # do not modify files, report only
#   flags compose: ./lint.sh --rust --ts --check
#
# Note: there are no CSS files in this project. Styling is done via inline
# StyleSheet (mobile) and inline style={{}} objects (desktop), typechecked
# by --ts. If .css files are introduced later, add a --css step here.

DO_RUST=0
DO_TS=0
CHECK=0
EXPLICIT=0

for arg in "$@"; do
  case "$arg" in
    --rust)  DO_RUST=1; EXPLICIT=1 ;;
    --ts)    DO_TS=1;   EXPLICIT=1 ;;
    --check|--dry-run) CHECK=1 ;;
    -h|--help)
      cat <<EOF
Usage: $0 [--rust] [--ts] [--check]
  --rust     Lint Rust (cargo fmt + clippy). Default: auto-fix.
  --ts       Lint TypeScript (tsc typecheck + eslint --fix across root, desktop, packages).
  --check    Report only, do not modify files.
  (no flag)  Run all.
EOF
      exit 0 ;;
    *) echo "Unknown flag: $arg" >&2; exit 2 ;;
  esac
done

if [ "$EXPLICIT" = "0" ]; then
  DO_RUST=1; DO_TS=1
fi

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

FAIL=0
RESULTS=()
step() {
  local name="$1"; shift
  echo ""
  echo "━━━ $name ━━━"
  if "$@"; then
    RESULTS+=("✅ $name")
  else
    RESULTS+=("❌ $name")
    FAIL=1
  fi
}

# ──────────────────────────── Rust ────────────────────────────

# First-party Rust only. Vendored/submoduled crates are skipped:
#   - bioscript/monty      (upstream: pydantic/monty)
#   - bioscript/noodles    (upstream: zaeleus/noodles; referenced via [patch.crates-io])
#   - bioscript/rust/vendor (lexical-util and friends)
# clippy uses --no-deps so patched deps aren't linted, and cargo workspaces
# only cover explicit `members`, so vendor/ directories aren't touched.
RUST_WORKSPACES=(
  "bioscript/rust"
  "desktop/src-tauri"
)
CLIPPY_FLAGS=(-D warnings -A clippy::doc_overindented_list_items)

# Filter rustc warning blocks that originate in vendored paths. cargo clippy
# emits blocks separated by blank lines; awk treats each block as a record and
# drops the whole block if it references a vendored dep.
RUST_FILTER_PATHS='bioscript/(noodles|rust/vendor)/|`noodles-[a-z]+` \(lib\) generated'

filter_vendor_warnings() {
  awk -v pat="$RUST_FILTER_PATHS" '
    BEGIN { RS=""; ORS="\n\n" }
    $0 !~ pat { print }
  ' | sed -E \
    -e '/^Warning: can'\''t set `(imports_granularity|group_imports) = /d' \
    -e '/`noodles-[a-z]+` \(lib\) generated [0-9]+ warnings?/d'
}

rust_one() {
  local dir="$1"
  [ -d "$dir" ] || { echo "skip: $dir (missing)"; return 0; }
  # tauri::generate_context! fails at compile time if frontendDist
  # (desktop/dist) is missing. Lint doesn't need a real web bundle.
  if [ "$dir" = "desktop/src-tauri" ] && [ ! -d "desktop/dist" ]; then
    mkdir -p desktop/dist
    : > desktop/dist/index.html
  fi
  pushd "$dir" >/dev/null
  local rc=0
  if [ "$CHECK" = "1" ]; then
    { cargo fmt --all -- --check 2>&1 || rc=1; } | filter_vendor_warnings
    { cargo clippy --workspace --all-targets --all-features --no-deps -- "${CLIPPY_FLAGS[@]}" 2>&1 || rc=1; } | filter_vendor_warnings
  else
    cargo fmt --all 2>&1 | filter_vendor_warnings
    { cargo clippy --workspace --all-targets --all-features --fix --allow-dirty --allow-staged --no-deps -- "${CLIPPY_FLAGS[@]}" 2>&1 || rc=1; } | filter_vendor_warnings
  fi
  popd >/dev/null
  return $rc
}

rust_all() {
  local rc=0
  for ws in "${RUST_WORKSPACES[@]}"; do
    echo "• $ws"
    rust_one "$ws" || rc=1
  done
  return $rc
}

# ──────────────────────────── TypeScript ────────────────────────────

TS_PROJECTS=(
  "."
  "desktop"
  "packages/protocol"
  "packages/ui-core"
)

ts_typecheck() {
  local rc=0
  for p in "${TS_PROJECTS[@]}"; do
    [ -f "$p/tsconfig.json" ] || { echo "skip typecheck: $p (no tsconfig.json)"; continue; }
    echo "• tsc $p"
    (cd "$p" && npx --yes tsc --noEmit) || rc=1
  done
  return $rc
}

ts_eslint() {
  local rc=0
  echo "• eslint (root via expo lint)"
  if [ "$CHECK" = "1" ]; then
    npm run --silent lint || rc=1
  else
    npm run --silent lint -- --fix || rc=1
  fi
  for p in desktop packages/protocol packages/ui-core; do
    if [ -f "$p/.eslintrc" ] || [ -f "$p/.eslintrc.js" ] || [ -f "$p/eslint.config.js" ]; then
      echo "• eslint $p"
      local fix_flag="--fix"; [ "$CHECK" = "1" ] && fix_flag=""
      (cd "$p" && npx --yes eslint . $fix_flag) || rc=1
    fi
  done
  return $rc
}

ts_all() {
  local rc=0
  ts_typecheck || rc=1
  ts_eslint || rc=1
  return $rc
}

# ──────────────────────────── Run ────────────────────────────

[ "$DO_RUST" = "1" ] && step "Rust"       rust_all
[ "$DO_TS" = "1" ]   && step "TypeScript" ts_all

echo ""
echo "━━━ Summary ━━━"
for r in "${RESULTS[@]}"; do echo "$r"; done
exit $FAIL
