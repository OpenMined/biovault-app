# WASM architecture — one-worker unification (Plan 2)

Status: **in progress**. This doc is the reference for how we're unifying Monty
+ bioscript-wasm on the web. It replaces the scratch notes in `/wasm.md` at
the repo root, which should be deleted once Phase 4 lands.

## Goal

Run an arbitrary Python assay script (e.g. `apol1.py`) against any dropped
genome — genotype text, VCF + tabix, or CRAM + CRAI + FASTA + FAI — entirely
in the browser, with random-access reads over multi-GB files. No full-file
loads, no linear scans when an index is present, no per-`lookup_variants`
inter-worker round-trips.

Python never sees the backend:

```python
genome = bioscript.load_genome(input_handle)          # single handle
# or
genomes = bioscript.load_genomes(input_handles)       # list

PLAN = bioscript.query_plan([v1, v2, v3])
observations = genome.lookup_variants(PLAN)
```

The host (TS layer inside the worker) decides whether that handle is a text
store, a `lookup_vcf_variants` tabix call, or a `lookup_cram_variants` CRAI
pileup. The Python script is identical across all three.

## Why a single worker

See `/wasm.md` for the history. Short version:

- Monty (CPython-on-WASI via napi-rs) owns the Python interpreter and needs
  COEP/COOP + SharedArrayBuffer for its async thread pool.
- `bioscript-wasm` (wasm-bindgen) owns variant lookups and needs *synchronous*
  `readAt(offset, len)` into the picked `File`, which on web only
  `FileReaderSync` (workers-only) provides.
- Plan 1 put those two into separate workers and bridged each `lookup_variants`
  call with `postMessage`. Works, but every Python host-call costs a worker
  round-trip.
- Plan 2 co-locates them in **one** worker. The Python interpreter's external
  function handlers call `bioscript-wasm` as a **local function** — no
  postMessage, no async boundary, no duplicated `File` references.

The native path (CLI, Tauri desktop, iOS, Android) is unaffected. It runs
Monty + bioscript natively through `bioscript-ffi` with direct filesystem
access. This plan touches only `modules/expo-bioscript/src/**` and
`modules/expo-bioscript/web-runtime/bioscript-wasm/worker.mjs`.

## Shape

```
main thread (React / /lab page)
  │
  │  postMessage({ type: 'runFile', script, genomeHandle, files, indexes })
  ▼
bioscript-wasm worker  ───────────────────────────────────────────────┐
  ├─ loads Monty wasm (napi-rs, SharedArrayBuffer, WASI)             │
  ├─ loads bioscript-wasm bindings (lookupCramVariants / Vcf / ...)  │
  ├─ holds the picked File objects + in-memory indexes               │
  ├─ FileReaderSync for synchronous readAt into each File            │
  ├─ external function registry:                                      │
  │     __bioscript_load_genome__(handle)  → store in map            │
  │     __bioscript_lookup_variants__(h,p) → dispatch to backend     │
  │        - text  → existing TS delimited/VCF parser (unchanged)   │
  │        - vcf   → lookupVcfVariants (wasm, local call)           │
  │        - cram  → lookupCramVariants (wasm, local call)          │
  │     __bioscript_write_tsv__, read_text, etc                      │
  ├─ runs script through Monty                                       │
  └─ postMessage({ type: 'runFileDone', output, files })             │
    ◄──────────────────────────────────────────────────────────────────┘
```

One wasm memory space per backend module, both resident in the same worker,
both callable from the same dispatch code. `File` + indexes never cross a
worker boundary after the initial `runFile` message.

## Phases + TODOs

### Phase 1a — Main-thread Monty bridges to the wasm worker (stopgap)

Monty stays on the main thread. We extend `__bioscript_load_genotypes__` /
`__bioscript_lookup_variants__` in `ExpoBioscriptWebRuntime.ts` to route
CRAM/VCF handles through the existing bioscript-wasm worker via
`postMessage`. The Python script is unchanged; one `postMessage` round-trip
per `lookup_variants` call (negligible for apol1-style scripts with a
handful of batch calls).

