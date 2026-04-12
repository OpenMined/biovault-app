import { Directory, File, Paths } from 'expo-file-system'
import { writeAsStringAsync } from 'expo-file-system/legacy'

export type GenomeImportStage = 'detecting' | 'parsing' | 'saving' | 'complete'

export interface PreparedGenomeImport {
	uri: string
	originalName: string
	suggestedName: string
	source: 'device' | 'url' | 'sample'
}

export const SAMPLE_GENOME_FILE = `# BioVault sample genome data
# This is a small 23andMe-style demo file for onboarding only.
rsid	chromosome	position	genotype
rs12913832	15	28365618	CC
rs1801260	4	56411998	CT
rs671	12	112241766	AG
rs1229984	4	100239319	AG
rs762551	15	75041917	AC
rs4988235	2	136608646	AA
`

function ensureImportDirectory() {
	const importsDirectory = new Directory(Paths.cache, 'genome-imports')
	if (!importsDirectory.exists) {
		importsDirectory.create({ idempotent: true, intermediates: true })
	}
	return importsDirectory
}

function sanitizeFileName(name: string): string {
	return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer)
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
	let result = ''

	for (let index = 0; index < bytes.length; index += 3) {
		const first = bytes[index] ?? 0
		const second = bytes[index + 1]
		const third = bytes[index + 2]

		const chunk = (first << 16) | ((second ?? 0) << 8) | (third ?? 0)

		result += chars[(chunk >> 18) & 63]
		result += chars[(chunk >> 12) & 63]
		result += second === undefined ? '=' : chars[(chunk >> 6) & 63]
		result += third === undefined ? '=' : chars[chunk & 63]
	}

	return result
}

function getSuggestedName(name: string): string {
	return name
		.replace(/\.(vcf\.gz|vcf\.bz2|tsv\.bz2|zip|txt|vcf|tsv|csv|gz|bz2)$/i, '')
		.replace(/\s+/g, '_')
		.replace(/[^a-zA-Z0-9_-]/g, '')
		.replace(/_+/g, '_')
		.replace(/-+/g, '-')
		.replace(/^[_-]+|[_-]+$/g, '')
}

function inferFileNameFromUrl(url: string): string {
	try {
		const parsed = new URL(url)
		const lastSegment = parsed.pathname.split('/').filter(Boolean).pop()
		if (lastSegment) {
			return decodeURIComponent(lastSegment)
		}
	} catch {
		// Fall back to a generic filename below.
	}

	return `genome-${Date.now()}.txt`
}

export function sanitizeGenomeName(name: string): string {
	const sanitized = getSuggestedName(name.trim())
	return sanitized.length > 0 ? sanitized : `genome_${Date.now()}`
}

export function preparePickedGenomeImport(uri: string, originalName: string): PreparedGenomeImport {
	return {
		uri,
		originalName,
		suggestedName: sanitizeGenomeName(originalName),
		source: 'device',
	}
}

export async function prepareUrlGenomeImport(url: string): Promise<PreparedGenomeImport> {
	const normalizedUrl = url.trim()
	if (!/^https?:\/\//i.test(normalizedUrl)) {
		throw new Error('Enter a full `http://` or `https://` URL.')
	}

	const response = await fetch(normalizedUrl)
	if (!response.ok) {
		throw new Error(`Download failed with status ${response.status}.`)
	}

	const importsDirectory = ensureImportDirectory()
	const inferredName = inferFileNameFromUrl(normalizedUrl)
	const targetFile = new File(
		importsDirectory,
		`${Date.now()}-${sanitizeFileName(inferredName || 'genome-download.txt')}`
	)
	const bytes = await response.arrayBuffer()

	await writeAsStringAsync(targetFile.uri, arrayBufferToBase64(bytes), {
		encoding: 'base64' as never,
	})

	return {
		uri: targetFile.uri,
		originalName: inferredName,
		suggestedName: sanitizeGenomeName(inferredName),
		source: 'url',
	}
}

export async function prepareSampleGenomeImport(): Promise<PreparedGenomeImport> {
	const importsDirectory = ensureImportDirectory()
	const targetFile = new File(importsDirectory, `sample-23andme-${Date.now()}.txt`)

	await writeAsStringAsync(targetFile.uri, SAMPLE_GENOME_FILE)

	return {
		uri: targetFile.uri,
		originalName: 'biovault_sample_23andme.txt',
		suggestedName: 'biovault_sample_23andme',
		source: 'sample',
	}
}

export async function ensureBuiltInSampleGenomeImport(): Promise<PreparedGenomeImport> {
	const importsDirectory = ensureImportDirectory()
	const targetFile = new File(importsDirectory, 'biovault-demo-genome.txt')

	if (!targetFile.exists) {
		await writeAsStringAsync(targetFile.uri, SAMPLE_GENOME_FILE)
	}

	return {
		uri: targetFile.uri,
		originalName: 'biovault_sample_23andme.txt',
		suggestedName: 'biovault_sample_23andme',
		source: 'sample',
	}
}

export async function processPreparedGenomeImport(
	preparedImport: PreparedGenomeImport,
	customName: string,
	onStageChange?: (stage: GenomeImportStage, message: string) => void
): Promise<void> {
	console.warn('Genome import is temporarily disabled while SQLite-backed storage is disabled.', {
		preparedImport,
		customName,
	})
	onStageChange?.('detecting', 'Genome import is temporarily unavailable.')
	throw new Error('Genome import is temporarily disabled while SQLite-backed storage is disabled.')
}
