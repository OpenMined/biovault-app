# Small APOL1 fixture

Tiny CRAM + reference stub slice for the `apol1.py` regression test
(`.maestro-web/lab-apol1.spec.ts`). Runs in CI without shipping the 17 GB
NA06985 CRAM.

## Files

| File              | Size   | Purpose                                           |
| ----------------- | ------ | ------------------------------------------------- |
| `apol1.cram`      | 113 KB | NA06985 reads on `chr22:36265000-36267000`        |
| `apol1.cram.crai` | 54 B   | CRAI index                                        |
| `stub.fa`         | 9 B    | `>chr22\nN\n` — sufficient because CRAM is embed_ref |
| `stub.fa.fai`     | 14 B   | FASTA index for the stub                          |

The CRAM was produced with `samtools view -C --output-fmt-option
version=3.0 --output-fmt-option embed_ref=1 …` so each slice carries its
own reference bases. noodles-cram reads those inline and never touches the
external FASTA beyond sequence-name lookup — which is why a 1-byte `N`
chr22 works.

## Regenerate

The source CRAM + reference live under the top-level (gitignored)
`test-data/` directory, populated by
`bioscript/tools/fetch_test_data.sh --dataset 1k-genomes`. From the repo
root:

```bash
bioscript/tools/fetch_test_data.sh --dataset 1k-genomes

samtools view -C \
  --output-fmt-option version=3.0 \
  --output-fmt-option embed_ref=1 \
  -T test-data/1k-genomes/ref/GRCh38_full_analysis_set_plus_decoy_hla.fa \
  -o assays/risk/APOL1/test-data/apol1.cram \
  test-data/1k-genomes/aligned/NA06985.final.cram \
  chr22:36265000-36267000
samtools index assays/risk/APOL1/test-data/apol1.cram
printf '>chr22\nN\n' > assays/risk/APOL1/test-data/stub.fa
samtools faidx assays/risk/APOL1/test-data/stub.fa
```
