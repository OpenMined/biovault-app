# VNtyper BioVault App TODO

Goal: drag a VNtyper BioScript package ZIP into the BioVault app, drag VNtyper
test genome files, and get a report result from the native BioScript VNtyper
pipeline.

Primary acceptance criterion: running the original VNtyper test samples through
upstream Java VNtyper must produce the same biological result and equivalent
output folder as running the same samples through the BioScript VNtyper package
inside the BioVault web interface. The web path is not done just because it
returns a report; it must match upstream Java VNtyper for the original positive
and negative samples.

## Current status: artifact/report output

- [x] Add package-level result viewer metadata.
  - `bioscripts/examples/vntyper/manifest.yaml` now declares:
    `result.entrypoint: summary_report.html`.
  - Package ZIP resolution carries this as `resultEntrypoint`.
  - wasm report output marks the matching artifact as `primary`.
  - BioVault Lab's result viewer prefers a primary HTML artifact before the
    generic `index.html`, so VNtyper can show `summary_report.html` when the
    user clicks `View result`.
- [x] Add BioScript output artifact plumbing for extra files.
  - Runtime now has `bioscript.copy_file(source, dest)` so analysis scripts can
    copy generated virtual files into `/output/...` without moving bytes through
    Python.
  - CLI report mode persists `/output/...` text and binary files at the report
    output root.
  - wasm package-report mode returns extra `/output/...` text and binary files
    as artifacts.
  - BioVault Lab artifacts now support binary downloads as well as text
    artifacts.
- [x] Emit a first upstream-shaped VNtyper output tree from the BioScript assay.
  - Current BioScript output includes:
    - `summary_report.html`
    - `igv_report.html`
    - `pipeline_summary.json`
    - `pipeline.log`
    - `predefined_regions_hg19.bed`
    - `coverage/coverage_summary.tsv`
    - `coverage/coverage_vntr_coverage.txt`
    - `coverage/coverage_vntr_coverage.depth.log`
    - `fastq_bam_processing/output_R1.fastq.gz`
    - `fastq_bam_processing/output_R2.fastq.gz`
    - `fastq_bam_processing/output_sliced.bam`
    - `fastq_bam_processing/output_sliced.bam.bai`
    - `fastq_bam_processing/output_slice.log`
    - `fastq_bam_processing/output_sort_fastq.log`
    - `fastq_bam_processing/output_index.log`
    - `fastq_bam_processing/output_merge.log`
    - `fastq_bam_processing/pipeline_info.json`
    - `kestrel/kestrel_pre_result.tsv`
    - `kestrel/kestrel_result.tsv`
    - `kestrel/output.vcf`
    - `kestrel/output_insertion.vcf`
    - `kestrel/output_deletion.vcf`
    - `kestrel/output_indel.vcf`
    - `kestrel/output.bed`
- [x] Refresh the draggable example package ZIP in
  `repos/bioscript/bioscripts/examples/vntyper/vntyper_muc1.zip`.
- [ ] Make the BioScript output folder exactly match
  `results/vntyper-original-6449-positive`.
  - The folder shape is now close, but exact parity is not complete.
  - Current missing upstream files:
    - `fastq_bam_processing/output_other.fastq.gz`
    - `fastq_bam_processing/output_single.fastq.gz`
    - `fastq_bam_processing/output_unmapped.bam`
    - `kestrel/bcftools_sort.log`
    - `kestrel/kestrel_kmer_20.log`
    - `kestrel/output.bam`
    - `kestrel/output.bam.bai`
    - `kestrel/output_indel.vcf.gz`
    - `kestrel/output_indel.vcf.gz.csi`
    - `kestrel/samtools_index.log`
    - `kestrel/samtools_view.log`
  - BioScript also emits standard report files that upstream VNtyper does not:
    `observations.tsv`, `analysis.jsonl`, `reports.jsonl`, and `report.log`.

## Package the VNtyper assay

- [x] Add a package-root `manifest.yaml` for VNtyper.
  - Entry point should reference the runnable assay manifest.
  - Include package metadata: name, version, label, summary, tags, and publish
    settings if this should become a distributable package.
