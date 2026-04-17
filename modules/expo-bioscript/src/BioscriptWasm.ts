// Single entrypoint to the bioscript-wasm bundle on web. The actual loader and
// bindings are emitted by wasm-pack at build time (see
// modules/expo-bioscript/scripts/build-bioscript-wasm.sh), and live inside
// src/bioscript-wasm/ so Metro resolves the relative imports against the module
// tree rather than node_modules/.
//
// All file-format, assay, and lookup logic lives in bioscript — the JS side
// just marshals bytes in and JSON out. See
// docs/architecture/bioscript-is-source-of-truth.md.

import { Platform } from 'react-native'

import { Asset } from 'expo-asset'
import { getBioscriptWasmUrl } from './webRuntimeAssets'

// Static imports so Metro bundles these. The wasm-pack "web" template emits
// ESM; Metro's ESM-to-CJS transform keeps the named exports intact.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const wasmJsModule = require('./bioscript-wasm/bioscript_wasm.js') as {
	default: (input?: { module_or_path: string | URL | Request }) => Promise<unknown>
	inspectBytes: (name: string, bytes: Uint8Array, optionsJson: string | null) => string
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const wasmAsset = require('./bioscript-wasm/bioscript_wasm_bg.wasm')

let wasmPromise: Promise<typeof wasmJsModule> | null = null

async function loadBioscriptWasm(): Promise<typeof wasmJsModule> {
	if (wasmPromise) return wasmPromise
	wasmPromise = (async () => {
		const wasmUrl = Asset.fromModule(wasmAsset).uri
		await wasmJsModule.default({ module_or_path: wasmUrl })
		return wasmJsModule
	})()
	return wasmPromise
}

export type BioscriptInspection = {
	fileName: string
	container: 'plain' | 'zip'
	detectedKind:
		| 'genotype_text'
		| 'vcf'
		| 'alignment_cram'
		| 'alignment_bam'
		| 'reference_fasta'
		| 'unknown'
	confidence: 'authoritative' | 'strong_heuristic' | 'weak_heuristic' | 'unknown'
	assembly?: 'grch37' | 'grch38'
	phased?: boolean
	source?: {
		vendor: string
		platformVersion?: string
		confidence: 'authoritative' | 'strong_heuristic' | 'weak_heuristic' | 'unknown'
		evidence: string[]
	}
	selectedEntry?: string
	hasIndex?: boolean
	referenceMatches?: boolean
	evidence: string[]
	warnings: string[]
	durationMs: number
}

export type BioscriptInspectOptions = {
	inputIndex?: string
	referenceFile?: string
	referenceIndex?: string
}

/** Classify a file via the Rust `inspect_bytes` path. Never a JS reimplementation. */
export async function inspectBytes(
	name: string,
	bytes: Uint8Array,
	options: BioscriptInspectOptions = {},
): Promise<BioscriptInspection> {
	const mod = await loadBioscriptWasm()
	const optionsJson = Object.keys(options).length
		? JSON.stringify({
			input_index: options.inputIndex ?? null,
			reference_file: options.referenceFile ?? null,
			reference_index: options.referenceIndex ?? null,
		})
		: ''
	const json = mod.inspectBytes(name, bytes, optionsJson || null)
	return JSON.parse(json) as BioscriptInspection
}

// === Variant lookup (CRAM + VCF, both via the same Worker) ==================

export type VariantSpec = {
	name: string
	chrom: string
	pos: number
	ref: string
	alt: string
	rsid?: string
	assembly?: 'grch37' | 'grch38'
}

export type VariantObservation = {
	name: string
	backend: string
	matchedRsid?: string
	assembly?: 'grch37' | 'grch38'
	genotype?: string
	refCount?: number
	altCount?: number
	depth?: number
	rawCounts: Record<string, number>
	decision?: string
	evidence: string[]
}

export type VariantLookupResult = {
	observations: VariantObservation[]
	durationMs: number
}

export type CramVariantSpec = VariantSpec
export type CramVariantObservation = VariantObservation
export type CramVariantLookupResult = VariantLookupResult

export type CramVariantLookupInput = {
	cramFile: File
	craiBytes: Uint8Array
	fastaFile: File
	faiBytes: Uint8Array
	variants: VariantSpec[]
}

export type VcfVariantLookupInput = {
	vcfFile: File
	tbiBytes: Uint8Array
	variants: VariantSpec[]
}

type WorkerLookupCramRequest = {
	type: 'lookupCram'
	requestId: number
	wasmUrl: string
	cramFile: File
	craiBytes: Uint8Array
	fastaFile: File
	faiBytes: Uint8Array
	variantsJson: string
}

