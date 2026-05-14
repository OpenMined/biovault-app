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

import { getBioscriptWasmUrl } from './webRuntimeAssets'

// Static imports so Metro bundles these. The wasm-pack "web" template emits
// ESM; Metro's ESM-to-CJS transform keeps the named exports intact.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const wasmJsModule = require('./bioscript-wasm/bioscript_wasm.js') as {
	default: (input?: { module_or_path: string | URL | Request }) => Promise<unknown>
	compileVariantYamlText: (name: string, text: string) => string
	generateBamBai: (name: string, bytes: Uint8Array) => Uint8Array
	generateBamBaiFromReader: (name: string, readAt: (offset: number, length: number) => Uint8Array, length: number) => Uint8Array
	generateCramCrai: (name: string, bytes: Uint8Array) => Uint8Array
	generateCramCraiFromReader: (name: string, readAt: (offset: number, length: number) => Uint8Array, length: number) => Uint8Array
	generateFastaFai: (name: string, bytes: Uint8Array) => Uint8Array
	generateFastaFaiFromReader: (name: string, readAt: (offset: number, length: number) => Uint8Array, length: number) => Uint8Array
	generateVcfTbi: (name: string, bytes: Uint8Array) => Uint8Array
	inspectBytes: (name: string, bytes: Uint8Array, optionsJson: string | null) => string
	lookupGenotypeBytesRsids: (name: string, bytes: Uint8Array, rsidsJson: string) => string
	lookupGenotypeBytesVariants: (name: string, bytes: Uint8Array, variantsJson: string) => string
	resolvePackageReleaseText: (sourceUrl: string, name: string, text: string) => string
	resolvePackageZipBytes: (sourceUrl: string, name: string, bytes: Uint8Array) => string
	resolveRemoteResourceText: (sourceUrl: string, name: string, text: string) => string
	runPackageReportBytes: (manifestPath: string, packageFilesJson: string, inputName: string, inputBytes: Uint8Array, optionsJson: string | null) => string
	verifyPackageArtifactSha256: (name: string, bytes: Uint8Array, expected: string) => void
}
let wasmPromise: Promise<typeof wasmJsModule> | null = null

async function loadBioscriptWasm(): Promise<typeof wasmJsModule> {
	if (wasmPromise) return wasmPromise
	wasmPromise = (async () => {
		const wasmUrl = getBioscriptWasmUrl()
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
	detectSex?: boolean
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
			detectSex: options.detectSex ?? false,
		})
		: ''
	const json = mod.inspectBytes(name, bytes, optionsJson || null)
	return JSON.parse(json) as BioscriptInspection
}

export type BioscriptRemoteDependency = {
	kind: string
	label: string
	optional: boolean
	url: string
	version?: string | null
}

export type BioscriptRemoteResourceResolution = {
	dependencies: BioscriptRemoteDependency[]
	kind: 'assay' | 'catalogue' | 'panel' | 'python' | 'unknown' | 'variant'
	name: string
	schema?: string | null
	sha256: string
	source_url: string
	title: string
	version?: string | null
}

export type BioscriptPackageFile = {
	contents: string
	path: string
	source_url?: string
	sourceUrl?: string
}

export type BioscriptPackageResource = {
	contents: string
	path: string
	resolution: BioscriptRemoteResourceResolution
}

export type BioscriptPackageResolution = {
	entrypoint: string
	files: BioscriptPackageFile[]
	name?: string | null
	resources: BioscriptPackageResource[]
}

export type BioscriptPackageRelease = {
	artifactSha256?: string | null
	artifactSizeBytes?: number | null
	artifactUrl: string
	entrypoint?: string | null
	name?: string | null
	title: string
	version?: string | null
}

export type BioscriptReportArtifact = {
	mimeType: string
	name: string
	path: string
	text: string
}

export type BioscriptPackageReportOptions = {
	analysisMaxDurationMs?: number
	detectSex?: boolean
	filters?: string[]
}

export type BioscriptPackageReportResult = {
	artifacts: BioscriptReportArtifact[]
	durationMs: number
	textOutput: string
}

export async function resolveRemoteResourceText(
	sourceUrl: string,
	name: string,
	text: string,
): Promise<BioscriptRemoteResourceResolution> {
	const mod = await loadBioscriptWasm()
	return JSON.parse(mod.resolveRemoteResourceText(sourceUrl, name, text)) as BioscriptRemoteResourceResolution
}