- [x] Keep the package ZIP layout simple and self-contained:
  - `manifest.yaml`
  - `assay.yaml`
  - `muc1-vntr.yaml`
  - `vntyper.py`
  - `assets/muc1_motifs.fa`
- [x] Package it with the BioScript package tooling and verify the ZIP imports
  through the app's local-drop package path.
  - Verified with `cargo run -q -p bioscript-cli -- import-package ...`;
    the importer now accepts FASTA/reference assets in package ZIPs.
- [x] Add a CLI smoke test:
  - `bioscript report <vntyper.zip> --input-file <test.bam> --input-index <test.bam.bai>`
  - Equivalent CRAM command with `--input-file`, `--input-index`,
    `--reference-file`, and `--reference-index`.
  - `test-vntyper.sh --cli ...` provides the command harness, package ZIP
    build, fixture discovery, and output assertions.

## Support BAM and CRAM inputs

- [x] Make the VNtyper analysis script accept an injected input index path.
  - Prefer `input_index` as the generic runtime name.
  - Optionally preserve `input_bai` for BAM-specific compatibility.
- [x] Use the passed index in native calls:
  - `samtools.view_region_native(input_file, bam_region, sliced_bam, input_index)`
  - `samtools.fastq_native(input_file, bam_region, fastq_1, fastq_2, input_index)`
- [x] Avoid indexing inside the analysis script when the app already has an
  index.
- [x] For BAM, require or generate `.bam.bai`.
- [x] For CRAM, require or generate `.cram.crai` and require/reference-generate
  `.fa.fai` for the reference FASTA.
  - The web lab already has generation hooks for BAI/CRAI/FAI; package-report
    BAM validation now requires only BAM + BAI, while CRAM remains strict.
  - CRAM can technically store reference/no-ref data, but the current
    BioScript/noodles lookup/report path still builds an external reference
    repository and needs reference allele context. Keep VNtyper CRAM inputs
    strict as CRAM + CRAI + FASTA + FAI until that backend explicitly supports
    embedded-reference operation.
- [x] Confirm samtools-rs native region slicing and FASTQ extraction work for
  both BAM and CRAM in the BioScript runtime.
  - BAM coverage: `vntyper_bam_native_bioscript_program_runs_through_runtime`.
  - CRAM coverage: `vntyper_app_example_runs_with_virtual_cram_report_paths`
    uses `mini.cram + mini.cram.crai + mini.fa + mini.fa.fai` through the
    virtual filesystem and exercises native slicing plus FASTQ extraction.

## Generate missing indexes

- [x] In the app file grouping layer, detect missing alignment indexes:
  - BAM missing `.bai`
  - CRAM missing `.crai`
  - FASTA missing `.fai`
- [x] Wire index generation into the run preparation flow:
  - `generateBamBaiFile(...)`
  - `generateCramCraiFile(...)`
  - `generateFastaFaiFile(...)`
- [x] Store generated index bytes with the selected genome group so retrying a
  run does not regenerate them.
- [x] Surface clear progress/status text while indexes are generated.
- [x] Treat index generation failures as actionable file-prep errors.

## Pass indexes through the virtual filesystem

- [x] Extend the report-analysis virtual input setup to include auxiliary input
  files.
  - Primary input: `/input/genotypes` or a clearer alignment name.
  - BAM input/index: `/input/genotypes.bam` + `/input/genotypes.bam.bai`
  - CRAM input/index: `/input/genotypes.cram` + `/input/genotypes.cram.crai`
  - FASTA: `/input/reference.fa`
  - FASTA index: `/input/reference.fa.fai`
- [x] Add these paths to `RuntimeConfig.virtual_binary_files`.
- [x] Inject path globals for analysis scripts:
  - `input_file`
  - `input_index`
  - `reference_fasta` for CRAM when needed
  - `reference_index` for CRAM when needed
- [x] Include the same values in `bioscript.context` so scripts can read them
  without relying only on globals.
