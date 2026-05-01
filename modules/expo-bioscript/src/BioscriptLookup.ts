import type {
	BioscriptInspectOptions,
	BioscriptInspection,
	BioscriptRemoteDependency,
	BioscriptRemoteResourceResolution,
	CramVariantObservation,
	CramVariantLookupInput,
	CramVariantLookupResult,
	CramVariantSpec,
	VariantLookupResult,
	VariantObservation,
	VariantSpec,
	VcfVariantLookupInput,
} from './BioscriptWasm'

function nativeOnly(name: string): never {
	throw new Error(`${name} is not wired to the native Rust BioScript module yet`)
}

export type {
	BioscriptInspectOptions,
	BioscriptInspection,
	BioscriptRemoteDependency,
	BioscriptRemoteResourceResolution,
	CramVariantObservation,
	CramVariantLookupInput,
	CramVariantLookupResult,
	CramVariantSpec,
	VariantLookupResult,
	VariantObservation,
	VariantSpec,
	VcfVariantLookupInput,
}

export async function inspectBytes(
	_name: string,
	_bytes: Uint8Array,
	_options: BioscriptInspectOptions = {},
): Promise<BioscriptInspection> {
	nativeOnly('inspectBytes')
}

export async function compileVariantYamlText(_name: string, _text: string): Promise<VariantSpec[]> {
	nativeOnly('compileVariantYamlText')
}

export async function lookupGenotypeBytesVariants(
	_name: string,
	_bytes: Uint8Array,
	_variants: VariantSpec[],
): Promise<VariantLookupResult> {
	nativeOnly('lookupGenotypeBytesVariants')
}

export async function lookupCramVariants(_input: CramVariantLookupInput): Promise<CramVariantLookupResult> {
	nativeOnly('lookupCramVariants')
}

export async function lookupVcfVariants(_input: VcfVariantLookupInput): Promise<VariantLookupResult> {
	nativeOnly('lookupVcfVariants')
}

export async function lookupGenotypeBytesRsids(
	_name: string,
	_bytes: Uint8Array,
	_rsids: string[],
): Promise<(string | null)[]> {
	nativeOnly('lookupGenotypeBytesRsids')
}

export async function resolveRemoteResourceText(
	_sourceUrl: string,
	_name: string,
	_text: string,
): Promise<BioscriptRemoteResourceResolution> {
	nativeOnly('resolveRemoteResourceText')
}

export async function warmupBioscriptLookupWorker(): Promise<void> {}
