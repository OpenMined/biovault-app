import type { LabFileAdapter, LabFileRef } from '@/lib/lab/core/files'
import { labGenomeBytesTotal, labGenomeInputFormat } from '@/lib/lab/core/genomes'
import type { LabGenomeRef } from '@/lib/lab/core/refs'

type InspectionSource = {
	confidence?: string
	evidence?: string[]
	platformVersion?: string
	vendor?: string
}

export type LabInputInspectionContext = {
	assembly?: string
	confidence?: string
	container?: string
	detectedKind?: string
	durationMs?: number
	evidence?: unknown[]
	fileName?: string
	hasIndex?: boolean
	phased?: boolean
	referenceMatches?: boolean
	selectedEntry?: string
	source?: InspectionSource
	warnings?: unknown[]
}

export type LabInputAnalyticsContext = Record<string, unknown>

type BuildLabInputAnalyticsContextOptions = {
	adapter?: Pick<LabFileAdapter, 'readBytes'>
	demoBundle?: {
		id: string
		title: string
		files: { name: string; kind: string }[]
	} | null
	hashFiles?: boolean
	inspection?: LabInputInspectionContext | null
}

export function buildLabInputAnalyticsContext(
	genome: LabGenomeRef,
	options: BuildLabInputAnalyticsContextOptions = {},
): LabInputAnalyticsContext {
	const relatedFiles = labGenomeRelatedRefs(genome)
	const primary = genome.primary
	const isDemo = Boolean(options.demoBundle) || relatedFiles.some((ref) => ref.source === 'bundled')
	const isUserSupplied = !isDemo && relatedFiles.some((ref) => ref.source === 'local' || ref.source === 'url')
	const inputSource = isDemo ? 'demo' : normalizeInputSource(primary.source)
	const extensions = relatedFiles.map((ref) => safeLabAnalyticsExtension(ref.name)).filter(Boolean)
	const kinds = relatedFiles.map((ref) => ref.kind)
	const sizes = relatedFiles.map((ref) => ref.size)
	const additionalFiles = relatedFiles.slice(1)
	const inspection = options.inspection ?? null
	const inputType = normalizeInputType(genome, inspection?.detectedKind)
	const context: LabInputAnalyticsContext = {
		input_id: `input-ref:${genome.id}`,
		input_source: inputSource,
		is_demo_file: isDemo,
		is_user_supplied_data: isUserSupplied,
		input_format: labGenomeInputFormat(genome),
		file_format: labGenomeInputFormat(genome),
		input_type: inputType,
		genomeKind: genome.kind,
		input_file_kinds: kinds,
		input_file_extensions: extensions,
		input_file_combo: extensions.length ? Array.from(new Set(extensions)).join(' + ') : '',
		input_primary_file_kind: primary.kind,
		input_primary_file_extension: safeLabAnalyticsExtension(primary.name),
		input_primary_file_size: primary.size,
		file_size: primary.size,
		input_total_file_size: labGenomeBytesTotal(genome),
		input_related_file_count: relatedFiles.length,
		input_related_file_kinds: kinds,
		input_related_file_sizes: sizes,
		input_additional_file_count: additionalFiles.length,
		input_additional_file_kinds: additionalFiles.map((ref) => ref.kind),
		input_additional_file_extensions: additionalFiles.map((ref) => safeLabAnalyticsExtension(ref.name)).filter(Boolean),
		input_additional_file_sizes: additionalFiles.map((ref) => ref.size),
		input_privacy_mode: isDemo ? 'demo_filename_allowed' : 'no_filename',
	}
	if (isDemo && options.demoBundle) {
		context.demo_bundle_id = options.demoBundle.id
		context.demo_title = options.demoBundle.title
		context.demo_filename = options.demoBundle.files.map((file) => file.name).join(',')
	}
	if (inspection) {
		const vendor = inspection.source?.vendor ?? ''
		const sourceVersion = inspection.source?.platformVersion ?? ''
		const is23AndMeImputed = vendor === '23andMe' && inspection.detectedKind === 'bcf' && /^r\d+$/i.test(sourceVersion)
		context.input_assembly = inspection.assembly ?? ''
		context.input_detected_kind = inspection.detectedKind ?? ''
		context.detectedKind = inspection.detectedKind ?? ''
		context.input_confidence = inspection.confidence ?? ''
		context.confidence = inspection.confidence ?? ''
		context.input_container = inspection.container ?? ''
		context.input_inspection_duration_ms = inspection.durationMs ?? 0
		context.input_evidence_count = inspection.evidence?.length ?? 0
		context.input_has_index = inspection.hasIndex ?? false
		context.input_phased = inspection.phased ?? false
		context.input_reference_matches = inspection.referenceMatches ?? false
		context.input_selected_entry_extension = inspection.selectedEntry ? safeLabAnalyticsExtension(inspection.selectedEntry) : ''
		context.selectedEntryExtension = context.input_selected_entry_extension
		context.input_vendor = vendor
		context.input_vendor_version = is23AndMeImputed ? '' : sourceVersion
		context.input_source_product = is23AndMeImputed ? '23andMe imputed genotype' : vendor
		context.input_source_type = is23AndMeImputed ? 'imputed' : (vendor ? 'direct_to_consumer' : '')
		context.input_imputation_version = is23AndMeImputed ? sourceVersion : ''
		context.input_source_confidence = inspection.source?.confidence ?? ''
		context.input_source_evidence_count = inspection.source?.evidence?.length ?? 0
		context.sourceVendor = vendor
		context.platformVersion = is23AndMeImputed ? '' : sourceVersion
		context.assembly = inspection.assembly ?? ''
	}
	return context
}

