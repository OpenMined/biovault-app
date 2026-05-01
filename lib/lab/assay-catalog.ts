import type { FileKind } from '@/lib/lab/core/file-kind'
import { loadBundledApol1Script } from '@/lib/lab/bundled-assay-assets'
import { createLabMemoryFile } from '@/lib/lab/platform-file'

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
	url: string
	inputFormats: AssayInputFormat[]
	tags?: string[]
}

export type LabTestFileBundle = {
	id: string
	title: string
	description: string
	format: AssayInputFormat
	files: { name: string; kind: Exclude<FileKind, 'unknown'>; url: string }[]
	remoteUrl?: string
}

const REPO_RAW_BASE = 'https://raw.githubusercontent.com/OpenMined/biovault-app/main'

function rawGitHubUrl(path: string) {
	return `${REPO_RAW_BASE}${path}`
}

// ---------------------------------------------------------------------------
// Assay catalog — grows to 100s of entries. Keep entries lean; heavy metadata
// lives in the assay file itself. Search + category filters are what scales
// this surface, not inline descriptions.
// ---------------------------------------------------------------------------

export const LAB_ASSAYS: LabAssay[] = [
	{
		id: 'apol1',
		title: 'APOL1 kidney risk',
		subtitle: 'G1 / G2 variants',
		description:
			'Detects the APOL1 G1 and G2 high-risk variants associated with chronic kidney disease.',
		category: 'risk',
		language: 'python',
		url: rawGitHubUrl('/exvitae/assays/risk/APOL1/apol1.py'),
		inputFormats: ['cram', 'vcf_gz', 'genotype_text', 'zip'],
		tags: ['kidney', 'APOL1', 'G1', 'G2', 'nephropathy'],
	},
]

// ---------------------------------------------------------------------------
// Test file bundles — a small curated set so people without data can try
// assays. This stays a short list (handful of entries) because it's manually
// curated and large files are expensive to host.
// ---------------------------------------------------------------------------

export const LAB_TEST_FILES: LabTestFileBundle[] = [
	{
		id: 'apol1-cram',
		title: 'APOL1 sample CRAM',
		description: 'Tiny CRAM bundle spanning the APOL1 region, plus reference and indexes.',
		format: 'cram',
		files: [
			{
				name: 'apol1.cram',
				url: rawGitHubUrl('/exvitae/assays/risk/APOL1/test-data/apol1.cram'),
				kind: 'cram',
			},
			{
				name: 'apol1.cram.crai',
				url: rawGitHubUrl('/exvitae/assays/risk/APOL1/test-data/apol1.cram.crai'),
				kind: 'crai',
			},
			{
				name: 'stub.fa',
				url: rawGitHubUrl('/exvitae/assays/risk/APOL1/test-data/stub.fa'),
				kind: 'fasta',
			},
			{
				name: 'stub.fa.fai',
				url: rawGitHubUrl('/exvitae/assays/risk/APOL1/test-data/stub.fa.fai'),
				kind: 'fai',
			},
		],
	},
	{
		id: 'biovault-23andme-sample',
		title: 'Sample 23andMe ZIP',
		description: 'A 23andMe v5 genome export from biovault-data. Downloads through the URL flow and caches in this browser if small enough.',
		format: 'zip',
		remoteUrl: 'https://github.com/OpenMined/biovault-data/blob/main/snp/23andme/v5/hu50B3F5/genome_hu50B3F5_v5_Full.zip',
		files: [
			{
				name: 'genome_hu50B3F5_v5_Full.zip',
				url: 'https://github.com/OpenMined/biovault-data/blob/main/snp/23andme/v5/hu50B3F5/genome_hu50B3F5_v5_Full.zip',
				kind: 'zip',
			},
		],
	},
]

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

export async function loadAssayFile(assay: LabAssay): Promise<File> {
	if (assay.id === 'apol1') {
		return createLabMemoryFile('apol1.py', await loadBundledApol1Script(), 'text/x-python')
	}
	const name = assay.url.split('/').pop() ?? `${assay.id}.${assay.language === 'python' ? 'py' : 'yaml'}`
	return fetchToFile(name, assay.url)
}

export async function loadTestFileBundle(bundle: LabTestFileBundle): Promise<File[]> {
	return Promise.all(bundle.files.map((f) => fetchToFile(f.name, f.url)))
}
