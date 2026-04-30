export type LabTestGenomeKind = 'genotype_text' | 'zip' | 'cram' | 'vcf'

export type LabTestScenario = {
	id: string
	title: string
	genomeKind: LabTestGenomeKind
	fixturePaths: string[]
	expectedGenomeName: string
	expectedStatus: string
	optional?: boolean
	missingMessage?: string
	zipSourcePath?: string
}

export const labTestFixtures = {
	apol1Text: 'tests/fixtures/apol1-g0g0.txt',
	apol1Cram: [
		'exvitae/assays/risk/APOL1/test-data/apol1.cram',
		'exvitae/assays/risk/APOL1/test-data/apol1.cram.crai',
		'exvitae/assays/risk/APOL1/test-data/stub.fa',
		'exvitae/assays/risk/APOL1/test-data/stub.fa.fai',
	],
	optionalVcf: [
		'test-data/1k-genomes/vcf/NA06985.clean.vcf.gz',
		'test-data/1k-genomes/vcf/NA06985.clean.vcf.gz.tbi',
	],
} as const

export const labFormatMatrixScenarios: LabTestScenario[] = [
	{
		id: 'apol1-text',
		title: 'Python APOL1 assay runs against genotype text',
		genomeKind: 'genotype_text',
		fixturePaths: [labTestFixtures.apol1Text],
		expectedGenomeName: 'apol1-g0g0.txt',
		expectedStatus: 'G0/G0',
	},
	{
		id: 'apol1-zip',
		title: 'Python APOL1 assay runs against zipped genotype text',
		genomeKind: 'zip',
		fixturePaths: [],
		zipSourcePath: labTestFixtures.apol1Text,
		expectedGenomeName: 'apol1-g0g0.zip',
		expectedStatus: 'G0/G0',
	},
	{
		id: 'apol1-cram',
		title: 'Python APOL1 assay runs against indexed CRAM',
		genomeKind: 'cram',
		fixturePaths: [...labTestFixtures.apol1Cram],
		expectedGenomeName: 'apol1.cram',
		expectedStatus: 'G0/G0',
	},
	{
		id: 'apol1-vcf',
		title: 'Python APOL1 assay runs against indexed VCF when local test-data is present',
		genomeKind: 'vcf',
		fixturePaths: [...labTestFixtures.optionalVcf],
		expectedGenomeName: 'NA06985.clean.vcf.gz',
		expectedStatus: 'G-/G-',
		optional: true,
		missingMessage: 'missing optional VCF fixture; run ./tools/fetch_test_data.sh to enable',
	},
]
