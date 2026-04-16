// Single entrypoint to the bioscript-wasm bundle on web. The actual loader and
// bindings are emitted by wasm-pack at build time (see
// modules/expo-bioscript/scripts/build-bioscript-wasm.sh), and live inside
// src/bioscript-wasm/ so Metro resolves the relative imports against the module
// tree rather than node_modules/.
//
// All file-format, assay, and lookup logic lives in bioscript — the JS side
// just marshals bytes in and JSON out. See
// docs/architecture/bioscript-is-source-of-truth.md.

import { Asset } from 'expo-asset'

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
