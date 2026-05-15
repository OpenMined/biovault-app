/// <reference types="node" />

import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'

export type LabTestGenomeKind = 'genotype_text' | 'zip' | 'cram' | 'bam' | 'vcf'
export type LabTestPlatform = 'web' | 'desktop' | 'ios' | 'android'
export type LabTestAction = 'run_assay' | 'persistent_handles' | 'app_smoke' | 'file_picker' | 'drag_drop' | 'sample_preset' | 'report_matrix'
export type LabTestSource = 'local' | 'url'

export type SharedLabTestScenario = {
	id: string
	title: string
	platforms: LabTestPlatform[]
	capabilities: string[]
	action: LabTestAction
	assay: {
		source: LabTestSource
		language: 'python' | 'yaml'
		path: string
	} | null
	genome: {
		source: LabTestSource
		kind: LabTestGenomeKind
		files: string[]
		expectDisplayName: string
		zipSourcePath?: string
	} | null
	maestro?: {
		presetId?: string
		expectGenome?: string
		expectAssay?: string
	}
	reportMatrix?: {
		samplesFile: string
		privateSamplesFile?: string
		assayManifest?: string
		packageZip: string
		packageUrl: string
		maxDragBytes?: number
		requireArtifacts?: string[]
		htmlContains?: string[]
		reportStatus?: string[]
	}
	assert: {
		contains: string
		notContains?: string[]
	}
	notes?: string
	optional?: boolean
	missingMessage?: string
}

export type LabFormatMatrixScenario = {
	id: string
	title: string
	assayPath: string | null
	genomeKind: LabTestGenomeKind
	fixturePaths: string[]
	expectedGenomeName: string
	expectedStatus: string
	optional?: boolean
	missingMessage?: string
	zipSourcePath?: string
}

const SCENARIO_FILE = path.resolve(__dirname, 'lab-scenarios.yaml')

type RawScenario = {
	id: string
	title: string
	platforms: LabTestPlatform[]
	capabilities?: string[]
	action: LabTestAction
	assay?: NonNullable<SharedLabTestScenario['assay']>
	genome?: {
		source: LabTestSource
		kind: LabTestGenomeKind
		files?: string[]
		expect_display_name: string
		zip_source_path?: string
	}
	maestro?: SharedLabTestScenario['maestro']
	report_matrix?: {
		samples_file: string
		private_samples_file?: string
		assay_manifest?: string
		package_zip: string
		package_url: string
		max_drag_bytes?: number
		require_artifacts?: string[]
		html_contains?: string[]
		report_status?: string[]
	}
	assert: {
		contains: string
		not_contains?: string[]
	}
	notes?: string
	optional?: boolean
	missing_message?: string
}

const doc = parse(fs.readFileSync(SCENARIO_FILE, 'utf8')) as { scenarios: RawScenario[] }

export const sharedLabTestScenarios: SharedLabTestScenario[] = doc.scenarios.map((scenario) => ({
	id: scenario.id,
	title: scenario.title,
	platforms: scenario.platforms,
	capabilities: scenario.capabilities ?? [],
	action: scenario.action,
	assay: scenario.assay ?? null,
	genome: scenario.genome
		? {
				source: scenario.genome.source,
				kind: scenario.genome.kind,
				files: scenario.genome.files ?? [],
				expectDisplayName: scenario.genome.expect_display_name,
				zipSourcePath: scenario.genome.zip_source_path,
			}
		: null,
	maestro: scenario.maestro,
	reportMatrix: scenario.report_matrix
		? {
				samplesFile: scenario.report_matrix.samples_file,
				privateSamplesFile: scenario.report_matrix.private_samples_file,
				assayManifest: scenario.report_matrix.assay_manifest,
				packageZip: scenario.report_matrix.package_zip,
				packageUrl: scenario.report_matrix.package_url,
				maxDragBytes: scenario.report_matrix.max_drag_bytes,
				requireArtifacts: scenario.report_matrix.require_artifacts,
				htmlContains: scenario.report_matrix.html_contains,
				reportStatus: scenario.report_matrix.report_status,
			}
		: undefined,
	assert: {
		contains: scenario.assert.contains,
		notContains: scenario.assert.not_contains,
	},
	notes: scenario.notes,
	optional: scenario.optional,
	missingMessage: scenario.missing_message,
}))

export const labTestFixtures = {
	apol1Text: 'tests/fixtures/apol1-g0g0.txt',
	apol1Cram: [
		'test-data/apol1/apol1.cram',
		'test-data/apol1/apol1.cram.crai',
		'test-data/apol1/stub.fa',
		'test-data/apol1/stub.fa.fai',
	],
	apol1Bam: [
		'test-data/apol1/apol1.bam',
		'test-data/apol1/apol1.bam.bai',
		'test-data/apol1/stub.fa',
		'test-data/apol1/stub.fa.fai',
	],
	optionalVcf: [
		'test-data/1k-genomes/vcf/NA06985.clean.vcf.gz',
		'test-data/1k-genomes/vcf/NA06985.clean.vcf.gz.tbi',
	],
} as const

export const webLabRunScenarios = sharedLabTestScenarios.filter(
	(scenario) => scenario.platforms.includes('web') && scenario.action === 'run_assay' && scenario.genome,
)

export const desktopLabRunScenarios = sharedLabTestScenarios.filter(
	(scenario) => scenario.platforms.includes('desktop') && scenario.action === 'run_assay' && scenario.genome,
)

export const webPersistentHandleScenarios = sharedLabTestScenarios.filter(
	(scenario) => scenario.platforms.includes('web') && scenario.action === 'persistent_handles',
)

export const webReportMatrixScenarios = sharedLabTestScenarios.filter(
	(scenario) => scenario.platforms.includes('web') && scenario.action === 'report_matrix' && scenario.reportMatrix,
)

export const labFormatMatrixScenarios: LabFormatMatrixScenario[] = webLabRunScenarios.map((scenario) => ({
	id: scenario.id,
	title: scenario.title,
	assayPath: scenario.assay?.path ?? null,
	genomeKind: scenario.genome?.kind ?? 'genotype_text',
	fixturePaths: scenario.genome?.files ?? [],
	expectedGenomeName: scenario.genome?.expectDisplayName ?? '',
	expectedStatus: scenario.assert.contains,
	optional: scenario.optional,
	missingMessage: scenario.missingMessage,
	zipSourcePath: scenario.genome?.zipSourcePath,
}))