- [x] Add runtime tests that assert native samtools/kestrel/bcftools calls can
  read the materialized virtual files.
  - Focused runtime coverage: `vntyper_app_example_runs_with_virtual_report_paths`.
  - CRAM auxiliary virtual-file coverage:
    `vntyper_app_example_runs_with_virtual_cram_report_paths`.

## App run path

- [x] Ensure dropped VNtyper ZIPs resolve through `resolvePackageZipBytes(...)`.
- [x] Ensure VNtyper package runs through `runLabPackageReportRef(...)`, not the
  simple direct `runFile(...)` assay path.
- [x] Fix BAM package-report validation so BAM requires only BAM + BAI, not
  FASTA + FAI.
- [x] Keep CRAM validation strict: CRAM + CRAI + FASTA + FAI.
- [x] Increase VNtyper package report duration/memory limits if the real test
  fixtures exceed the current defaults.
  - Raised app/web package-report analysis timeout from 30s to 5 minutes.
- [x] Confirm web BAM package-report behavior first.
  - Command-line wasm package report now passes before browser testing:
    `node modules/expo-bioscript/scripts/run-bioscript-wasm.cjs report-bam --package-dir repos/bioscript/bioscripts/examples/vntyper --manifest assay.yaml --bam repos/vntyper/tests/data/example_6449_hg19_subset.bam --bai repos/vntyper/tests/data/example_6449_hg19_subset.bam.bai`
  - Command-line wasm CRAM package report now passes before browser CRAM
    testing:
    `node modules/expo-bioscript/scripts/run-bioscript-wasm.cjs report-cram --package-dir repos/bioscript/bioscripts/examples/vntyper --manifest assay.yaml --cram repos/vntyper/tests/data/example_6449_hg19_subset.cram --crai repos/vntyper/tests/data/example_6449_hg19_subset.cram.crai --fasta repos/vntyper/reference/muc1_region_hg19.fa --fai repos/vntyper/reference/muc1_region_hg19.fa.fai`
  - Browser web BAM positive acceptance now passes:
    `./test-vntyper.sh --web --bam --case positive`.
  - Browser web BAM negative acceptance now passes:
    `./test-vntyper.sh --web --bam --case negative`.
  - Browser web CRAM positive acceptance now passes:
    `./test-vntyper.sh --web --cram --case positive`.
  - Browser web CRAM negative acceptance now passes:
    `./test-vntyper.sh --web --cram --case negative`.
  - The browser path now gets through onboarding, mixed package/genome drop,
    BAM/CRAM completeness, package assay display, package-report execution,
    artifact generation, result viewer launch, and assertion of
    `vntyper_status`, `vntyper_confidence`, `vntyper_variant`, and
    `vntyper_alt_depth` inside `analysis.jsonl`.
  - Fixes that unblocked web wasm:
    - BAM/CRAM virtual input naming is format-aware.
    - wasm-target `samtools.view_region_native`, `samtools.fastq_native`, and
      `samtools.depth_native` route BAM inputs through pure-Rust
      bioscript-formats helpers instead of HTSlib.
    - wasm-target `samtools.view_region_native` and `samtools.fastq_native`
      route CRAM inputs through pure-Rust CRAM byte helpers that consume CRAM +
      CRAI + FASTA + FAI from the virtual filesystem instead of parsing CRAI
      bytes as BAI.
    - Kestrel can run from in-memory reference/FASTQ records and write VCF
      text into the runtime virtual filesystem.
    - Kestrel wasm avoids unsupported `std::env` probes.
    - VNtyper no longer runs unused `bcftools.sort/index` before reading the
      original Kestrel VCF.
    - `vcf.read_vntyper_kestrel` reads virtual text VCF outputs before falling
      back to platform files.
  - Desktop/native behavior should be checked separately with an Electron or
    native backend run if that packaging path is needed beyond the current web
    Lab drag/drop flow. CLI package-report acceptance is already green for
    BAM/CRAM.