export async function resolvePackageZipBytes(
	sourceUrl: string,
	name: string,
	bytes: Uint8Array,
): Promise<BioscriptPackageResolution> {
	const mod = await loadBioscriptWasm()
	return JSON.parse(mod.resolvePackageZipBytes(sourceUrl, name, bytes)) as BioscriptPackageResolution
}

export async function resolvePackageReleaseText(
	sourceUrl: string,
	name: string,
	text: string,
): Promise<BioscriptPackageRelease> {
	const mod = await loadBioscriptWasm()
	return JSON.parse(mod.resolvePackageReleaseText(sourceUrl, name, text)) as BioscriptPackageRelease
}

export async function verifyPackageArtifactSha256(
	name: string,
	bytes: Uint8Array,
	expected: string,
): Promise<void> {
	const mod = await loadBioscriptWasm()
	mod.verifyPackageArtifactSha256(name, bytes, expected)
}

export async function runPackageReportBytes(
	manifestPath: string,
	packageFiles: BioscriptPackageFile[],
	inputName: string,
	inputBytes: Uint8Array,
	options: BioscriptPackageReportOptions = {},
): Promise<BioscriptPackageReportResult> {
	const worker = ensureLookupWorker()
	const { wasmUrl } = resolveWorkerUrls()
	const requestId = nextLookupRequestId++
	const optionsJson = JSON.stringify({
		analysisMaxDurationMs: options.analysisMaxDurationMs ?? 30_000,
		detectSex: options.detectSex ?? false,
		filters: options.filters ?? [],
	})
	return new Promise<BioscriptPackageReportResult>((resolve, reject) => {
		pendingLookupRequests.set(requestId, {
			resolve: (raw) => {
				try {
					resolve(JSON.parse(raw.resultJson ?? '') as BioscriptPackageReportResult)
				} catch (error) {
					reject(error instanceof Error ? error : new Error(String(error)))
				}
			},
			reject,
		})
		const req: WorkerReportFromBytesRequest = {
			type: 'reportFromBytes',
			requestId,
			wasmUrl,
			manifestPath,
			packageFilesJson: JSON.stringify(packageFiles),
			inputName,
			inputBytes,
			optionsJson,
		}
		const transferables: Transferable[] = inputBytes.buffer instanceof ArrayBuffer ? [inputBytes.buffer] : []
		worker.postMessage(req, transferables)
	})
}

// === Variant lookup (CRAM + VCF, both via the same Worker) ==================

export type VariantSpec = {
	name: string
	chrom: string
	pos?: number
	start: number
	end: number
	ref: string
	alt: string
	rsid?: string
	assembly?: 'grch37' | 'grch38'
	kind?: string
	deletion_length?: number
}

export async function compileVariantYamlText(name: string, text: string): Promise<VariantSpec[]> {
	const mod = await loadBioscriptWasm()
	return JSON.parse(mod.compileVariantYamlText(name, text)) as VariantSpec[]
}