This is a migration stepping-stone. Once Phase 1b lands, Monty runs
entirely inside the worker and every host-call is a local function call.

- [ ] Add a `genomeHandle` (or `genomeHandles: []`) field to `RunFileRequest`
      typed as the `GenomeDescriptor` from Phase 2 below.
- [ ] In `ExpoBioscriptWebRuntime.ts`, on runtime-context creation, register
      the handle(s) under stable string keys.
- [ ] Extend the TS `lookupVariants` external function so that when the
      selected genome is CRAM or VCF, it calls
      `BioscriptWasm.lookupCramVariants` / `lookupVcfVariants` (already
      worker-backed) and reshapes the observation list into the Python-facing
      contract: the existing shape is `(string | null)[]` where the string is
      the genotype call and `null` means no match. Map
      `VariantObservation.genotype ?? null`.
- [ ] Surface batch lookup results correctly — `apol1.py` uses the 3-element
      return with destructuring `site1, site2, g2 = genotypes.lookup_variants(plan)`.
      The order must match the plan order exactly.
- [ ] Keep the text/zip path untouched (existing in-memory parser).

### Phase 1b — Collapse into one worker (final Plan 2 shape)

Once Phase 1a is solid, unify. The napi-rs Monty loader moves into the
bioscript-wasm worker; main thread becomes a thin `postMessage` shell.

- [ ] Add a bundler step (`esbuild`) to `build-bioscript-wasm.sh` that
      bundles `web-runtime/bioscript-wasm/worker.mjs` together with
      `@napi-rs/wasm-runtime` + `@emnapi/core` + `@emnapi/runtime` +
      `@tybys/wasm-util` into a single self-contained `worker.bundle.mjs`.
      The browser worker can't resolve the bare `@napi-rs/wasm-runtime`
      import otherwise.
- [ ] Move `loadMontyModule`, `runMontyAsync`, `createMontyRunner`,
      `createExternalFunctions`, `rewriteBioscriptSource` from
      `ExpoBioscriptWebRuntime.ts` into the worker entry.
- [ ] Add `{ type: 'runFile', … }` message handler; reply with
      `{ type: 'runFileDone', outputFiles, outputText }` or error.
- [ ] Shrink `ExpoBioscriptWebRuntime.ts` to a thin `postMessage` wrapper.
- [ ] Verify Monty's own `asyncWorkPoolSize` sub-workers (spawned from inside
      the worker via nested `new Worker(...)`) still work — Chromium allows
      nested module workers since 2020 but the wasi-worker-browser.mjs file
      itself will also need its bare import bundled the same way.
- [ ] Delete Phase 1a's main-thread bridging in `ExpoBioscriptWebRuntime.ts`
      — external functions are now defined *in* the worker.

### Phase 2 — `bioscript.load_genome` handle API

- [ ] Add to the worker's external function table:
      `__bioscript_load_genome__(handle) -> genomeStoreId`.
      `handle` is an opaque string the lab UI generated per genome card
      (e.g. `"genome-<uuid>"`). The worker looks it up in the
      descriptor map sent in the `runFile` message:
      ```ts
      type GenomeDescriptor =
        | { kind: 'text'; text: string; filename: string }
        | { kind: 'vcf'; vcfFile: File; tbiBytes: Uint8Array }
        | { kind: 'cram'; cramFile: File; craiBytes: Uint8Array;
            fastaFile: File; faiBytes: Uint8Array }
      ```
- [ ] Dispatch in `__bioscript_lookup_variants__`:
      ```
      text → reuse existing in-memory parser path (keep for now, remove
             when `bioscript-wasm` gains a `load_genotypes_bytes` export)
      vcf  → lookupVcfVariants(vcfFile, tbiBytes, variantsJson)
      cram → lookupCramVariants(cramFile, craiBytes, fastaFile, faiBytes, variantsJson)
      ```
      Translate the wasm return JSON back into the shape Monty expects
      (`lookupVariants` on the TS side returns `Array<string | null>` today —
      the apol1 script checks `is None` on each element, so we need to keep
      that contract. Observations with a `.genotype` field → emit the
      genotype string; else emit `None`).