type WorkerLookupVcfRequest = {
	type: 'lookupVcf'
	requestId: number
	wasmUrl: string
	vcfFile: File
	tbiBytes: Uint8Array
	variantsJson: string
}

type WorkerResponseDone = { type: 'done'; requestId: number; resultJson: string; durationMs: number }
type WorkerResponseError = { type: 'error'; requestId: number; error: string }
type WorkerResponse = WorkerResponseDone | WorkerResponseError

let sharedWorker: Worker | null = null
let nextLookupRequestId = 1
const pendingLookupRequests = new Map<
	number,
	{ resolve: (r: VariantLookupResult) => void; reject: (err: Error) => void }
>()

function ensureLookupWorker(): Worker {
	if (Platform.OS !== 'web') {
		throw new Error('variant lookup is only available on web')
	}
	if (sharedWorker) return sharedWorker
	if (typeof Worker === 'undefined') {
		throw new Error('Web Worker not available in this environment')
	}
	const worker = new Worker(new URL('./workers/bioscriptLookupWorker', window.location.href))
	worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
		const msg = event.data
		const pending = pendingLookupRequests.get(msg.requestId)
		if (!pending) return
		pendingLookupRequests.delete(msg.requestId)
		if (msg.type === 'done') {
			pending.resolve({
				observations: JSON.parse(msg.resultJson) as VariantObservation[],
				durationMs: msg.durationMs,
			})
		} else {
			pending.reject(new Error(msg.error))
		}
	}
	worker.onerror = (event) => {
		console.error('[BioscriptWasm] lookup worker crashed', event)
		for (const [id, pending] of pendingLookupRequests.entries()) {
			pending.reject(new Error(`lookup worker error: ${event.message ?? 'unknown'}`))
			pendingLookupRequests.delete(id)
		}
		sharedWorker = null
	}
	sharedWorker = worker
	return worker
}

function resolveWorkerUrls(): { wasmUrl: string } {
	return { wasmUrl: getBioscriptWasmUrl() }
}

function serializeVariants(variants: VariantSpec[]): string {
	return JSON.stringify(
		variants.map((v) => ({
			name: v.name,
			chrom: v.chrom,
			pos: v.pos,
			ref: v.ref,
			alt: v.alt,
			rsid: v.rsid ?? null,
			assembly: v.assembly ?? null,
		})),
	)
}

/**
 * Look up SNP variants against an indexed CRAM + reference FASTA. The heavy
 * lifting happens inside a Web Worker that owns the wasm-bindgen instance
 * and uses `FileReaderSync` to provide synchronous `readAt` callbacks into
 * the Rust-side `JsReader`. On native/desktop this throws — use the FFI
 * path there.
 */
export async function lookupCramVariants(
	input: CramVariantLookupInput,
): Promise<VariantLookupResult> {
	const worker = ensureLookupWorker()
	const { wasmUrl } = resolveWorkerUrls()
	const requestId = nextLookupRequestId++
	const variantsJson = serializeVariants(input.variants)
	return new Promise<VariantLookupResult>((resolve, reject) => {
		pendingLookupRequests.set(requestId, { resolve, reject })
		const req: WorkerLookupCramRequest = {
			type: 'lookupCram',
			requestId,
			wasmUrl,
			cramFile: input.cramFile,
			craiBytes: input.craiBytes,
			fastaFile: input.fastaFile,
			faiBytes: input.faiBytes,
			variantsJson,
		}
		worker.postMessage(req)
	})
}

/**
 * Look up SNP variants against a bgzipped, tabix-indexed VCF. Same worker +
 * FileReaderSync plumbing as `lookupCramVariants`; only the index and the
 * wasm export differ.
 */
export async function lookupVcfVariants(
	input: VcfVariantLookupInput,
): Promise<VariantLookupResult> {
	const worker = ensureLookupWorker()
	const { wasmUrl } = resolveWorkerUrls()
	const requestId = nextLookupRequestId++
	const variantsJson = serializeVariants(input.variants)
	return new Promise<VariantLookupResult>((resolve, reject) => {
		pendingLookupRequests.set(requestId, { resolve, reject })
		const req: WorkerLookupVcfRequest = {
			type: 'lookupVcf',
			requestId,
			wasmUrl,
			vcfFile: input.vcfFile,
			tbiBytes: input.tbiBytes,
			variantsJson,
		}
		worker.postMessage(req)
	})
}
