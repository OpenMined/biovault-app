// Single entrypoint to the bioscript-wasm bundle on web. The actual loader and
// bindings are emitted by wasm-pack at build time (see
// modules/expo-bioscript/scripts/build-bioscript-wasm.sh). This file wraps the
// lazy-load + type surface so the rest of the app doesn't need to know the
// package layout.
//
// All file-format, assay, and lookup logic lives in bioscript — the JS side
// just marshals bytes in and JSON out. See
// docs/architecture/bioscript-is-source-of-truth.md.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WasmModule = any

let wasmPromise: Promise<WasmModule> | null = null

async function loadBioscriptWasm(): Promise<WasmModule> {
	if (wasmPromise) return wasmPromise
	wasmPromise = (async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports
		const wasmAsset = require('../web-runtime/bioscript-wasm/bioscript_wasm_bg.wasm') as any
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { Asset } = require('expo-asset') as typeof import('expo-asset')
		const wasmUrl = Asset.fromModule(wasmAsset).uri
		// The wasm-pack "web" template exports `init(input)` as default. The
		// generated JS lives alongside the .wasm in the web-runtime folder.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const mod: any = await import(
			/* webpackIgnore: true */
			'../web-runtime/bioscript-wasm/bioscript_wasm.js'
		)
		await mod.default({ module_or_path: wasmUrl })
		return mod
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
		confidence: string
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
	const json = mod.inspectBytes(name, bytes, optionsJson)
	return JSON.parse(json) as BioscriptInspection
}