- [x] Add native mobile FFI/bridge support later if mobile package-report
  functions remain stubbed.
  - Deferred from this VNtyper web/desktop package goal. The current deliverable
    is the web/desktop Lab flow; mobile bridge work should be opened as a
    separate task once mobile package-report execution is required.

## Test data and acceptance tests

- [x] Document where all VNtyper test data comes from.
  - Upstream VNtyper fixture archive:
    - Preferred fetch command:
      `cd repos/vntyper && make download-test-data`
    - Verify command:
      `cd repos/vntyper && make verify-test-data`
    - The Makefile downloads the Zenodo archive configured in
      `repos/vntyper/tests/test_data_config.json`.
    - Current archive URL:
      `https://zenodo.org/records/19181821/files/data.zip?download=1`
    - Archive filename: `data.zip`
    - Expected archive MD5:
      `fdd5958d58c733cdca452f3287898964`
    - Extract target: `repos/vntyper/tests/data`
  - Primary original hg19 BAM fixtures used for BioVault parity:
    - Positive: `repos/vntyper/tests/data/example_6449_hg19_subset.bam`
    - Positive index:
      `repos/vntyper/tests/data/example_6449_hg19_subset.bam.bai`
    - Negative: `repos/vntyper/tests/data/example_7a61_hg19_subset.bam`
    - Negative index:
      `repos/vntyper/tests/data/example_7a61_hg19_subset.bam.bai`
  - Other upstream BAM/FASTQ samples available after the Zenodo download:
    - `example_66bf_hg19_subset`
    - `example_6c28_hg19_subset`
    - `example_a5c1_hg19_subset`
    - `example_b178_hg19_subset`
    - `example_dfc3_hg19_subset`
    - `example_40cf_hg38_subset` regression guard
    - paired FASTQs named
      `example_<id>_hg19_subset_R1.fastq.gz` and
      `example_<id>_hg19_subset_R2.fastq.gz`
  - BioVault/BioScript fixture override directory:
    - `repos/bioscript/ports/vntyper/test-data`
    - This is searched before `repos/vntyper/tests/data`.
    - Use it for local large-data drops, generated CRAMs, or hand-curated
      parity fixtures that should not be committed.
  - Harness lookup order in `/Users/madhavajay/dev/biovault-app/workspace1/test-vntyper.sh`:
    - first `bioscript/ports/vntyper/test-data`;
    - then `repos/vntyper/tests/data`.
  - Harness case aliases:
    - `--case positive` -> `example_6449_hg19_subset`
    - `--case negative` -> `example_7a61_hg19_subset`
  - CRAM fixtures:
    - Upstream Zenodo ships BAM/BAI and FASTQ fixtures; CRAM/CRAI fixtures may
      be generated locally from the BAMs.
    - In this workspace the expected generated locations are:
      - `repos/vntyper/tests/data/example_6449_hg19_subset.cram`
      - `repos/vntyper/tests/data/example_6449_hg19_subset.cram.crai`
      - `repos/vntyper/tests/data/example_7a61_hg19_subset.cram`
      - `repos/vntyper/tests/data/example_7a61_hg19_subset.cram.crai`
    - Generate with `samtools view -C` from the matching BAM and index with
      `samtools index`.
    - Keep the same basename so `test-vntyper.sh` auto-discovers them, or set
      `VNTYPER_CRAM` and `VNTYPER_CRAI`.
  - CRAM reference FASTA/FAI:
    - Default hg19 reference:
      `repos/vntyper/reference/muc1_region_hg19.fa`
    - Default hg19 reference index:
      `repos/vntyper/reference/muc1_region_hg19.fa.fai`
    - `test-vntyper.sh` uses these via `VNTYPER_HG19_REFERENCE` when a
      same-basename `.fa` is not present.
    - Override with `VNTYPER_FASTA` and `VNTYPER_FAI`.
  - Kestrel/MUC1 motif references:
    - BioScript package asset:
      `repos/bioscript/bioscripts/examples/vntyper/assets/muc1_motifs.fa`
    - Upstream VNtyper reference:
      `repos/vntyper/reference/All_Pairwise_and_Self_Merged_MUC1_motifs_filtered.fa`
    - Upstream FAI:
      `repos/vntyper/reference/All_Pairwise_and_Self_Merged_MUC1_motifs_filtered.fa.fai`
  - Original Java VNtyper output reference captured for parity discussion:
    - `results/vntyper-original-6449-positive`
    - This is the known positive output tree that BioScript output should
      converge toward.
