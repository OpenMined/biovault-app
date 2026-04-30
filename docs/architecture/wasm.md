# WASM architecture — one-worker unification (Plan 2)

Reference for how Monty + bioscript-wasm are unified on the web so that
Python assays like `apol1.py` can run against a 17 GB CRAM (or a VCF, or a
23andMe text file) with random-access reads entirely in the browser.

## State of play (2026-04-17)

| Phase | What                                                             | Status                                    |
| ----- | ---------------------------------------------------------------- | ----------------------------------------- |
| 1a    | Main-thread Monty bridges to the existing wasm worker            | ✅ shipped                                 |
| 1b    | Collapse Monty + bioscript-wasm into one worker (final shape)    | ⏸ open — deferred                         |
| 2     | `bioscript.load_genome(handle)` typed-handle API                 | ✅ shipped                                 |
| 3     | `/lab` UI wires `GenomeDescriptor`s into `runFile`               | ✅ shipped                                 |
| 4     | End-to-end `apol1.py × NA06985 CRAM` verified, Playwright in CI  | ✅ shipped                                 |
| 5     | Drop the FASTA requirement for `embed_ref` CRAMs                 | ⏸ open                                    |

Today Python scripts go: main-thread Monty → TS external function →
`postMessage` to the bioscript-wasm worker → `lookup{Cram,Vcf}Variants` →
reply → Monty resumes. One worker round-trip per `lookup_variants` call
(~ms of overhead, negligible for real assays). Phase 1b removes that hop
by moving the Monty loader into the wasm worker.

## Goal

Run an arbitrary Python assay script against any dropped genome — genotype
text, VCF + tabix, or CRAM + CRAI + FASTA + FAI — entirely in the
browser. No full-file loads, no linear scans when an index is present, no
duplicated `File` refs across workers.

Python never sees the backend:

```python
genome = bioscript.load_genome(input_handle)     # single handle
# or, for multi-sample assays (Phase 2.5 — not shipped yet):
genomes = bioscript.load_genomes(input_handles)

PLAN = bioscript.query_plan([v1, v2, v3])
observations = genome.lookup_variants(PLAN)
```

The runtime picks the right backend (text parser / `lookupVcfVariants` /
`lookupCramVariants`) based on the `GenomeDescriptor` the lab UI registered
for the handle.

## Why a single worker (long-term)

- Monty (CPython-on-WASI via napi-rs) owns the Python interpreter and
  needs COEP/COOP + SharedArrayBuffer for its async thread pool.
- `bioscript-wasm` (wasm-bindgen) owns variant lookups and needs
  *synchronous* `readAt(offset, len)` into the picked `File`, which on web
  only `FileReaderSync` (workers-only) provides.
- Plan 1 put those two into separate workers and bridged each
  `lookup_variants` call with `postMessage`. That's what Phase 1a ships —
  simple, every host-call costs one worker round-trip.
- Plan 2 co-locates them in **one** worker. External function handlers
  call `bioscript-wasm` as a **local function** — no postMessage, no async
  boundary, no duplicated `File` refs. That's Phase 1b.

The native path (CLI, Tauri desktop, iOS, Android) is unaffected. It runs
Monty + bioscript natively through `bioscript-ffi` with direct filesystem
access. This plan touches only `modules/expo-bioscript/src/**` and
`modules/expo-bioscript/web-runtime/bioscript-wasm/worker.mjs`.

## Final shape (Phase 1b target)

```
main thread (React / /lab page)
  │
  │  postMessage({ type: 'runFile', script, genomeHandle, files, indexes })
  ▼
bioscript-wasm worker  ───────────────────────────────────────────────┐
  ├─ loads Monty wasm (napi-rs, SharedArrayBuffer, WASI)              │
  ├─ loads bioscript-wasm bindings (lookupCramVariants / Vcf / ...)   │
  ├─ holds the picked File objects + in-memory indexes                │
  ├─ FileReaderSync for synchronous readAt into each File             │
  ├─ external function registry:                                      │
  │     __bioscript_load_genome__(handle)  → store in map             │
  │     __bioscript_lookup_variants__(h,p) → dispatch to backend      │
  │        - text  → in-memory delimited/VCF parser                   │
  │        - vcf   → lookupVcfVariants (wasm, local call)             │
  │        - cram  → lookupCramVariants (wasm, local call)            │
  │     __bioscript_write_tsv__, read_text, etc                       │
  ├─ runs script through Monty                                        │
  └─ postMessage({ type: 'runFileDone', output, files })              │
    ◄──────────────────────────────────────────────────────────────────┘
```

One wasm memory space per backend module, both resident in the same
worker, both callable from the same dispatch code. `File` + indexes never
cross a worker boundary after the initial `runFile` message.

## Phase 1a — Main-thread Monty bridges to the wasm worker ✅

