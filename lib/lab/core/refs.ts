import { makeLabId, stripGenomeSuffix } from '@/lib/lab/core/file-utils'
import type { LabFileRef } from '@/lib/lab/core/files'

export type LabGenomeRef =
	| {
			id: string
			kind: 'text'
			primary: LabFileRef
	  }
	| {
			id: string
			kind: 'zip'
			primary: LabFileRef
	  }
	| {
			id: string
			kind: 'vcf'
			primary: LabFileRef
			tbi?: LabFileRef
	  }
	| {
			id: string
			kind: 'cram'
			primary: LabFileRef
			crai?: LabFileRef
			fasta?: LabFileRef
			fai?: LabFileRef
	  }

export type LabAssayRef = {
	file: LabFileRef
	id: string
	language: 'python' | 'yaml'
	name: string
	source?: string
}

export function createLabGenomeRefFromPrimary(primary: LabFileRef): LabGenomeRef | null {
	if (primary.kind === 'bam' || primary.kind === 'cram') return { id: makeLabId(primary.kind), kind: 'cram', primary }
	if (primary.kind === 'vcf_gz') return { id: makeLabId('vcf'), kind: 'vcf', primary }
	if (primary.kind === 'genotype_text') return { id: makeLabId('text'), kind: 'text', primary }
	if (primary.kind === 'zip') return { id: makeLabId('zip'), kind: 'zip', primary }
	return null
}

export function createLabAssayRef(file: LabFileRef, language: LabAssayRef['language'], source?: string): LabAssayRef {
	return {
		file,
		id: makeLabId('assay'),
		language,
		name: file.name,
		source,
	}
}

export function withLabGenomeRefId(genome: LabGenomeRef, id: string): LabGenomeRef {
	return { ...genome, id } as LabGenomeRef
}

export function pairLabGenomeCompanionRef(genomes: LabGenomeRef[], ref: LabFileRef): LabGenomeRef[] {
	const stem = stripGenomeSuffix(ref.name).toLowerCase()
	const next = genomes.map((genome) => ({ ...genome }))

	if (ref.kind === 'bai' || ref.kind === 'crai') {
		const target =
			next.find((genome) => genome.kind === 'cram' && genome.primary.name.toLowerCase() === stem) ??
			next.find((genome) => genome.kind === 'cram' && !genome.crai)
		if (target?.kind === 'cram') target.crai = ref
		return next as LabGenomeRef[]
	}

	if (ref.kind === 'tbi') {
		const target =
			next.find((genome) => genome.kind === 'vcf' && genome.primary.name.toLowerCase() === stem) ??
			next.find((genome) => genome.kind === 'vcf' && !genome.tbi)
		if (target?.kind === 'vcf') target.tbi = ref
		return next as LabGenomeRef[]
	}

	if (ref.kind === 'fai') {
		const named = next.find(
			(genome) => genome.kind === 'cram' && genome.fasta?.name.toLowerCase() === stem,
		)
		if (named?.kind === 'cram') {
			named.fai = ref
			return next as LabGenomeRef[]
		}
		for (const genome of next) {
			if (genome.kind === 'cram' && !genome.fai) {
				genome.fai = ref
				return next as LabGenomeRef[]
			}
		}
		return next as LabGenomeRef[]
	}

	if (ref.kind === 'fasta') {
		for (const genome of next) {
			if (genome.kind === 'cram' && !genome.fasta) {
				genome.fasta = ref
			}
		}
	}
	return next as LabGenomeRef[]
}
