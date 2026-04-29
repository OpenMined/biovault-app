import type { GenomeDescriptor, VariantObservation } from '@/modules/expo-bioscript'

export type FileKind =
	| 'cram'
	| 'crai'
	| 'fasta'
	| 'fai'
	| 'vcf_gz'
	| 'tbi'
	| 'genotype_text'
	| 'zip'
	| 'assay_python'
	| 'assay_yaml'
	| 'unknown'

export type CramGenome = {
	id: string
	kind: 'cram'
	primary: File
	crai?: File
	fasta?: File
	fai?: File
}

export type VcfGenome = {
	id: string
	kind: 'vcf'
	primary: File
	tbi?: File
}

export type TextGenome = {
	id: string
	kind: 'text'
	primary: File
}

export type ZipGenome = {
	id: string
	kind: 'zip'
	primary: File
}

export type Genome = CramGenome | VcfGenome | TextGenome | ZipGenome

export type AssayLang = 'python' | 'yaml'

export type Assay = {
	id: string
	name: string
	file: File
	language: AssayLang
	source?: string
}

export type UnknownEntry = {
	id: string
	file: File
}

export type RunStatus = 'idle' | 'running' | 'done' | 'error'

export type LabRunProgress = {
	completed: number | null
	label?: string
	phase: 'preparing' | 'compiling' | 'running' | 'complete'
	total: number | null
}

export type RunResult = {
	status: RunStatus
	error?: string
	durationMs?: number
	observations?: VariantObservation[]
	progress?: LabRunProgress
	textOutput?: string
}

export type LabRunSuccess =
	| {
			kind: 'variant_lookup'
			result: RunResult
	  }
	| {
			kind: 'text_output'
			result: RunResult
	  }

export type BuildGenomeDescriptorResult = GenomeDescriptor