Monty runs on the main thread (`ExpoBioscriptWebRuntime.ts`). The TS
`__bioscript_lookup_variants__` handler dispatches on
`GenomeStore.kind`:

- `text` → existing in-memory rsid-map parser (unchanged)
- `vcf`  → `BioscriptWasm.lookupVcfVariants(...)` (worker-backed)
- `cram` → `BioscriptWasm.lookupCramVariants(...)` (worker-backed)

Observations get reshaped back into the Python contract `(string | null)[]`
(the string is the genotype call — `apol1.py` inspects it char-by-char
and treats `null` as "no match"). Plan order is preserved so
destructuring like `site1, site2, g2 = genotypes.lookup_variants(plan)`
works.

**Bugs fixed along the way:**

- `__bioscript_lookup_variants__` threw a plain JS `Error` → Monty
  rejected it with `Invalid exception type: 'Error'`. Added
  `mapJsErrorToPythonException` so unknown names fall through to
  `RuntimeError` (Python builtin); the real error message now surfaces.
- CRAM: `observe_cram_snp_with_reader` called `reader.read_header()` on
  every variant, but the `JsReader` stream position was wherever the
  previous lookup ended, so the second call got "invalid CRAM header".
  Fixed in `bioscript-formats::alignment` by seeking the inner reader
  back to offset 0 before each `read_header`.

Touched:

- `modules/expo-bioscript/src/ExpoBioscript.types.ts` — `GenomeDescriptor`
  + `RunFileRequest.genomes`.
- `modules/expo-bioscript/src/ExpoBioscriptWebRuntime.ts` — new
  `loadGenome`, `lookupVariantsDispatch`, reshaping, exception mapping.
- `bioscript/rust/bioscript-formats/src/alignment.rs` — idempotent
  rewind in `for_each_{,raw_}cram_record_with_reader`.

## Phase 1b — Collapse into one worker ⏸

Move the napi-rs Monty loader into the wasm worker; main thread becomes a
thin `postMessage` shell.

**Blocker (known):** the browser worker can't resolve a bare
`@napi-rs/wasm-runtime` import. Needs a bundler step.

- [ ] Add `esbuild` (dev-dep) and a bundle step to
      `modules/expo-bioscript/scripts/build-bioscript-wasm.sh` that bundles
      `web-runtime/bioscript-wasm/worker.mjs` together with
      `@napi-rs/wasm-runtime` + `@emnapi/core` + `@emnapi/runtime` +
      `@tybys/wasm-util` into `worker.bundle.mjs`.
- [ ] Move `loadMontyModule`, `runMontyAsync`, `createMontyRunner`,
      `createExternalFunctions`, `rewriteBioscriptSource` from
      `ExpoBioscriptWebRuntime.ts` into the worker entry.
- [ ] Add `{ type: 'runFile', … }` handler in the worker; reply with
      `{ type: 'runFileDone', outputFiles, outputText }` or `{ type:
      'error', error }`.
- [ ] Shrink `ExpoBioscriptWebRuntime.ts` to a thin `postMessage` wrapper
      around the worker.
- [ ] Verify Monty's own `asyncWorkPoolSize` sub-workers (spawned via
      nested `new Worker(...)` from inside the worker) still work.
      `wasi-worker-browser.mjs` needs the same bare-import bundling.
- [ ] Delete Phase 1a's main-thread bridging in
      `ExpoBioscriptWebRuntime.ts` — external functions now live in the
      worker.

Effort estimate: ~half-day. Pays off most when scripts do many lookups
per run (tight loops over big variant panels).

## Phase 2 — `bioscript.load_genome` typed-handle API ✅

- `GenomeDescriptor` variants (`text` / `zip` / `vcf` / `cram`) defined in
  `ExpoBioscript.types.ts`.
- `RunFileRequest.genomes: Record<string, GenomeDescriptor>` carries them
  from the lab UI into the runtime.
- Runtime: `__bioscript_load_genome__(handle)` + legacy
  `__bioscript_load_genotypes__(path)` (auto-promotes to `load_genome` when
  the path resolves to a descriptor). Source rewriter supports both.
- Text/zip genotype stores pass bytes into `bioscript-wasm` and resolve rsids
  through Rust `GenotypeStore`. VCF/CRAM hit the wasm worker.

**Not yet shipped from this phase (future work):**

- [ ] `bioscript.load_genomes([h1, h2, ...])` for multi-sample runs — the
      host side is a trivial loop over `load_genome`; the Python-side
      shim needs a small change so a list-of-genomes object exposes its
      own `.lookup_variants(plan)` (or users iterate and call per-genome).
- [x] Retire the JS `parseDelimitedGenotypes` / `parseVcfGenotypes` path.
      `lookupGenotypeBytesRsids` now covers the Monty compatibility
      `get(rsid)` and text `lookup_variants` paths.

