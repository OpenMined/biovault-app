/// <reference types="node" />

import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'

export type LabTestGenomeKind = 'genotype_text' | 'zip' | 'cram' | 'vcf'
export type LabTestPlatform = 'web' | 'desktop' | 'ios' | 'android'
export type LabTestAction = 'run_assay' | 'persistent_handles' | 'app_smoke' | 'file_picker' | 'drag_drop' | 'sample_preset'
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

export const webLabRunScenarios = sharedLabTestScenarios.filter(
	(scenario) => scenario.platforms.includes('web') && scenario.action === 'run_assay' && scenario.genome,
)

export const desktopLabRunScenarios = sharedLabTestScenarios.filter(
	(scenario) => scenario.platforms.includes('desktop') && scenario.action === 'run_assay' && scenario.genome,
)

export const webPersistentHandleScenarios = sharedLabTestScenarios.filter(
	(scenario) => scenario.platforms.includes('web') && scenario.action === 'persistent_handles',
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
