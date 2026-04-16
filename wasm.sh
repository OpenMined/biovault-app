#!/usr/bin/env bash
# Compile bioscript-wasm (nodejs target) and exercise lookupCramVariants
# against the 1k-genomes NA06985 CRAM and GRCh38 FASTA. No browser, no Metro —
# this is the thinnest possible end-to-end test of the wasm variant-lookup
# pipeline, useful for iterating on the Rust side and reproducing bugs that
# only show up under the wasm32-unknown-unknown target.
#
# Requires: wasm-pack (cargo install wasm-pack), node.
# Test data: the provided APOL1 G1 SNP rs73885319 on GRCh38 chr22:36265860.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CRAM="${CRAM:-${ROOT}/test-data/1k-genomes/aligned/NA06985.final.cram}"
CRAI="${CRAI:-${CRAM}.crai}"
FASTA="${FASTA:-${ROOT}/test-data/1k-genomes/ref/GRCh38_full_analysis_set_plus_decoy_hla.fa}"
FAI="${FAI:-${FASTA}.fai}"

# APOL1 G1 rs73885319 — the variants/*.yaml shape compiled down to the
# minimal JSON the wasm export expects. Extend the array to look up more
# sites in one call.
VARIANTS='[
  {
    "name": "APOL1_G1_rs73885319",
    "chrom": "chr22",
    "pos": 36265860,
    "ref": "A",
    "alt": "G",
    "rsid": "rs73885319",
    "assembly": "grch38"
  }
]'

for f in "$CRAM" "$CRAI" "$FASTA" "$FAI"; do
  if [ ! -e "$f" ]; then
    echo "[wasm.sh] missing input: $f" >&2
    exit 1
  fi
done

echo "[wasm.sh] cram  = $CRAM"
echo "[wasm.sh] crai  = $CRAI"
echo "[wasm.sh] fasta = $FASTA"
echo "[wasm.sh] fai   = $FAI"

exec node "${ROOT}/modules/expo-bioscript/scripts/run-bioscript-wasm.cjs" cram \
  --cram "$CRAM" \
  --crai "$CRAI" \
  --fasta "$FASTA" \
  --fai "$FAI" \
  --variants "$VARIANTS"
