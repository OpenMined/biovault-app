# File Picker Widget — Cross-Platform Design

One React component, one TypeScript API, four backends (iOS, Android, Desktop/Tauri, Web). Users add a genomic file; the widget runs `bioscript` heuristics and reports what it is. If the file is a CRAM/BAM that needs a reference, the widget reveals a second slot for the `.fa`/`.fasta`.

## Goals

- **Consistent API and code paths** across platforms — the view layer shouldn't know which backend it's using.
- **Don't copy when we don't have to.** Desktop links by path; web (Chromium) keeps a live `FileSystemFileHandle`; mobile copies (iOS security-scoped URLs force this).
- **Re-use Rust heuristics** from `bioscript-formats::inspect` — no duplicate detection logic in TS.

## High-level shape

```
widgets/FilePicker/
  FilePicker.tsx        — presentational component, same UI everywhere
  useFilePicker.ts      — hook: pick → inspect → maybe-request-reference → done
  types.ts              — FileRef, Inspection, PickResult

lib/file-picker/
  index.ts              — Platform.OS / env switch, re-exports the right backend
  backend.native.ts     — expo-document-picker + URL text input
  backend.web.ts        — showOpenFilePicker + drag-drop, File fallback
  backend.desktop.ts    — Tauri dialog.open + tauri://file-drop
  inspect.ts            — uniform inspectFile(ref, options?) → Inspection
```

The widget only touches `lib/file-picker`. The backend resolves at import time.

## Shared types

```ts
// A pointer to a file. Platforms produce different variants; inspect.ts
// knows how to read each.
type FileRef =
  | { kind: 'path';   path: string; name: string; size?: number }         // iOS, Android, Desktop
  | { kind: 'handle'; handle: FileSystemFileHandle; name: string }        // Web (Chromium)
  | { kind: 'blob';   file: File }                                        // Web (Firefox/Safari)
  | { kind: 'url';    url: string };                                      // Any, user-pasted

// Mirrors Rust FileInspection in bioscript-formats/src/inspect.rs.
type Inspection = {
  detectedKind: 'genotype_text' | 'vcf' | 'alignment_cram' | 'alignment_bam' | 'reference_fasta' | 'unknown';
  confidence: 'authoritative' | 'strong_heuristic' | 'weak_heuristic' | 'unknown';
  container: 'plain' | 'zip';
  assembly?: 'grch37' | 'grch38';
  phased?: boolean;
  source?: { vendor: string; platformVersion?: string; confidence: string };
  hasIndex?: boolean;
  indexPath?: string;
  referenceMatches?: boolean;
  evidence: string[];
  warnings: string[];
  durationMs: number;
};

type PickResult = { primary: FileRef; reference?: FileRef };

type InspectOptions = { reference?: FileRef };
```

## Widget flow

1. User picks a file (primary). Backend returns a `FileRef`.
2. `inspectFile(primary)` returns an `Inspection`.
3. If `detectedKind ∈ { alignment_cram, alignment_bam }` and no reference is attached, the widget reveals a **"Add reference (.fa/.fasta)"** slot.
4. User picks the reference. Widget re-runs `inspectFile(primary, { reference })` so the Rust layer can populate `referenceMatches`.
5. Widget renders the inspection card (kind, vendor, assembly, confidence, evidence).

State machine:

```
idle → picking → inspecting → ready
                            → needs_reference → picking_ref → inspecting → ready
error at any step → error (with retry)
```

## Backend mapping

| Platform      | Pick UI                                                | Storage            | Rust entry point                             |
| ------------- | ------------------------------------------------------ | ------------------ | -------------------------------------------- |
| iOS / Android | `expo-document-picker` + optional URL `TextInput`      | Copy to app cache¹ | `expo-bioscript` native module → `inspect_file(path)` |
| Desktop       | Tauri `dialog.open()` + `tauri://file-drop` event      | Keep original path | Tauri command `inspect_file(path, ref?)`     |
| Web (Chromium)| `showOpenFilePicker()` + drop with `getAsFileSystemHandle()` | Live handle, lazy read via `.stream()` | `expo-bioscript` WASM → `inspect_reader(name, bytes)` |
| Web (FF/Safari)| `<input type=file>` + drop event → `File`            | In-memory `File`   | Same WASM `inspect_reader`                   |