export type VariantObservation = {
	name: string
	backend: string
	ref?: string
	alt?: string
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

type WorkerWarmupRequest = {
	type: 'warmup'
	requestId: number
	wasmUrl: string
}

type WorkerReportFromCramRequest = {
	type: 'reportFromCram'
	requestId: number
	wasmUrl: string
	manifestPath: string
	packageFilesJson: string
	inputName: string
	cramFile: File
	craiBytes: Uint8Array
	fastaFile: File
	faiBytes: Uint8Array
	optionsJson: string
}

type WorkerReportFromBamRequest = {
	type: 'reportFromBam'
	requestId: number
	wasmUrl: string
	manifestPath: string
	packageFilesJson: string
	inputName: string
	bamFile: File
	baiBytes: Uint8Array
	optionsJson: string
}

type WorkerReportFromVcfRequest = {
	type: 'reportFromVcf'
	requestId: number
	wasmUrl: string
	manifestPath: string
	packageFilesJson: string
	inputName: string
	vcfFile: File
	tbiBytes: Uint8Array
	optionsJson: string
}

type WorkerReportFromBytesRequest = {
	type: 'reportFromBytes'
	requestId: number
	wasmUrl: string
	manifestPath: string
	packageFilesJson: string
	inputName: string
	inputBytes: Uint8Array
	optionsJson: string
}

type WorkerGenerateVcfTbiRequest = {
	type: 'generateVcfTbi'
	requestId: number
	wasmUrl: string
	vcfFile: File
}

type WorkerGenerateIndexRequest = {
	type: 'generateBamBai' | 'generateCramCrai' | 'generateFastaFai'
	requestId: number
	wasmUrl: string
	file: File
}

type WorkerResponseDone = {
	type: 'done'
	requestId: number
	resultBytes?: Uint8Array
	resultJson?: string
	durationMs: number
}
type WorkerResponseError = { type: 'error'; requestId: number; error: string }
type WorkerResponse = WorkerResponseDone | WorkerResponseError

function cleanWorkerErrorMessage(error: string): string {
	const trimmed = error.trim()
	if (!trimmed) return 'BioScript worker failed.'
	const firstLine = trimmed.split('\n').map((line) => line.trim()).find(Boolean) ?? trimmed
	if (!isWasmInternalStack(firstLine)) return firstLine.replace(/^Error:\s*/, '')
	const useful = trimmed
		.split('\n')
		.map((line) => line.trim())
		.find((line) => line && !isWasmInternalStack(line))
	return useful?.replace(/^Error:\s*/, '') ?? 'BioScript worker failed inside the WebAssembly runtime.'
}

function isWasmInternalStack(line: string): boolean {
	return /wasm-function|bioscript_wasm\.wasm|__wbg_|bioscriptLookupWorker\.bundle|wasm_bindgen/.test(line)
}

let sharedWorker: Worker | null = null
let nextLookupRequestId = 1
const pendingLookupRequests = new Map<
	number,
	{
		resolve: (r: { resultBytes?: Uint8Array; resultJson?: string; durationMs: number }) => void
		reject: (err: Error) => void
	}
>()
let lookupWorkerWarmupPromise: Promise<void> | null = null

function ensureLookupWorker(): Worker {
	if (Platform.OS !== 'web') {
		throw new Error('variant lookup is only available on web')
	}
	if (sharedWorker) return sharedWorker
	if (typeof Worker === 'undefined') {
		throw new Error('Web Worker not available in this environment')
	}
	const worker = new Worker(new URL('./workers/bioscriptLookupWorker', window.location.href), {
		type: 'classic',
	})
	worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
		const msg = event.data
		const pending = pendingLookupRequests.get(msg.requestId)
		if (!pending) return
		pendingLookupRequests.delete(msg.requestId)
		if (msg.type === 'done') {
			pending.resolve({ resultBytes: msg.resultBytes, resultJson: msg.resultJson, durationMs: msg.durationMs })
		} else {
			const errorMessage = cleanWorkerErrorMessage(msg.error)
			if (isWasmMemoryTrap(errorMessage) || isWasmMemoryTrap(msg.error)) {
				console.warn('[BioscriptWasm] resetting lookup worker after wasm memory trap')
				worker.terminate()
				sharedWorker = null
				lookupWorkerWarmupPromise = null
			}
			pending.reject(new Error(errorMessage))
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

export async function generateVcfTbiFile(vcfFile: File): Promise<Uint8Array> {
	const worker = ensureLookupWorker()
	const { wasmUrl } = resolveWorkerUrls()
	const requestId = nextLookupRequestId++
	return new Promise<Uint8Array>((resolve, reject) => {
		pendingLookupRequests.set(requestId, {
			resolve: (raw) => {
				if (!raw.resultBytes) {
					reject(new Error('VCF index generation returned no bytes'))
					return
				}
				resolve(raw.resultBytes)
			},
			reject,
		})
		const req: WorkerGenerateVcfTbiRequest = {
			type: 'generateVcfTbi',
			requestId,
			wasmUrl,
			vcfFile,
		}
		worker.postMessage(req)
	})
}

export async function generateCramCraiFile(cramFile: File): Promise<Uint8Array> {
	return generateIndexBytes('generateCramCrai', cramFile)
}

export async function generateBamBaiFile(bamFile: File): Promise<Uint8Array> {
	return generateIndexBytes('generateBamBai', bamFile)
}

export async function generateFastaFaiFile(fastaFile: File): Promise<Uint8Array> {
	return generateIndexBytes('generateFastaFai', fastaFile)
}

function generateIndexBytes(type: WorkerGenerateIndexRequest['type'], file: File): Promise<Uint8Array> {
	const worker = ensureLookupWorker()
	const { wasmUrl } = resolveWorkerUrls()
	const requestId = nextLookupRequestId++
	return new Promise<Uint8Array>((resolve, reject) => {
		pendingLookupRequests.set(requestId, {
			resolve: (raw) => {
				if (!raw.resultBytes) {
					reject(new Error(`${type} returned no bytes`))
					return
				}
				resolve(raw.resultBytes)
			},
			reject,
		})
		const req: WorkerGenerateIndexRequest = {
			type,
			requestId,
			wasmUrl,
			file,
		}
		worker.postMessage(req)
	})
}

function isWasmMemoryTrap(message: string): boolean {
	return /memory access out of bounds|unreachable/i.test(message)
}

function resolveWorkerUrls(): { wasmUrl: string } {
	return { wasmUrl: getBioscriptWasmUrl() }
}

function serializeVariants(variants: VariantSpec[]): string {
	return JSON.stringify(
		variants.map((v) => ({
			name: v.name,
			chrom: v.chrom,
			start: v.start,
			end: v.end,
			ref: v.ref,
			alt: v.alt,
			rsid: v.rsid ?? null,
			assembly: v.assembly ?? null,
			kind: v.kind ?? null,
		})),
	)
}

export async function warmupBioscriptLookupWorker(): Promise<void> {
	if (lookupWorkerWarmupPromise) return lookupWorkerWarmupPromise
	const startedAt = Date.now()
	console.info('[bioscript] warmup lookup worker started')
	lookupWorkerWarmupPromise = new Promise<void>((resolve, reject) => {
		const worker = ensureLookupWorker()
		const { wasmUrl } = resolveWorkerUrls()
		const requestId = nextLookupRequestId++
		pendingLookupRequests.set(requestId, {
			resolve: () => resolve(),
			reject,
		})
		const req: WorkerWarmupRequest = {
			type: 'warmup',
			requestId,
			wasmUrl,
		}
		worker.postMessage(req)
	})
		.then(() => {
			console.info(`[bioscript] warmup lookup worker completed in ${Date.now() - startedAt} ms`)
		})
		.catch((error) => {
			console.warn(`[bioscript] warmup lookup worker failed after ${Date.now() - startedAt} ms`, error)
			lookupWorkerWarmupPromise = null
			throw error
		})
	return lookupWorkerWarmupPromise
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
		pendingLookupRequests.set(requestId, {
			resolve: (raw) => {
				try {
					resolve({
						observations: JSON.parse(raw.resultJson ?? '') as VariantObservation[],
						durationMs: raw.durationMs,
					})
				} catch (error) {
					reject(error instanceof Error ? error : new Error(String(error)))
				}
			},
			reject,
		})
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
 * Run the rust report against a CRAM input + FASTA reference. Same worker
 * plumbing as `lookupCramVariants` but produces the full 4-artifact report
 * (observations.tsv, analysis.jsonl, reports.jsonl, index.html) by walking
 * the package manifest and calling the rust observation pipeline.
 */
export async function runPackageReportFromCramFile(
	manifestPath: string,
	packageFiles: BioscriptPackageFile[],
	inputName: string,
	cramFile: File,
	craiBytes: Uint8Array,
	fastaFile: File,
	faiBytes: Uint8Array,
	options: BioscriptPackageReportOptions = {},
): Promise<BioscriptPackageReportResult> {
	const worker = ensureLookupWorker()
	const { wasmUrl } = resolveWorkerUrls()
	const requestId = nextLookupRequestId++
	const optionsJson = JSON.stringify({
		analysisMaxDurationMs: options.analysisMaxDurationMs ?? 30_000,
		detectSex: options.detectSex ?? false,
		filters: options.filters ?? [],
	})
	return new Promise<BioscriptPackageReportResult>((resolve, reject) => {
		pendingLookupRequests.set(requestId, {
			resolve: (raw) => {
				try {
					resolve(JSON.parse(raw.resultJson ?? '') as BioscriptPackageReportResult)
				} catch (error) {
					reject(error instanceof Error ? error : new Error(String(error)))
				}
			},
			reject,
		})
		const req: WorkerReportFromCramRequest = {
			type: 'reportFromCram',
			requestId,
			wasmUrl,
			manifestPath,
			packageFilesJson: JSON.stringify(packageFiles),
			inputName,
			cramFile,
			craiBytes,
			fastaFile,
			faiBytes,
			optionsJson,
		}
		worker.postMessage(req)
	})
}

/**
 * Run the rust report against a BAM input + BAI index.
 */
export async function runPackageReportFromBamFile(
	manifestPath: string,
	packageFiles: BioscriptPackageFile[],
	inputName: string,
	bamFile: File,
	baiBytes: Uint8Array,
	options: BioscriptPackageReportOptions = {},
): Promise<BioscriptPackageReportResult> {
	const worker = ensureLookupWorker()
	const { wasmUrl } = resolveWorkerUrls()
	const requestId = nextLookupRequestId++
	const optionsJson = JSON.stringify({
		analysisMaxDurationMs: options.analysisMaxDurationMs ?? 30_000,
		detectSex: options.detectSex ?? false,
		filters: options.filters ?? [],
	})
	return new Promise<BioscriptPackageReportResult>((resolve, reject) => {
		pendingLookupRequests.set(requestId, {
			resolve: (raw) => {
				try {
					resolve(JSON.parse(raw.resultJson ?? '') as BioscriptPackageReportResult)
				} catch (error) {
					reject(error instanceof Error ? error : new Error(String(error)))
				}
			},
			reject,
		})
		const req: WorkerReportFromBamRequest = {
			type: 'reportFromBam',
			requestId,
			wasmUrl,
			manifestPath,
			packageFilesJson: JSON.stringify(packageFiles),
			inputName,
			bamFile,
			baiBytes,
			optionsJson,
		}
		worker.postMessage(req)
	})
}

/**
 * Run the rust report against a bgzipped, tabix-indexed VCF. Mirrors
 * `runPackageReportFromCramFile` but for VCF inputs.
 */
export async function runPackageReportFromVcfFile(
	manifestPath: string,
	packageFiles: BioscriptPackageFile[],
	inputName: string,
	vcfFile: File,
	tbiBytes: Uint8Array,
	options: BioscriptPackageReportOptions = {},
): Promise<BioscriptPackageReportResult> {
	const worker = ensureLookupWorker()
	const { wasmUrl } = resolveWorkerUrls()
	const requestId = nextLookupRequestId++
	const optionsJson = JSON.stringify({
		analysisMaxDurationMs: options.analysisMaxDurationMs ?? 30_000,
		detectSex: options.detectSex ?? false,
		filters: options.filters ?? [],
	})
	return new Promise<BioscriptPackageReportResult>((resolve, reject) => {
		pendingLookupRequests.set(requestId, {
			resolve: (raw) => {
				try {
					resolve(JSON.parse(raw.resultJson ?? '') as BioscriptPackageReportResult)
				} catch (error) {
					reject(error instanceof Error ? error : new Error(String(error)))
				}
			},
			reject,
		})
		const req: WorkerReportFromVcfRequest = {
			type: 'reportFromVcf',
			requestId,
			wasmUrl,
			manifestPath,
			packageFilesJson: JSON.stringify(packageFiles),
			inputName,
			vcfFile,
			tbiBytes,
			optionsJson,
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
		pendingLookupRequests.set(requestId, {
			resolve: (raw) => {
				try {
					resolve({
						observations: JSON.parse(raw.resultJson ?? '') as VariantObservation[],
						durationMs: raw.durationMs,
					})
				} catch (error) {
					reject(error instanceof Error ? error : new Error(String(error)))
				}
			},
			reject,
		})
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

export async function lookupGenotypeBytesVariants(
	name: string,
	bytes: Uint8Array,
	variants: VariantSpec[],
): Promise<VariantLookupResult> {
	const mod = await loadBioscriptWasm()
	const startedAt = Date.now()
	const resultJson = mod.lookupGenotypeBytesVariants(name, bytes, serializeVariants(variants))
	return {
		observations: JSON.parse(resultJson) as VariantObservation[],
		durationMs: Date.now() - startedAt,
	}
}

export async function lookupGenotypeBytesRsids(
	name: string,
	bytes: Uint8Array,
	rsids: string[],
): Promise<(string | null)[]> {
	if (!rsids.length) return []
	const mod = await loadBioscriptWasm()
	return JSON.parse(mod.lookupGenotypeBytesRsids(name, bytes, JSON.stringify(rsids))) as (string | null)[]
}
