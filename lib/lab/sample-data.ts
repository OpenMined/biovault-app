import type { FileKind } from '@/lib/lab/types'

export type LabSamplePreset = {
	id: string
	title: string
	description: string
	assayLabel: string
	genomeLabel: string
	files: {
		name: string
		url: string
		kind: Exclude<FileKind, 'unknown'>
	}[]
}

const REPO_RAW_BASE =
	'https://raw.githubusercontent.com/OpenMined/biovault-app/main'

export const LAB_SAMPLE_PRESETS: LabSamplePreset[] = [
	{
		id: 'apol1-fixture',
		title: 'APOL1 sample',
		description:
			'Try the APOL1 assay with sample genome files so you can see the lab flow before using your own data.',
		assayLabel: 'apol1.py',
		genomeLabel: 'apol1.cram',
		files: [
			{
				name: 'apol1.cram',
				url: `${REPO_RAW_BASE}/assays/risk/APOL1/test-data/apol1.cram`,
				kind: 'cram',
			},
			{
				name: 'apol1.cram.crai',
				url: `${REPO_RAW_BASE}/assays/risk/APOL1/test-data/apol1.cram.crai`,
				kind: 'crai',
			},
			{
				name: 'stub.fa',
				url: `${REPO_RAW_BASE}/assays/risk/APOL1/test-data/stub.fa`,
				kind: 'fasta',
			},
			{
				name: 'stub.fa.fai',
				url: `${REPO_RAW_BASE}/assays/risk/APOL1/test-data/stub.fa.fai`,
				kind: 'fai',
			},
			{
				name: 'apol1.py',
				url: `${REPO_RAW_BASE}/assays/risk/APOL1/apol1.py`,
				kind: 'assay_python',
			},
		],
	},
]

function guessMimeType(name: string): string {
	const lower = name.toLowerCase()
	if (lower.endsWith('.py')) return 'text/x-python'
	if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'application/yaml'
	if (lower.endsWith('.fa') || lower.endsWith('.fasta') || lower.endsWith('.fai')) return 'text/plain'
	return 'application/octet-stream'
}

export async function loadLabSamplePresetFiles(preset: LabSamplePreset): Promise<File[]> {
	const files = await Promise.all(
		preset.files.map(async (entry) => {
			const response = await fetch(entry.url)
			if (!response.ok) {
				throw new Error(`Failed to fetch ${entry.name}: ${response.status}`)
			}
			const bytes = await response.arrayBuffer()
			return new File([bytes], entry.name, {
				type: guessMimeType(entry.name),
			})
		}),
	)
	return files
}
