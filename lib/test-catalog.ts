export type TestPrivacyLabel = {
	externalUrls: string[]
	reads: string[]
	runs: string[]
	storesResults: string
	usesBundledFiles: string[]
}

export type TestVariantExample = {
	gene: string
	items: Array<{
		id: string
		kind: 'SNV' | 'INDEL'
		location: string
		note: string
		rsid?: string
		status: 'matched' | 'normal' | 'missing'
	}>
}

export type TestCatalogEntry = {
	category: 'traits' | 'clinical' | 'research'
	description: string
	files: string[]
	privacy: TestPrivacyLabel
	resultBuckets: string[]
	runMode: 'bioscript' | 'preview'
	slug: string
	sources: string[]
	subtitle: string
	title: string
	variantExamples: TestVariantExample[]
}

export const testCatalog: TestCatalogEntry[] = [
	{
		slug: 'herc2-eye-color',
		category: 'traits',
		title: 'HERC2 eye color',
		subtitle:
			'An eye-color example based on the existing HERC2 Bioscript classifier in the repo examples.',
		description:
			'This test looks at the main HERC2 signal used in the existing Bioscript eye-color example and turns it into a simple, local-first result view.',
		files: ['bioscript/old/examples/herc2/classify_herc2.py'],
		sources: ['Bundled Bioscript definition only'],
		runMode: 'bioscript',
		privacy: {
			runs: ['On device through expo-bioscript'],
			reads: ['Your selected genomic file', 'Bundled HERC2 test definition'],
			usesBundledFiles: ['Yes'],
			externalUrls: [],
			storesResults: 'Locally in the BioVault database after the run completes',
		},
		resultBuckets: ['Matched', 'Normal', 'Missing from your data'],
		variantExamples: [
			{
				gene: 'HERC2',
				items: [
					{
						id: 'rs12913832',
						rsid: 'rs12913832',
						location: 'GRCh37 chr15:28365618',
						kind: 'SNV',
						status: 'matched',
						note: 'The blue-eye-associated signal was observed.',
					},
				],
			},
		],
	},
	{
		slug: 'apol1-status',
		category: 'clinical',
		title: 'APOL1 status',
		subtitle:
			'A real Bioscript script already lives in the repo and can run locally through expo-bioscript.',
		description:
			'This test checks the APOL1 G1 and G2 sites and derives an overall APOL1 status. It is the strongest current candidate for a true end-to-end local Bioscript run in the app.',
		files: ['bioscript/bioscripts/apol1.py'],
		sources: ['Bundled Bioscript definition only'],
		runMode: 'bioscript',
		privacy: {
			runs: ['On device through expo-bioscript'],
			reads: ['Your selected genomic file', 'Bundled APOL1 script'],
			usesBundledFiles: ['Yes'],
			externalUrls: [],
			storesResults: 'Locally in the BioVault database after the run completes',
		},
		resultBuckets: ['Matched', 'Normal', 'Missing from your data'],
		variantExamples: [
			{
				gene: 'APOL1',
				items: [
					{
						id: 'g1-site-1',
						rsid: 'rs73885319',
						location: 'GRCh37 chr22:36661906',
						kind: 'SNV',
						status: 'matched',
						note: 'Primary APOL1 G1 site.',
					},
					{
						id: 'g1-site-2',
						rsid: 'rs60910145',
						location: 'GRCh37 chr22:36662034',
						kind: 'SNV',
						status: 'normal',
						note: 'Second APOL1 G1 site.',
					},
					{
						id: 'g2-site',
						rsid: 'rs71785313',
						location: 'GRCh37 chr22:36662046-36662051',
						kind: 'INDEL',
						status: 'missing',
						note: 'Deletion-based APOL1 G2 site.',
					},
				],
			},
		],
	},
	{
		slug: 'thalassemia-variants',
		category: 'research',
		title: 'Thalassemia variants',
		subtitle:
			'A legacy Bioscript example driven by a bundled ClinVar TSV. Good for the privacy label and row model, but not fully ported to expo-bioscript yet.',
		description:
			'This test is based on the older thalassemia example in the repo. It is useful for designing grouped variant output, but still needs its asset-driven classifier ported into the app runtime.',
		files: [
			'bioscript/old/examples/thalassemia/classify_thalassemia.py',
			'bioscript/old/examples/thalassemia/thalassemia_clinvar.tsv',
		],
		sources: ['Bundled example files only'],
		runMode: 'preview',
		privacy: {
			runs: ['Preview rows only for now'],
			reads: ['Bundled example definitions'],
			usesBundledFiles: ['Yes'],
			externalUrls: [],
			storesResults: 'Locally in the BioVault database after the run completes',
		},
		resultBuckets: ['Matched variants', 'Normal/reference rows', 'Missing from your data'],
		variantExamples: [
			{
				gene: 'HBB',
				items: [
					{
						id: 'rs33985472',
						rsid: 'rs33985472',
						location: 'GRCh38 chr11:5225485',
						kind: 'SNV',
						status: 'matched',
						note: 'Example heterozygous thalassemia-associated variant.',
					},
					{
						id: 'rs34809925',
						rsid: 'rs34809925',
						location: 'GRCh38 chr11:5225592',
						kind: 'SNV',
						status: 'normal',
						note: 'Example reference or non-flagged row.',
					},
				],
			},
		],
	},
]

export function getTestBySlug(slug: string) {
	return testCatalog.find((entry) => entry.slug === slug) ?? null
}
