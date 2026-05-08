/* tslint:disable */
/* eslint-disable */

export function compileVariantYamlText(name: string, text: string): string;

/**
 * Classify bytes as a known genomic file. Mirrors `bioscript-formats::inspect::inspect_bytes`.
 * Returns JSON matching the `Inspection` shape the app already uses.
 */
export function inspectBytes(name: string, bytes: Uint8Array, options_json?: string | null): string;

/**
 * Observe a list of SNP variants against an indexed CRAM + reference FASTA,
 * with the bulk bytes pulled on demand via JS-supplied `readAt(offset, len)`
 * callbacks. The small index payloads (`.crai`, `.fai`) are passed inline.
 *
 * Both callbacks must return a `Uint8Array` synchronously (or via a Node
 * sync read) — wasm's `Read + Seek` contract is synchronous. Async reads are
 * a follow-up that needs buffered pre-fetch on the JS side.
 */
export function lookupCramVariants(cram_read_at: Function, cram_len: number, crai_bytes: Uint8Array, fasta_read_at: Function, fasta_len: number, fai_bytes: Uint8Array, variants_json: string): string;

export function lookupGenotypeBytesRsids(name: string, bytes: Uint8Array, rsids_json: string): string;

export function lookupGenotypeBytesVariants(name: string, bytes: Uint8Array, variants_json: string): string;

/**
 * Observe a list of SNP variants against a bgzipped + tabix-indexed VCF,
 * with the bulk bytes pulled on demand via a JS-supplied `readAt(offset, len)`
 * callback. The small `.tbi` payload is passed inline.
 *
 * The reader must provide the VCF synchronously — on web this is a
 * `FileReaderSync`-backed callback running inside a Web Worker.
 */
export function lookupVcfVariants(vcf_read_at: Function, vcf_len: number, tbi_bytes: Uint8Array, variants_json: string): string;

/**
 * Resolve a BioScript package release YAML into the package zip artifact URL.
 */
export function resolvePackageReleaseText(source_url: string, name: string, text: string): string;

/**
 * Resolve a BioScript package zip from bytes.
 *
 * This mirrors the CLI package importer enough for browser/mobile callers:
 * path safety, package size limits, descriptor/entrypoint discovery, and
 * resource classification all stay in Rust.
 */
export function resolvePackageZipBytes(source_url: string, name: string, bytes: Uint8Array): string;

/**
 * Classify a fetched remote resource and return dependency requirements.
 *
 * Network access stays in the host app so each platform can prompt before
 * fetching. The schema/type/dependency logic lives here so web, mobile,
 * desktop, and CLI share one implementation.
 */
export function resolveRemoteResourceText(source_url: string, name: string, text: string): string;

export function runPackageReportBytes(manifest_path: string, package_files_json: string, input_name: string, input_bytes: Uint8Array, options_json?: string | null): string;

/**
 * Mirrors `runPackageReportBytes` but for CRAM input. The CRAM body and
 * FASTA reference are streamed via JS-supplied `readAt` callbacks so the
 * browser doesn't have to load multi-GB genomes into wasm memory. The CRAI
 * and FAI indexes are passed inline.
 *
 * Analyses run against the observations produced from the CRAM lookup. The
 * per-script Python interpreter still receives `input_bytes` as a virtual
 * file; for CRAM that's an empty buffer because typical PGx analysis scripts
 * (apoe, mthfr, apol1, …) read observation rows rather than raw genome bytes.
 */
export function runPackageReportFromCram(manifest_path: string, package_files_json: string, input_name: string, cram_read_at: Function, cram_len: number, crai_bytes: Uint8Array, fasta_read_at: Function, fasta_len: number, fai_bytes: Uint8Array, options_json?: string | null): string;

/**
 * Mirrors `runPackageReportBytes` but for a bgzipped, tabix-indexed VCF
 * streamed via JS-supplied `readAt` callbacks. The TBI is passed inline.
 */
export function runPackageReportFromVcf(manifest_path: string, package_files_json: string, input_name: string, vcf_read_at: Function, vcf_len: number, tbi_bytes: Uint8Array, options_json?: string | null): string;

export function start(): void;

/**
 * Verify package artifact bytes against a package-release sha256 value.
 */
export function verifyPackageArtifactSha256(name: string, bytes: Uint8Array, expected: string): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly resolvePackageReleaseText: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly resolvePackageZipBytes: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly verifyPackageArtifactSha256: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly inspectBytes: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly resolveRemoteResourceText: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly compileVariantYamlText: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly start: () => void;
    readonly runPackageReportBytes: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number, number];
    readonly runPackageReportFromCram: (a: number, b: number, c: number, d: number, e: number, f: number, g: any, h: number, i: number, j: number, k: any, l: number, m: number, n: number, o: number, p: number) => [number, number, number, number];
    readonly runPackageReportFromVcf: (a: number, b: number, c: number, d: number, e: number, f: number, g: any, h: number, i: number, j: number, k: number, l: number) => [number, number, number, number];
    readonly lookupCramVariants: (a: any, b: number, c: number, d: number, e: any, f: number, g: number, h: number, i: number, j: number) => [number, number, number, number];
    readonly lookupGenotypeBytesRsids: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly lookupGenotypeBytesVariants: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly lookupVcfVariants: (a: any, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