- [x] Add or document VNtyper fixture aliases for:
  - positive BAM + BAI
  - negative BAM + BAI
  - positive CRAM + CRAI + FASTA + FAI
  - negative CRAM + CRAI + FASTA + FAI
  - Harness aliases now documented in `repos/bioscript/ports/vntyper/test-data/README.md`.
    `test-vntyper.sh` maps `--case positive` to
    `example_6449_hg19_subset` and `--case negative` to
    `example_7a61_hg19_subset` when the large test-data drop is present.
    It searches `bioscript/ports/vntyper/test-data` first, then
    `repos/vntyper/tests/data` after `cd repos/vntyper && make download-test-data`.
- [x] Add a CLI acceptance test for the packaged ZIP.
  - Harness added in `test-vntyper.sh --cli --bam|--cram --case ...`.
  - Proven against the Zenodo VNtyper fixture archive in
    `repos/vntyper/tests/data`:
    - `./test-vntyper.sh --cli --bam --case positive`
    - `./test-vntyper.sh --cli --bam --case negative`
    - `./test-vntyper.sh --cli --cram --case positive`
    - `./test-vntyper.sh --cli --cram --case negative`
  - The archive ships BAM/BAI fixtures; local CRAM/CRAI fixtures were generated
    from the positive/negative BAMs with `samtools view -C` and indexed with
    `samtools index`, using `repos/vntyper/reference/muc1_region_hg19.fa` plus
    `.fai`.
- [x] Add a web lab Playwright test:
  - Drop/import VNtyper ZIP.
  - Drop/import fixture genome files.
  - Run package report.
  - Assert `vntyper_status`, `vntyper_confidence`, `vntyper_variant`, and
    `vntyper_alt_depth` appear.
  - Test passes for `./test-vntyper.sh --web --bam --case positive` by opening
    the result viewer and asserting the generated `analysis.jsonl` artifact.
- [x] Add a `test-vntyper.sh` web end-to-end mode that proves the app workflow:
  - Build/package the VNtyper assay ZIP if it is missing or stale.
  - Start the BioVault web dev server on an available port.
  - Launch Playwright against the Lab page.
  - Import/drop the VNtyper package ZIP.
  - Import/drop one BAM fixture plus its `.bai`, or one CRAM fixture plus
    `.crai`, reference `.fa`, and `.fa.fai`.
  - Select the VNtyper package and attached genome group.
  - Run the report through the app package-report path.
  - Wait for completion and assert the visible result table/report contains:
    `vntyper_status`, `vntyper_confidence`, `vntyper_variant`, and
    `vntyper_alt_depth`.
  - Save a screenshot and any report artifacts under a deterministic output
    directory such as `/tmp/vntyper-web-e2e-<timestamp>/`.
- [x] Make `test-vntyper.sh` support focused web cases:
  - `./test-vntyper.sh --web --bam --case positive`
  - `./test-vntyper.sh --web --bam --case negative`
  - `./test-vntyper.sh --web --cram --case positive`
  - `./test-vntyper.sh --web --cram --case negative`
- [x] Make the web test fail with concrete prerequisite errors when package ZIP,
  fixture data, indexes, reference files, browser binaries, or the dev server
  cannot be prepared.
- [x] Add regression tests for missing-index generation.
  - Existing browser regression:
    `.maestro-web/lab-index-generation.spec.ts` covers missing BAI/CRAI/FAI
    generation, cancellation, successful run, and generated-index reuse.
