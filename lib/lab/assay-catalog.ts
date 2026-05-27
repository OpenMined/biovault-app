import type { FileKind } from '@/lib/lab/core/file-kind'
import { createLabMemoryFile } from '@/lib/lab/platform-file'
import { gunzipSync } from 'fflate'
import exampleResources from './example-resources.json'

export type AssayCategory = 'risk' | 'pharmacogenomics' | 'ancestry' | 'panel' | 'demo'

export const ASSAY_CATEGORY_LABELS: Record<AssayCategory, string> = {
	risk: 'Risk variants',
	pharmacogenomics: 'Pharmacogenomics',
	ancestry: 'Ancestry',
	panel: 'Panels',
	demo: 'Demos',
}

export type AssayInputFormat = 'cram' | 'vcf_gz' | 'genotype_text' | 'zip'

export const ASSAY_INPUT_FORMAT_LABELS: Record<AssayInputFormat, string> = {
	cram: 'CRAM',
	vcf_gz: 'VCF',
	genotype_text: '23andMe-style text',
	zip: 'Zip',
}

export type LabAssay = {
	id: string
	title: string
	subtitle?: string
	description: string
	category: AssayCategory
	language: 'python' | 'yaml'
	remoteResourceUrl?: string
	url: string
	inputFormats: AssayInputFormat[]
	tags?: string[]
}

export type LabTestFileBundle = {
	id: string
	title: string
	description: string
	format: AssayInputFormat
	files: { name: string; kind: Exclude<FileKind, 'unknown'>; sizeBytes?: number; url: string }[]
	archive?: {
		format: 'split-tar-gz'
		expectedSizeBytes?: number
		outputName: string
		parts: { name: string; sizeBytes?: number; url: string }[]
	}
	remoteUrl?: string
}

export type LabTestFileBundleLoadProgress = {
	label: string
	loadedBytes: number
	totalBytes: number | null
}

export type LoadTestFileBundleOptions = {
	onProgress?: (progress: LabTestFileBundleLoadProgress) => void
}

// ---------------------------------------------------------------------------
// Assay catalog — grows to 100s of entries. Keep entries lean; heavy metadata
// lives in the assay file itself. Search + category filters are what scales
// this surface, not inline descriptions.
// ---------------------------------------------------------------------------

export const LAB_ASSAYS: LabAssay[] = exampleResources.assays as LabAssay[]

// ---------------------------------------------------------------------------
// Test file bundles — a small curated set so people without data can try
// assays. This stays a short list (handful of entries) because it's manually
// curated and large files are expensive to host.
// ---------------------------------------------------------------------------

export const LAB_TEST_FILES: LabTestFileBundle[] = exampleResources.testFiles as LabTestFileBundle[]

// ---------------------------------------------------------------------------
// Lookup + search helpers
// ---------------------------------------------------------------------------

export function getAssayById(id: string | null | undefined): LabAssay | null {
	if (!id) return null
	return LAB_ASSAYS.find((a) => a.id === id) ?? null
}

export function getTestFileById(id: string | null | undefined): LabTestFileBundle | null {
	if (!id) return null
	return LAB_TEST_FILES.find((t) => t.id === id) ?? null
}

export function getCompatibleTestFiles(assay: LabAssay): LabTestFileBundle[] {
	return LAB_TEST_FILES.filter((t) => assay.inputFormats.includes(t.format))
}

export function searchAssays(query: string, category: AssayCategory | null): LabAssay[] {
	const q = query.trim().toLowerCase()
	return LAB_ASSAYS.filter((a) => {
		if (category && a.category !== category) return false
		if (!q) return true
		const hay = [
			a.title,
			a.subtitle ?? '',
			a.description,
			...(a.tags ?? []),
		]
			.join(' ')
			.toLowerCase()
		return hay.includes(q)
	})
}

export function listAssayCategories(): AssayCategory[] {
	const seen = new Set<AssayCategory>()
	for (const a of LAB_ASSAYS) seen.add(a.category)
	return Array.from(seen)
}

// ---------------------------------------------------------------------------
// File loaders (fetch-to-File, mirroring sample-data)
// ---------------------------------------------------------------------------

function guessMimeType(name: string): string {
	const lower = name.toLowerCase()
	if (lower.endsWith('.py')) return 'text/x-python'
	if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'application/yaml'
	if (lower.endsWith('.fa') || lower.endsWith('.fasta') || lower.endsWith('.fai'))
		return 'text/plain'
	return 'application/octet-stream'
}

async function fetchToFile(name: string, url: string): Promise<File> {
	const response = await fetch(url)
	if (!response.ok) throw new Error(`Failed to fetch ${name}: ${response.status}`)
	const bytes = await response.arrayBuffer()
	return createLabMemoryFile(name, new Uint8Array(bytes), guessMimeType(name))
}