- [ ] Add `bioscript.load_genomes([h1, h2])` symmetrically — just a list of
      genome objects; each has `lookup_variants(plan)`.
- [ ] Rewriter: `bioscript.load_genome\s*\(` →
      `__bioscript_load_genome__(`, and `bioscript.load_genomes\s*\(` →
      `__bioscript_load_genomes__(`.
- [ ] Keep `bioscript.load_genotypes` working as a compatibility alias — same
      dispatch, just a deprecation-friendly entrypoint so old scripts run.
- [ ] Python side: emit a small `BioscriptGenome` class shim at the top of
      every rewritten script so `genome.lookup_variants(PLAN)` routes through
      `__bioscript_lookup_variants__(genome_id, PLAN)` — the rewriter already
      does this for `*.lookup_variants(` generically, so this may be free.

### Phase 3 — `/lab` UI wires handles into `runFile`

- [ ] When the user clicks Run with a Python assay selected:
      - Build a `GenomeDescriptor` from the selected genome card (pulling
        `File`s and reading `.crai`/`.fai`/`.tbi` into `Uint8Array` bytes).
      - Call `runFile({ scriptPath, scriptContents, genomeHandle, files })`.
- [ ] Text assays selected on a CRAM genome: stop returning the "blocked"
      message. Instead, route through the unified path — the Python script
      calls `bioscript.load_genome(input_handle)` and the external function
      dispatches to the CRAM backend.
- [ ] When the user's Python script uses `load_genotypes(input_file)` (the
      old shape), pass `input_file` as a special handle that resolves to
      the genotype-text descriptor. Old scripts keep working.

### Phase 4 — End-to-end verification

- [ ] Ship an `apol1.py` assay (same as the one the user pasted — three
      variants, APOL1 G1/G2 classifier).
- [ ] Drop NA06985 CRAM + CRAI + GRCh38 FASTA + FAI into `/lab`, drop
      `apol1.py`, click Run.
- [ ] Expected output: `apol1_status = "G0/G0"` for NA06985. Compare against
      `bioscript-cli run apol1.py` on the same inputs.
- [ ] Time budget: ≤ 300 ms on a 17 GB CRAM through the worker. We're at
      ~100 ms for a single `lookupCramVariants` call today; three variants
      batched in one call should stay under that.
- [ ] Add a Playwright spec covering this path (`.maestro-web/lab-apol1.spec.ts`)
      so it can't regress silently.

## Out of scope (for now)

- No changes to `bioscript-runtime` / `bioscript-ffi` / native paths.
- No change to the way `bioscript-wasm` is built (`build-bioscript-wasm.sh`,
  Metro's `/modules/.../web-runtime/` static middleware).
- Indel / deletion observations on CRAM (the G2 deletion in `apol1.py` will
  currently return `null`); SNP-only is the Phase 4 bar. Indel support is
  tracked separately on the bioscript migration list.
- Rust-side YAML → variants compile — the JS compiler in `app/(tabs)/lab/index.tsx`
  stays until bioscript-wasm exposes `compile_variant_yaml`.

## Build/runtime invariants to preserve

- `metro.config.js` sets `Cross-Origin-Embedder-Policy: credentialless` +
  `Cross-Origin-Opener-Policy: same-origin` so SharedArrayBuffer works.
- `metro.config.js` serves `/modules/expo-bioscript/web-runtime/**` as raw
  static files with `application/javascript` / `application/wasm` MIME types.
- `.wasm` is in `resolver.assetExts` — Metro serves it as a downloadable
  asset; `Asset.fromModule(...).uri` gives the URL.
- `bash modules/expo-bioscript/scripts/build-bioscript-wasm.sh` rebuilds
  both the main-thread bundle (`src/bioscript-wasm/`) and the worker-side
  bundle (`web-runtime/bioscript-wasm/`) whenever Rust changes.
- The worker already loads bioscript-wasm via a relative `import()`; Plan 2
  adds a second dynamic import for Monty alongside it.