¹ iOS hands out security-scoped URLs that expire. Android document URIs are similar. We copy to `FileSystem.cacheDirectory` on import so later reads don't fail. Android-only: when we can resolve the content URI to a real path (`file://`) we skip the copy.

## Web: File System Access API

`window.showOpenFilePicker()` returns a `FileSystemFileHandle`. `handle.getFile()` returns a `File` that reads lazily — `.stream()` pulls chunks from disk, not RAM. Drag-drop can yield the same handle via `DataTransferItem.getAsFileSystemHandle()`.

- **Supported:** Chromium-based browsers — Chrome, Edge, Opera, Brave, Arc.
- **Not supported:** Firefox, Safari. Fall back to `<input type=file>` and drop `File` objects; `.stream()` is still lazy on read, but no persisted handle across sessions.

Detection: `'showOpenFilePicker' in window`. The backend picks the right code path automatically.

For the inspect step we only need the first ~128 KB for textual heuristics (the Rust sampler reads 64 lines), or the full bytes for a `.zip`/`.vcf.gz` (bgzf + zip central directory). Web backend reads a `Blob.slice(0, 131072)` first; for zip/bgzf it reads the whole file — same behavior the Rust code would have with a local path.

## Heuristics engine

All detection, parsing, and variant lookup logic lives in `bioscript` (see
[`docs/architecture/bioscript-is-source-of-truth.md`](../architecture/bioscript-is-source-of-truth.md)).
The widget hands bytes to bioscript via its platform binding:

- **Web** — `bioscript-wasm` (wasm-bindgen module loaded alongside Monty).
- **iOS / Android** — `bioscript-ffi` through `expo-bioscript`.
- **Desktop** — `bioscript-ffi` linked into Tauri.

There is no TS/JS reimplementation. The widget is a thin UI around the same
Rust functions that the CLI uses.

## Rust additions (in `bioscript/rust/bioscript-formats`)

Existing: `inspect_file(path: &Path, opts: &InspectOptions) -> Result<FileInspection>`.

Add: `inspect_reader(name: &str, bytes: &[u8], opts: &InspectOptions) -> Result<FileInspection>` — same heuristics, but takes pre-loaded bytes. Used by the WASM build where `std::fs` isn't available. `inspect_file` stays the authoritative entry point on native/desktop.

## Tauri additions (in `desktop/src-tauri`)

- Depend on `bioscript-formats` in `Cargo.toml`.
- `#[tauri::command] fn inspect_file(path: String, reference: Option<String>) -> Result<Inspection, String>`.
- Enable drag-drop (`dragDropEnabled: true` in `tauri.conf.json`) and forward dropped paths to the frontend over the existing WebSocket/event channel.

## Expo native module additions (in `modules/expo-bioscript`)

- NAPI/JNI binding: `inspectFile(path, options?) → Inspection`.
- Web (WASM) binding: `inspectReader(name, uint8Array, options?) → Inspection`.

Both resolve to `Inspection` so the TS layer is backend-agnostic.

## Testing

Fixtures live at repo-root `test-data/` (symlinks into `~/.bioscript/cache/test-data/`, populated by `bioscript/tools/fetch_test_data.sh`). Use at minimum a 23andMe genotype file and a CRAM + reference pair.

The widget renders a hidden `<input data-testid="file-picker-test-input">` on web only, which Playwright drives with `setInputFiles`. This keeps test hooks out of the production drop/pick paths while avoiding the `showOpenFilePicker` interception dance.

- **Rust:** extend `bioscript-formats/tests/inspect.rs` with `inspect_reader` cases.
- **iOS / Android:** Maestro flow `.maestro/file-picker.yaml` — launch app, `inputFile:` the fixture, assert vendor/kind text.
- **Desktop:** Playwright spec `.maestro-desktop/file-picker.spec.ts` — use Tauri WebDriver to set a hidden `<input>`, assert detection; separate spec drops a `.cram` and asserts the reference slot appears.
- **Web:** Playwright spec `.maestro-web/file-picker.spec.ts` — `setInputFiles` with fixture; Chromium-only test also exercises `showOpenFilePicker` via the shared backend's public function.

## Open questions / not in v1

- Persisting `FileSystemFileHandle` across sessions (IndexedDB) — deferred until we know we want it.
- URL input actually downloading — v1 just captures the URL; a later job runs the inspect.
- Chunked/streamed inspect for very large VCFs on web — current approach reads a slice, which is enough for the heuristics but not for full analysis.
