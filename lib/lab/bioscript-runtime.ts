import {
	compileVariantYamlText,
	lookupCramVariants,
	lookupGenotypeBytesVariants,
	lookupVcfVariants,
	runPackageReportBytes,
	runPackageReportFromCramFile,
	runPackageReportFromVcfFile,
	runFile,
	type BioscriptPackageFile,
	type BioscriptPackageReportOptions,
	type BioscriptPackageReportResult,
	type CramVariantLookupInput,
	type CramVariantLookupResult,
	type GenomeDescriptor,
	type RunFileRequest,
	type RunFileResult,
	type VariantLookupResult,
	type VariantObservation,
	type VariantSpec,
	type VcfVariantLookupInput,
} from '@/modules/expo-bioscript'

export type {
	GenomeDescriptor,
	RunFileRequest,
	RunFileResult,
	VariantObservation,
	VariantSpec,
	BioscriptPackageFile,
	BioscriptPackageReportOptions,
	BioscriptPackageReportResult,
}

export type LabBioscriptRuntime = {
	compileVariantYamlText: (fileName: string, yamlText: string) => Promise<VariantSpec[]>
	lookupCramVariants: (input: CramVariantLookupInput) => Promise<CramVariantLookupResult>
	lookupGenotypeBytesVariants: (
		fileName: string,
		bytes: Uint8Array,
		variants: VariantSpec[],
	) => Promise<VariantLookupResult>
	lookupVcfVariants: (input: VcfVariantLookupInput) => Promise<VariantLookupResult>
	runPackageReportBytes: (
		manifestPath: string,
		packageFiles: BioscriptPackageFile[],
		inputName: string,
		inputBytes: Uint8Array,
		options?: BioscriptPackageReportOptions,
	) => Promise<BioscriptPackageReportResult>
	runPackageReportFromCramFile: (
		manifestPath: string,
		packageFiles: BioscriptPackageFile[],
		inputName: string,
		cramFile: File,
		craiBytes: Uint8Array,
		fastaFile: File,
		faiBytes: Uint8Array,
		options?: BioscriptPackageReportOptions,
	) => Promise<BioscriptPackageReportResult>
	runPackageReportFromVcfFile: (
		manifestPath: string,
		packageFiles: BioscriptPackageFile[],
		inputName: string,
		vcfFile: File,
		tbiBytes: Uint8Array,
		options?: BioscriptPackageReportOptions,
	) => Promise<BioscriptPackageReportResult>
	runFile: (request: RunFileRequest) => Promise<RunFileResult>
}

export const expoBioscriptRuntime: LabBioscriptRuntime = {
	compileVariantYamlText,
	lookupCramVariants,
	lookupGenotypeBytesVariants,
	lookupVcfVariants,
	runPackageReportBytes,
	runPackageReportFromCramFile,
	runPackageReportFromVcfFile,
	runFile,
}