## Phase 3 — `/lab` UI wires handles into `runFile` ✅

- `app/(tabs)/lab/index.tsx` builds a `GenomeDescriptor` from the selected
  genome card (reads `.crai` / `.fai` / `.tbi` into `Uint8Array`).
- The Python+CRAM/VCF combination is no longer blocked with a message —
  it routes through the unified `load_genome` path.
- Old Python scripts using `bioscript.load_genotypes(input_file)` keep
  working: the runtime treats `input_file` as a handle key and falls back
  to the legacy in-memory parser only when no descriptor is registered.

## Phase 4 — End-to-end verification ✅

- Assay: `assays/risk/APOL1/apol1.py` (three variants, APOL1 G1/G2
  classifier).
- Fixture: `assays/risk/APOL1/test-data/` — 124 KB total:
  - `apol1.cram` / `.crai`: CRAM v3.0 with `--output-fmt-option embed_ref=1`,
    only `chr22:36265000-36267000`.
  - `stub.fa` / `.fai`: 9 B `>chr22\nN\n`. Sufficient because the CRAM
    carries its reference bases inline.
- Playwright: `.maestro-web/lab-apol1.spec.ts`, wired into `test-web.sh`'s
  default SPECS list. Passes in **55–60 ms** against the small fixture,
  **1.4 s** against the full 17 GB CRAM.
- Expected output: `apol1_status = G0/G0` for NA06985, matching
  `bioscript-cli run apol1.py` on the same inputs.

## Phase 5 — Drop the FASTA requirement for embed_ref CRAMs ⏸

Today the lab still asks the user to drop a reference FASTA + FAI even
when the CRAM is embed_ref. We verified manually (via wasm.sh) that a 9 B
`>chr22\nN\n` stub fasta decodes an embed_ref slice correctly — noodles
never touches the external FASTA beyond sequence-name lookup. So the UI
ask is dead weight in that case.

- [ ] Wasm helper: `inspect_cram_header(readAt, len) -> { embed_ref: bool,
      sequences: [{name, length}] }`. Reads just the CRAM preamble +
      first container header.
- [ ] Lab UI: on CRAM drop, call the helper. If `embed_ref=true`, mark
      FASTA/FAI slots as `auto-generated` (optional).
- [ ] Worker: when a CRAM genome has no FASTA, synthesize
      `>chrN\nN\n` + a matching fai from the sequence table and pass it
      to `lookup_cram_variants`.
- [ ] Fall back to requiring an explicit FASTA when `embed_ref=false` and
      surface a clear error ("this CRAM needs a reference — drop
      .fa / .fa.fai").

Effort estimate: ~2–3 hours.

## Out of scope for Plan 2

- Native paths (CLI, Tauri, iOS, Android) stay as-is — they already have
  full CRAM/VCF support via `bioscript-ffi`.
- Bigger bioscript-wasm work, tracked in
  `docs/architecture/bioscript-is-source-of-truth.md`:
  - CRAM deletion / indel observations (apol1's G2 site currently returns
    `null` — SNP-only today).
  - Rsid-only VCF lookup (currently requires a locus; tabix is
    position-indexed, so rsid-only needs a linear-scan fallback in Rust).
  - BAM/BAI support in the wasm binding.
  - Rust-side YAML → variants compile (`compile_variant_yaml`) to retire
    the JS compiler in `app/(tabs)/lab/index.tsx`.

## Build / runtime invariants to preserve

- `metro.config.js` sets `Cross-Origin-Embedder-Policy: credentialless` +
  `Cross-Origin-Opener-Policy: same-origin` so SharedArrayBuffer works.
- `metro.config.js` serves `/modules/expo-bioscript/web-runtime/**` as raw
  static files with `application/javascript` / `application/wasm` MIME
  types (worker lives there).
- `.wasm` is in `resolver.assetExts` — Metro serves it as a downloadable
  asset; `Asset.fromModule(...).uri` gives the URL the worker fetches.
- `bash modules/expo-bioscript/scripts/build-bioscript-wasm.sh` rebuilds
  both the main-thread bundle (`src/bioscript-wasm/`) and the worker-side
  bundle (`web-runtime/bioscript-wasm/`) whenever Rust changes. Phase 1b
  adds an esbuild step to this script.
- The worker loads bioscript-wasm via a relative `import()`; Phase 1b
  adds a second dynamic import for Monty alongside it, bundled in.

## Related docs

- `wasm.md` at the repo root: raw session-context notes from the initial
  migration. Still accurate for the broader "bioscript-as-source-of-truth"
  story. Can be retired once Phase 1b + Phase 5 land.
- `docs/architecture/bioscript-is-source-of-truth.md`: the rule that all
  parsing/variant logic lives in Rust.
