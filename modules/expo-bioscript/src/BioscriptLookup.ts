import type {
	BioscriptInspectOptions,
	BioscriptInspection,
	BioscriptPackageFile,
	BioscriptPackageReportOptions,
	BioscriptPackageReportResult,
	BioscriptPackageRelease,
	BioscriptPackageResolution,
	BioscriptPackageResource,
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
	BioscriptPackageFile,
	BioscriptPackageReportOptions,
	BioscriptPackageReportResult,
	BioscriptPackageRelease,
	BioscriptPackageResolution,
	BioscriptPackageResource,
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

export async function resolvePackageZipBytes(
	_sourceUrl: string,
	_name: string,
	_bytes: Uint8Array,
): Promise<BioscriptPackageResolution> {
	nativeOnly('resolvePackageZipBytes')
}

export async function resolvePackageReleaseText(
	_sourceUrl: string,
	_name: string,
	_text: string,
): Promise<BioscriptPackageRelease> {
	nativeOnly('resolvePackageReleaseText')
}

export async function verifyPackageArtifactSha256(
	_name: string,
	_bytes: Uint8Array,
	_expected: string,
): Promise<void> {
	nativeOnly('verifyPackageArtifactSha256')
}

export async function runPackageReportBytes(
	_manifestPath: string,
	_packageFiles: BioscriptPackageFile[],
	_inputName: string,
	_inputBytes: Uint8Array,
	_options: BioscriptPackageReportOptions = {},
): Promise<BioscriptPackageReportResult> {
	nativeOnly('runPackageReportBytes')
}

export async function runPackageReportFromCramFile(
	_manifestPath: string,
	_packageFiles: BioscriptPackageFile[],
	_inputName: string,
	_cramFile: File,
	_craiBytes: Uint8Array,
	_fastaFile: File,
	_faiBytes: Uint8Array,
	_options: BioscriptPackageReportOptions = {},
): Promise<BioscriptPackageReportResult> {
	nativeOnly('runPackageReportFromCramFile')
}

export async function runPackageReportFromVcfFile(
	_manifestPath: string,
	_packageFiles: BioscriptPackageFile[],
	_inputName: string,
	_vcfFile: File,
	_tbiBytes: Uint8Array,
	_options: BioscriptPackageReportOptions = {},
): Promise<BioscriptPackageReportResult> {
	nativeOnly('runPackageReportFromVcfFile')
}

export async function warmupBioscriptLookupWorker(): Promise<void> {}