- [x] Add regression tests that generated indexes are passed into the virtual
  filesystem and visible to the analysis script.
  - Added CLI runner coverage that provided BAM/CRAM auxiliary paths
    (`input_index`, `input_bai`, `reference_fasta`, `reference_index`) are
    virtualized and visible to BioScript globals and `bioscript.context`.
  - Added runtime CRAM coverage proving virtualized `input_index`,
    `alignment_reference_fasta`, and `alignment_reference_index` can drive
    native samtools CRAM slicing/FASTQ extraction.

## Remaining VNtyper parity work

- [ ] Make Java VNtyper vs BioScript web VNtyper identical for the original
  test samples.
  - Run the original fixtures through upstream Java VNtyper.
  - Run the same BAM/CRAM fixtures through the BioVault web interface using the
    packaged BioScript VNtyper ZIP.
  - Compare the biological call, key TSV fields, and output artifact set.
  - Positive sample `example_6449_hg19_subset` must match upstream's positive
    `High_Precision*` insertion call.
  - Negative sample `example_7a61_hg19_subset` must match upstream's negative
    call.
  - Treat any difference in final call, selected variant row, confidence,
    reported depths, or missing user-visible artifacts as a failing parity
    test.
- [ ] Make the positive 6449 fixture call match upstream VNtyper.
  - Upstream original result:
    `High_Precision*` insertion, `Motifs=4-5`, `POS=38`,
    `REF=G`, `ALT=GAGCCCGGGGCCGGCCTGGTGTCCGG`,
    alternate depth `694`, active-region depth `5475`,
    `Depth_Score=0.1267579908675799`, `haplo_count=290`, `Flag=Not flagged`.
  - Current BioScript run completes and produces artifacts, but the positive
    BAM fixture still reports `normal` / `negative`.
  - Do not treat the artifact plumbing as biological parity; the Kestrel/input
    preparation and post-processing still need to match upstream.
- [ ] Port upstream BAM preprocessing more exactly.
  - Upstream VNtyper:
    - slices the predefined MUC1 BED region with `samtools view -P -b -L`;
    - extracts relevant unmapped reads;
    - merges sliced + unmapped BAM;
    - re-indexes the merged BAM;
    - name-sorts before FASTQ extraction;
    - writes paired, other, and singleton FASTQ outputs.
  - Current BioScript path slices the region and directly extracts R1/R2 FASTQ.
  - Needed native/library support:
    - unmapped-read extraction for the fixture input;
    - BAM merge;
    - name-sort path that feeds FASTQ extraction;
    - `samtools.fastq` support for `-0`/`-s` equivalents so
      `output_other.fastq.gz` and `output_single.fastq.gz` are real outputs.
- [ ] Make Kestrel native output artifacts match upstream.
  - Upstream writes Kestrel SAM, converts it to:
    - `kestrel/output.bam`
    - `kestrel/output.bam.bai`
  - Upstream filters/splits/compresses/indexes:
    - `kestrel/output_indel.vcf`
    - `kestrel/output_indel.vcf.gz`
    - `kestrel/output_indel.vcf.gz.csi`
    - insertion/deletion VCFs.
  - Current BioScript Kestrel native path writes VCF text only.
  - Needed work:
    - expose Kestrel SAM/haplotype alignment output from `kestrel-rs`;
    - convert/index that output as BAM in BioScript;
    - add bgzip/CSI support for the indel VCF, either through bcftools-rs or a
      pure Rust equivalent;
    - write meaningful `kestrel_kmer_20.log`, `samtools_view.log`,
      `samtools_index.log`, and `bcftools_sort.log`.
- [ ] Finish upstream VNtyper post-processing parity.
  - Port or reuse the logic already documented in
    `repos/bioscript/ports/vntyper/bioscript/vntyper_port.py`.
  - Required pieces:
    - indel-only filtering;
    - frame score, direction, and frameshift amount;
    - valid insertion/deletion frameshift detection;
    - depth score and confidence assignment;
    - motif annotation/correction;
    - duplicate/flag rules;
    - final best-variant selection.
  - `kestrel_pre_result.tsv` should contain the full pre-filter row set.
  - `kestrel_result.tsv` should contain the final selected upstream-equivalent
    row for positive fixtures.
