#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

MODE=""
INPUT_KIND=""
CASE_FILTER="${VNTYPER_CASE:-positive}"
WEB_ARGS=()
OUT_DIR="${VNTYPER_WEB_E2E_OUT:-/tmp/vntyper-web-e2e-$(date +%Y%m%d-%H%M%S)}"
PACKAGE_DIR="$ROOT/bioscript/bioscripts/examples/vntyper"
PACKAGE_ZIP="${VNTYPER_PACKAGE_ZIP:-$OUT_DIR/vntyper_muc1.zip}"
VNTYPER_HG19_REFERENCE="${VNTYPER_HG19_REFERENCE:-$ROOT/repos/vntyper/reference/muc1_region_hg19.fa}"

usage() {
  cat <<EOF
Usage:
  ./test-vntyper.sh --web --bam  --case positive
  ./test-vntyper.sh --web --cram --case positive
  ./test-vntyper.sh --web --bam  --case positive --headed
  ./test-vntyper.sh --cli --bam  --case positive
  ./test-vntyper.sh --cli --cram --case positive

Environment fixture overrides:
  VNTYPER_BAM, VNTYPER_BAI
  VNTYPER_CRAM, VNTYPER_CRAI, VNTYPER_FASTA, VNTYPER_FAI
  VNTYPER_HG19_REFERENCE
  VNTYPER_PACKAGE_ZIP
  VNTYPER_WEB_E2E_OUT

Fixture lookup:
  positive -> example_6449_hg19_subset
  negative -> example_7a61_hg19_subset
  Searches bioscript/ports/vntyper/test-data first, then repos/vntyper/tests/data.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --web) MODE="web" ;;
    --cli) MODE="cli" ;;
    --bam) INPUT_KIND="bam" ;;
    --cram) INPUT_KIND="cram" ;;
    --case) shift; CASE_FILTER="${1:-}" ;;
    --case=*) CASE_FILTER="${1#*=}" ;;
    --headed|--debug|-i|--interactive)
      WEB_ARGS+=("$1")
      ;;
    --pw-arg)
      shift
      WEB_ARGS+=("${1:-}")
      ;;
    -h|--help) usage; exit 0 ;;
    *)
      if [[ "$MODE" == "web" ]]; then
        WEB_ARGS+=("$1")
      else
        echo "Unknown argument: $1" >&2
        usage >&2
        exit 2
      fi
      ;;
  esac
  shift
done

if [[ "$MODE" != "web" && "$MODE" != "cli" ]]; then
  echo "Pick --web or --cli." >&2
  usage >&2
  exit 2
fi
if [[ "$INPUT_KIND" != "bam" && "$INPUT_KIND" != "cram" ]]; then
  echo "Pick --bam or --cram." >&2
  usage >&2
  exit 2
fi

require_file() {
  local label="$1"
  local path="$2"
  if [[ -z "$path" ]]; then
    echo "Missing $label path. Set the matching VNTYPER_* environment variable." >&2
    exit 3
  fi
  if [[ ! -f "$path" ]]; then
    echo "Missing $label file: $path" >&2
    exit 3
  fi
}

build_package_zip() {
  require_file "VNtyper manifest" "$PACKAGE_DIR/manifest.yaml"
  require_file "VNtyper assay" "$PACKAGE_DIR/assay.yaml"
  require_file "VNtyper script" "$PACKAGE_DIR/vntyper.py"
  require_file "VNtyper MUC1 reference asset" "$PACKAGE_DIR/assets/muc1_motifs.fa"
  mkdir -p "$(dirname "$PACKAGE_ZIP")"
  (
    cd "$PACKAGE_DIR"
    zip -qr "$PACKAGE_ZIP" manifest.yaml assay.yaml muc1-vntr.yaml vntyper.py assets/muc1_motifs.fa
  )
}

default_bam_fixture() {
  local case_stem="$CASE_FILTER"
  if [[ "$CASE_FILTER" == "positive" ]]; then
    case_stem="example_6449_hg19_subset"
  elif [[ "$CASE_FILTER" == "negative" ]]; then
    case_stem="example_7a61_hg19_subset"
  fi
  for base in "bioscript/ports/vntyper/test-data" "repos/vntyper/tests/data"; do
    local stem="$base/$case_stem"
    if [[ -f "$stem.bam" ]]; then
      VNTYPER_BAM="${VNTYPER_BAM:-$ROOT/$stem.bam}"
      VNTYPER_BAI="${VNTYPER_BAI:-$ROOT/$stem.bam.bai}"
      return
    fi
  done
}

