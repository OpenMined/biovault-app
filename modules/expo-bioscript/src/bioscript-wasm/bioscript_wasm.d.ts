/* tslint:disable */
/* eslint-disable */

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

/**
 * Observe a list of SNP variants against a bgzipped + tabix-indexed VCF,
 * with the bulk bytes pulled on demand via a JS-supplied `readAt(offset, len)`
 * callback. The small `.tbi` payload is passed inline.
 *
 * The reader must provide the VCF synchronously — on web this is a
 * `FileReaderSync`-backed callback running inside a Web Worker.
 */
export function lookupVcfVariants(vcf_read_at: Function, vcf_len: number, tbi_bytes: Uint8Array, variants_json: string): string;

export function start(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly inspectBytes: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly lookupCramVariants: (a: any, b: number, c: number, d: number, e: any, f: number, g: number, h: number, i: number, j: number) => [number, number, number, number];
    readonly lookupVcfVariants: (a: any, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly start: () => void;
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
