#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
bioscript_fetch() {
  local fetcher="${REPO_ROOT}/bioscript/tools/fetch_test_data.sh"
  if [ ! -x "$fetcher" ]; then
    echo "Missing manifest-driven fetcher: $fetcher" >&2
    echo "Initialize the bioscript submodule, then rerun this command." >&2
    exit 1
  fi
  BIOSCRIPT_TEST_DATA_REPO_ROOT="$REPO_ROOT" "$fetcher" "$@"
}

fetch_web() {
  bioscript_fetch --dataset 23andme --only "genome_hu50B3F5_v5_Full.zip"
}

fetch_genomics() {
  bioscript_fetch --dataset 1k-genomes \
    --only "NA06985.final.cram,NA06985.final.cram.crai,GRCh38_full_analysis_set_plus_decoy_hla.fa,GRCh38_full_analysis_set_plus_decoy_hla.fa.fai"
}

fetch_web_pgx_public() {
  bioscript_fetch --dataset 23andme
  bioscript_fetch --dataset dynamicdna
  bioscript_fetch --dataset ancestrydna
  bioscript_fetch --dataset familytreedna
  bioscript_fetch --dataset genesforgood
  bioscript_fetch --dataset myheritage
  bioscript_fetch --dataset 1k-genomes --only "NA06985.clean.vcf.gz*"
  bioscript_fetch --dataset apol1
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  cat <<'EOF'
Usage: ./tools/fetch_test_data.sh [--web-pgx-public]

Downloads repo test fixtures into test-data/.

Options:
  --web-pgx-public   Download public PGx browser-report fixtures, excluding
                     the large NA06985 CRAM/reference files.

With no arguments, downloads the legacy web fixture plus genomics fixtures,
including the large CRAM/reference files.
EOF
  exit 0
fi

if [ "${1:-}" = "--web-pgx-public" ] || [ "${1:-}" = "--pgx-web-public" ]; then
  if [ "$#" -ne 1 ]; then
    echo "--web-pgx-public takes no additional arguments." >&2
    exit 2
  fi
  fetch_web_pgx_public
  exit 0
fi

if [ "$#" -gt 0 ]; then
  echo "This script takes no arguments." >&2
  echo "Run ./tools/fetch_test_data.sh --help for supported modes." >&2
  exit 2
fi

fetch_web
fetch_genomics
