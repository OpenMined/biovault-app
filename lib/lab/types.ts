import type { FileKind } from '@/lib/lab/core/file-kind'
import type { VariantObservation } from '@/lib/lab/bioscript-runtime'

export type { FileKind }

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

export type LabRunArtifact = {
	mimeType: string
	name: string
	path?: string
	text: string
}

export type RunResult = {
	status: RunStatus
	artifacts?: LabRunArtifact[]
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
