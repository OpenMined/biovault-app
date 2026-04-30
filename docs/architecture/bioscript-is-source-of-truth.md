# Bioscript is the single source of truth for file + assay logic

**Rule:** any code that parses genomic files, classifies them, runs heuristics on
them, compiles/executes assays, or performs variant lookups **must** live in the
`bioscript` Rust crates. The biovault app code (`app/`, `widgets/`, `lib/`,
`modules/expo-bioscript/src/**.ts`) consumes that logic — it never reimplements
it.

This means no TypeScript ports of parsers, no JS-side YAML→Python compilers, no
JS regex-based vendor sniffing. If you find yourself writing one, stop and add
the function to `bioscript` instead.

## Why

- Before this rule, we had two implementations: Rust for native/desktop and a
  drifting TypeScript "port" for web. Behavior diverged (vendor detection,
  genotype parsing, VCF phasing, etc.) and bugs had to be fixed twice.
- Bioscript already supports every format we care about — VCF, 23andMe text,
  zipped 23andMe, CRAM, BAM, FASTA — including index detection and build-on-
  demand.
- Compiling Rust to WASM is a one-time cost per feature; TS ports compound
  forever.

## Platform bindings

| Platform       | Binding                                                          |
| -------------- | ---------------------------------------------------------------- |
| Web            | `bioscript-wasm` (wasm-bindgen) loaded next to Monty WASM        |
| iOS / Android  | `bioscript-ffi` (JNI / Swift FFI)                                |
| Desktop        | `bioscript-ffi` (direct Rust link inside Tauri `src-tauri`)      |
| CLI / scripts  | `bioscript-cli` binary                                           |

All four bindings wrap the same `bioscript-core` + `bioscript-formats` +
`bioscript-runtime` crates. The TypeScript layer only decides which binding to
use (via `Platform.OS` / build target).

## What belongs where

| Concern                                       | Where it lives                                               |
| --------------------------------------------- | ------------------------------------------------------------ |
| Detecting file kind + vendor (heuristics)     | `bioscript-formats::inspect`                                 |
| Parsing 23andMe / VCF / zipped genotype       | `bioscript-formats::genotype`                                |
| Reading CRAM / BAM with a reference           | `bioscript-formats::genotype::from_cram_*` (via `noodles`)   |
| Detecting missing indexes, building them      | `bioscript-formats::inspect::detect_index` + noodles index   |
| Compiling a `bioscript:variant:1.0` YAML      | `bioscript-schema` → `bioscript-runtime` compile path        |
| Running a Python assay against a genome store | `bioscript-runtime`                                          |
| Monty Python sandbox (execution)              | `bioscript/monty` submodule                                  |
| File picker UI / drag-drop                    | app (`widgets/FilePicker/`, `app/assay-lab.tsx`, …)          |
| Platform file pickers                         | app (`backend.web.ts` / `backend.native.ts`)                 |
| Persistence (DB rows, IndexedDB handles)      | app (`lib/home-import.ts`, `lib/file-handle-store.ts`)       |

UI code is allowed to hold **pointers** (paths, `FileSystemFileHandle`s, URLs,
byte buffers). It passes those pointers/bytes to bioscript and renders what
bioscript returns.

## WASM loader

`ExpoBioscriptWebRuntime.ts` loads two WASM modules in parallel:

1. **Monty** — Python sandbox, runs assay scripts.
2. **bioscript-wasm** — everything else: inspect, genotype loading, CRAM/BAM,
   YAML compile, variant lookup.

Monty's external functions (`__bioscript_load_genotypes__`, `__bioscript_lookup_variants__`,
etc.) delegate to bioscript-wasm. No JS-side parsing.

## Migration status (updated 2026-04-30)

- [ ] Delete `widgets/FilePicker/heuristics.ts` (TS port of `inspect.rs`) once
      `bioscript-wasm` exposes `inspect_bytes`.
- [x] Delete `parseDelimitedGenotypes` / `parseVcfGenotypes` from
      `ExpoBioscriptWebRuntime.ts`; text/zip rsid lookup now uses
      `bioscript-wasm` backed by Rust `GenotypeStore`.
- [ ] Delete `compileVariantYamlToPython` from `app/assay-lab.tsx`.
- [ ] Wire alignment runs through wasm-based CRAM/BAM parser.
- [ ] Flag every new PR touching these files — the linter should catch JS
      reimplementations of bioscript logic.

## Exception

The only TS code that may interpret bytes is the **thin wrapper** that hands
bytes to bioscript (e.g. `file.arrayBuffer()` → `new Uint8Array` → `bioscript.inspectBytes`).
That's not a reimplementation; it's marshalling.