async function fetchBytes(
	name: string,
	url: string,
	onProgress?: (loadedBytes: number) => void,
): Promise<Uint8Array> {
	const response = await fetch(url)
	if (!response.ok) throw new Error(`Failed to fetch ${name}: ${response.status}`)
	if (!response.body) {
		const bytes = new Uint8Array(await response.arrayBuffer())
		onProgress?.(bytes.byteLength)
		return bytes
	}
	const reader = response.body.getReader()
	const chunks: Uint8Array[] = []
	let loaded = 0
	for (;;) {
		const { done, value } = await reader.read()
		if (done) break
		if (!value) continue
		chunks.push(value)
		loaded += value.byteLength
		onProgress?.(loaded)
	}
	return concatBytes(chunks)
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
	const size = parts.reduce((sum, part) => sum + part.byteLength, 0)
	const out = new Uint8Array(size)
	let offset = 0
	for (const part of parts) {
		out.set(part, offset)
		offset += part.byteLength
	}
	return out
}

function trimNullPaddedAscii(bytes: Uint8Array): string {
	const end = bytes.indexOf(0)
	return new TextDecoder().decode(end >= 0 ? bytes.slice(0, end) : bytes).trim()
}

function parseTarSize(bytes: Uint8Array): number {
	const text = trimNullPaddedAscii(bytes)
	return text ? Number.parseInt(text, 8) : 0
}

function extractTarFile(tarBytes: Uint8Array, outputName: string): Uint8Array {
	const blockSize = 512
	for (let offset = 0; offset + blockSize <= tarBytes.byteLength;) {
		const header = tarBytes.slice(offset, offset + blockSize)
		if (header.every((byte) => byte === 0)) break

		const name = trimNullPaddedAscii(header.slice(0, 100))
		const prefix = trimNullPaddedAscii(header.slice(345, 500))
		const path = prefix ? `${prefix}/${name}` : name
		const size = parseTarSize(header.slice(124, 136))
		const typeflag = header[156]
		const bodyStart = offset + blockSize
		const bodyEnd = bodyStart + size
		const isRegularFile = typeflag === 0 || typeflag === 48
		if (isRegularFile && (path === outputName || path.endsWith(`/${outputName}`))) {
			return tarBytes.slice(bodyStart, bodyEnd)
		}

		offset = bodyStart + Math.ceil(size / blockSize) * blockSize
	}
	throw new Error(`Archive did not contain ${outputName}`)
}

async function loadSplitTarGzBundle(
	bundle: LabTestFileBundle,
	options: LoadTestFileBundleOptions,
	progressOffset: { loadedBytes: number; totalBytes: number | null },
): Promise<File[]> {
	const archive = bundle.archive
	if (!archive) return []
	const parts: Uint8Array[] = []
	for (const part of archive.parts) {
		let previousPartLoaded = 0
		const bytes = await fetchBytes(part.name, part.url, (partLoaded) => {
			const delta = partLoaded - previousPartLoaded
			previousPartLoaded = partLoaded
			progressOffset.loadedBytes += delta
			options.onProgress?.({
				label: `Downloading ${part.name}`,
				loadedBytes: progressOffset.loadedBytes,
				totalBytes: progressOffset.totalBytes,
			})
		})
		parts.push(bytes)
	}
	const tarBytes = gunzipSync(concatBytes(parts))
	const extracted = extractTarFile(tarBytes, archive.outputName)
	if (archive.expectedSizeBytes && extracted.byteLength !== archive.expectedSizeBytes) {
		throw new Error(
			`${archive.outputName} extracted to ${extracted.byteLength} bytes, expected ${archive.expectedSizeBytes} bytes.`,
		)
	}
	return [createLabMemoryFile(archive.outputName, extracted, guessMimeType(archive.outputName))]
}

export async function loadAssayFile(assay: LabAssay): Promise<File> {
	const name = assay.url.split('/').pop() ?? `${assay.id}.${assay.language === 'python' ? 'py' : 'yaml'}`
	return fetchToFile(name, assay.url)
}

export async function loadTestFileBundle(
	bundle: LabTestFileBundle,
	options: LoadTestFileBundleOptions = {},
): Promise<File[]> {
	const archiveOutputName = bundle.archive?.outputName
	const directEntries = bundle.files.filter((f) => f.name !== archiveOutputName)
	const totalBytes = [
		...(bundle.archive?.parts ?? []).map((part) => part.sizeBytes),
		...directEntries.map((file) => file.sizeBytes),
	].every((size): size is number => typeof size === 'number')
		? [...(bundle.archive?.parts ?? []), ...directEntries].reduce((sum, entry) => sum + (entry.sizeBytes ?? 0), 0)
		: null
	const progressOffset = { loadedBytes: 0, totalBytes }
	options.onProgress?.({ label: `Preparing ${bundle.title}`, loadedBytes: 0, totalBytes })
	const archiveFiles = await loadSplitTarGzBundle(bundle, options, progressOffset)
	const directFiles: File[] = []
	for (const entry of directEntries) {
		let previousFileLoaded = 0
		const bytes = await fetchBytes(entry.name, entry.url, (fileLoaded) => {
			const delta = fileLoaded - previousFileLoaded
			previousFileLoaded = fileLoaded
			progressOffset.loadedBytes += delta
			options.onProgress?.({
				label: `Downloading ${entry.name}`,
				loadedBytes: progressOffset.loadedBytes,
				totalBytes,
			})
		})
		directFiles.push(createLabMemoryFile(entry.name, bytes, guessMimeType(entry.name)))
	}
	return [...archiveFiles, ...directFiles]
}