default_cram_fixture() {
  local case_stem="$CASE_FILTER"
  if [[ "$CASE_FILTER" == "positive" ]]; then
    case_stem="example_6449_hg19_subset"
  elif [[ "$CASE_FILTER" == "negative" ]]; then
    case_stem="example_7a61_hg19_subset"
  fi
  for base in "bioscript/ports/vntyper/test-data" "repos/vntyper/tests/data"; do
    local stem="$base/$case_stem"
    if [[ -f "$stem.cram" ]]; then
      VNTYPER_CRAM="${VNTYPER_CRAM:-$ROOT/$stem.cram}"
      VNTYPER_CRAI="${VNTYPER_CRAI:-$ROOT/$stem.cram.crai}"
      if [[ -f "$stem.fa" ]]; then
        VNTYPER_FASTA="${VNTYPER_FASTA:-$ROOT/$stem.fa}"
        VNTYPER_FAI="${VNTYPER_FAI:-$ROOT/$stem.fa.fai}"
      elif [[ -f "$VNTYPER_HG19_REFERENCE" ]]; then
        VNTYPER_FASTA="${VNTYPER_FASTA:-$VNTYPER_HG19_REFERENCE}"
        VNTYPER_FAI="${VNTYPER_FAI:-$VNTYPER_HG19_REFERENCE.fai}"
      fi
      return
    fi
  done
}

if [[ "$INPUT_KIND" == "bam" ]]; then
  default_bam_fixture
  require_file "BAM" "${VNTYPER_BAM:-}"
  require_file "BAM index (.bai)" "${VNTYPER_BAI:-}"
else
  default_cram_fixture
  require_file "CRAM" "${VNTYPER_CRAM:-}"
  require_file "CRAM index (.crai)" "${VNTYPER_CRAI:-}"
  require_file "reference FASTA" "${VNTYPER_FASTA:-}"
  require_file "reference FASTA index (.fai)" "${VNTYPER_FAI:-}"
fi

build_package_zip

mkdir -p "$OUT_DIR"
echo "VNtyper package: $PACKAGE_ZIP"
echo "Output dir:      $OUT_DIR"

if [[ "$MODE" == "cli" ]]; then
  CLI_OUT="$OUT_DIR/cli-$INPUT_KIND-$CASE_FILTER"
  mkdir -p "$CLI_OUT"
  CLI_ARGS=(
    run -q --manifest-path "$ROOT/bioscript/rust/Cargo.toml" -p bioscript-cli -- report "$PACKAGE_ZIP"
    --input-file
  )
  if [[ "$INPUT_KIND" == "bam" ]]; then
    CLI_ARGS+=("$VNTYPER_BAM" --input-format bam --input-index "$VNTYPER_BAI")
  else
    CLI_ARGS+=(
      "$VNTYPER_CRAM"
      --input-format cram
      --input-index "$VNTYPER_CRAI"
      --reference-file "$VNTYPER_FASTA"
      --reference-index "$VNTYPER_FAI"
      --allow-md5-mismatch
    )
  fi
  CLI_ARGS+=(
    --output-dir "$CLI_OUT"
    --analysis-max-duration-ms "${VNTYPER_ANALYSIS_MAX_DURATION_MS:-300000}"
  )
  cargo "${CLI_ARGS[@]}" | tee "$CLI_OUT/report.log"
  if ! rg -q "vntyper_status|vntyper_confidence|vntyper_variant|vntyper_alt_depth" "$CLI_OUT"; then
    echo "CLI report completed but expected VNtyper fields were not found under $CLI_OUT" >&2
    exit 5
  fi
  echo "CLI VNtyper report output: $CLI_OUT"
  exit 0
fi

VNTYPER_PACKAGE_ZIP="$PACKAGE_ZIP" \
VNTYPER_INPUT_KIND="$INPUT_KIND" \
VNTYPER_BAM="${VNTYPER_BAM:-}" \
VNTYPER_BAI="${VNTYPER_BAI:-}" \
VNTYPER_CRAM="${VNTYPER_CRAM:-}" \
VNTYPER_CRAI="${VNTYPER_CRAI:-}" \
VNTYPER_FASTA="${VNTYPER_FASTA:-}" \
VNTYPER_FAI="${VNTYPER_FAI:-}" \
VNTYPER_WEB_E2E_OUT="$OUT_DIR" \
./test-web.sh --vntyper "${WEB_ARGS[@]}"