export async function buildHashedLabInputAnalyticsContext(
	genome: LabGenomeRef,
	options: BuildLabInputAnalyticsContextOptions,
): Promise<LabInputAnalyticsContext> {
	const context = buildLabInputAnalyticsContext(genome, options)
	if (!options.adapter || options.hashFiles === false) return context
	const relatedFiles = labGenomeRelatedRefs(genome)
	const hashed = await Promise.all(relatedFiles.map(async (ref) => {
		const bytes = await options.adapter!.readBytes(ref)
		return {
			hash: await sha256Hex(bytes),
			kind: ref.kind,
			size: ref.size,
		}
	}))
	const primaryHash = hashed[0]?.hash ?? ''
	if (primaryHash) {
		context.input_id = `sha256:${primaryHash}`
		context.input_hash_sha256 = primaryHash
		context.file_hash_sha256 = primaryHash
	}
	context.input_related_file_hashes_sha256 = hashed.map((entry) => entry.hash)
	context.input_additional_file_hashes_sha256 = hashed.slice(1).map((entry) => entry.hash)
	return context
}

export function labGenomeRelatedRefs(genome: LabGenomeRef): LabFileRef[] {
	if (genome.kind === 'cram') {
		return [genome.primary, genome.crai, genome.fasta, genome.fai].filter((ref): ref is LabFileRef => Boolean(ref))
	}
	if (genome.kind === 'vcf') return [genome.primary, genome.tbi].filter((ref): ref is LabFileRef => Boolean(ref))
	return [genome.primary]
}

export function safeLabAnalyticsExtension(name: string): string {
	const lower = name.toLowerCase()
	const knownExtensions = [
		'.vcf.gz.tbi',
		'.bam.bai',
		'.cram.crai',
		'.fasta.fai',
		'.fa.fai',
		'.vcf.gz',
		'.bcf',
		'.fasta',
		'.bam',
		'.bai',
		'.cram',
		'.crai',
		'.fai',
		'.vcf',
		'.zip',
		'.txt',
		'.tsv',
		'.csv',
		'.fa',
	]
	return knownExtensions.find((extension) => lower.endsWith(extension)) ?? (lower.match(/\.[a-z0-9]+$/)?.[0] ?? '')
}

function normalizeInputSource(source: LabFileRef['source']): string {
	if (source === 'bundled') return 'demo'
	if (source === 'local') return 'local'
	if (source === 'url') return 'url'
	return 'unknown'
}

function normalizeInputType(genome: LabGenomeRef, detectedKind?: string): string {
	if (detectedKind === 'alignment_bam') return 'bam'
	if (detectedKind === 'alignment_cram') return 'cram'
	if (detectedKind === 'vcf') return 'vcf'
	if (detectedKind === 'bcf') return 'bcf'
	if (detectedKind === 'genotype_text') return 'snp'
	if (genome.kind === 'cram') return genome.primary.kind === 'bam' ? 'bam' : 'cram'
	if (genome.kind === 'vcf') return 'vcf'
	if (genome.kind === 'text' || genome.kind === 'zip') return 'snp'
	return 'unknown'
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
	const subtle = globalThis.crypto?.subtle
	if (!subtle) return ''
	const input = new Uint8Array(bytes.byteLength)
	input.set(bytes)
	const digest = await subtle.digest('SHA-256', input.buffer)
	return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
