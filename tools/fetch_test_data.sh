#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TEST_DATA_DIR="${REPO_ROOT}/test-data"

download() {
  local url="$1"
  local dest="$2"
  mkdir -p "$(dirname "$dest")"
  if [ -f "$dest" ]; then
    echo "[fetch-test-data] exists: ${dest#$REPO_ROOT/}"
    return 0
  fi
  echo "[fetch-test-data] downloading ${dest#$REPO_ROOT/}"
  curl -fL --retry 3 --retry-delay 2 -o "$dest" "$url"
}

fetch_web() {
  download \
    "https://raw.githubusercontent.com/OpenMined/biovault-data/main/snp/23andme/v5/hu50B3F5/genome_hu50B3F5_v5_Full.zip" \
    "${TEST_DATA_DIR}/23andme/v5/hu50B3F5/genome_hu50B3F5_v5_Full.zip"
}

fetch_genomics() {
  download \
    "https://ftp-trace.ncbi.nih.gov/1000genomes/ftp/1000G_2504_high_coverage/data/ERR3239276/NA06985.final.cram" \
    "${TEST_DATA_DIR}/1k-genomes/aligned/NA06985.final.cram"
  download \
    "https://ftp-trace.ncbi.nih.gov/1000genomes/ftp/1000G_2504_high_coverage/data/ERR3239276/NA06985.final.cram.crai" \
    "${TEST_DATA_DIR}/1k-genomes/aligned/NA06985.final.cram.crai"
  download \
    "https://ftp.1000genomes.ebi.ac.uk/vol1/ftp/technical/reference/GRCh38_reference_genome/GRCh38_full_analysis_set_plus_decoy_hla.fa" \
    "${TEST_DATA_DIR}/1k-genomes/ref/GRCh38_full_analysis_set_plus_decoy_hla.fa"
  download \
    "https://ftp.1000genomes.ebi.ac.uk/vol1/ftp/technical/reference/GRCh38_reference_genome/GRCh38_full_analysis_set_plus_decoy_hla.fa.fai" \
    "${TEST_DATA_DIR}/1k-genomes/ref/GRCh38_full_analysis_set_plus_decoy_hla.fa.fai"
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  cat <<'EOF'
Usage: ./tools/fetch_test_data.sh

Downloads all repo test fixtures into test-data/.
EOF
  exit 0
fi

if [ "$#" -gt 0 ]; then
  echo "This script takes no arguments." >&2
  echo "Run ./tools/fetch_test_data.sh to download all repo test fixtures." >&2
  exit 2
fi

fetch_web
fetch_genomics