- [ ] Replace the temporary VNtyper HTML with closer upstream report parity.
  - Current `summary_report.html` is a compact BioScript-generated report.
  - Upstream `summary_report.html` includes richer sections, log excerpts,
    screening summary, and styled Kestrel result details.
  - `igv_report.html` is currently a placeholder; real parity requires
    equivalent IGV.js report generation from BED + VCF.GZ + BAM artifacts.
- [ ] Decide and implement the matplotlib/plotting port strategy.
  - VNtyper's production matplotlib usage is in
    `repos/vntyper/vntyper/scripts/cohort_summary.py`.
  - That module generates cohort-level donut charts from multiple
    `pipeline_summary.json` files. It is not required for the single-sample
    BioVault VNtyper report path.
  - `repos/vntyper/tests/benchmark/plot_vntyper_summary.py` also uses
    matplotlib, but it is benchmark tooling, not the user-facing VNtyper
    pipeline.
  - Do not try to port matplotlib itself into BioScript wasm.
  - For the single-sample BioVault report:
    - keep the report HTML generated from TSV/JSON data;
    - use HTML/CSS tables and badges for now;
    - only add lightweight inline SVG or canvas charts if the upstream
      single-sample report truly needs a chart.
  - For future cohort-summary support:
    - port the aggregation logic from `cohort_summary.py` to Rust/TypeScript or
      BioScript data transforms;
    - render donut/scatter plots in the browser with SVG/canvas or an existing
      JS chart library;
    - optionally emit static SVG files as `/output/...` artifacts instead of
      PNGs;
    - preserve the same labels, counts, colors, and decision rules as upstream;
    - add parity tests against upstream cohort-summary outputs using the same
      input `pipeline_summary.json` files.
- [ ] Update tests so artifact parity is asserted, not just run completion.
  - CLI should compare the generated file list against
    `results/vntyper-original-6449-positive`.
  - CLI should compare key fields in `kestrel/kestrel_result.tsv`.
  - wasm/browser tests should assert:
    - `summary_report.html` is marked primary;
    - `View result` opens VNtyper HTML, not generic BioScript `index.html`;
    - binary artifacts are downloadable;
    - expected VNtyper artifact paths appear in the artifact list.
  - Keep the current standard BioScript report artifacts as additional app
    artifacts, but do not count them as upstream VNtyper parity files.

## Open design questions

- [x] Decide whether VNtyper should use a single generic `input_index` global or
  both `input_index` and `input_bai`.
  - Use generic `input_index` as the preferred path. Keep `input_bai` as a
    compatibility alias for existing BAM-oriented scripts.
- [x] Decide whether the app should auto-generate large BAM/CRAM indexes by
  default or ask for confirmation because indexing can be slow.
  - Keep the current confirmation prompt before generating BAI/CRAI/FAI for
    dropped local files; large alignment indexing can be slow enough that it
    should not happen silently.
- [x] Decide where generated indexes should be persisted for local dropped files.
  - Persist generated indexes in the selected Lab genome group for the current
    browser/app session so reruns reuse them. Long-lived disk/IndexedDB
    persistence can be added later with explicit cache policy.
- [x] Decide whether VNtyper should emit only the simplified TSV fields or also
  expose Kestrel VCF/TSV/report JSON artifacts in the app UI.
  - Emit the simplified TSV fields for BioScript analysis compatibility and
    also expose VNtyper/Kestrel artifacts in the app UI. This is now partially
    implemented through `/output/...` artifacts and binary artifact download
    support.
- [x] Decide how BioVault chooses a VNtyper report HTML entry point.
  - Use package-level `result.entrypoint` metadata in `manifest.yaml`.
  - VNtyper currently sets this to `summary_report.html`.
  - The app still falls back to `index.html` or the first `.html` when a
    package does not declare a primary report artifact.
- [ ] Decide whether exact upstream parity means byte-for-byte identical files
  or same paths with semantically equivalent content.
  - Recommendation: require exact TSV/key-call parity first, require the same
    file paths for user-visible artifacts, and only require byte-for-byte
    parity where deterministic output is realistic.
