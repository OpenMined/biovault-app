import type { LabGenomeRef } from '@/lib/lab/core/refs'

export type AssayInputFormat = 'cram' | 'vcf_gz' | 'genotype_text' | 'zip'

export function labGenomeDisplayName(genome: LabGenomeRef): string {
	return genome.primary.name
}

export function labGenomeKindLabel(genome: LabGenomeRef): string {
	switch (genome.kind) {
		case 'cram': return genome.primary.kind === 'bam' ? 'BAM alignment' : 'CRAM alignment'
		case 'vcf': return 'VCF (bgzipped)'
		case 'text': return 'Genotype text'
		case 'zip': return 'Zipped genotype (23andMe etc.)'
	}
}

export function labGenomeInputFormat(genome: LabGenomeRef): AssayInputFormat {
	switch (genome.kind) {
		case 'cram': return 'cram'
		case 'vcf': return 'vcf_gz'
		case 'text': return 'genotype_text'
		case 'zip': return 'zip'
	}
}

export function missingLabGenomeSlots(genome: LabGenomeRef): string[] {
	if (genome.kind === 'cram') {
		const missing: string[] = []
		if (!genome.fasta) missing.push('reference .fa')
		return missing
	}
	if (genome.kind === 'vcf') {
		return []
	}
	return []
}

export function isLabGenomeComplete(genome: LabGenomeRef): boolean {
	return missingLabGenomeSlots(genome).length === 0
}

export function labGenomeBytesTotal(genome: LabGenomeRef): number {
	if (genome.kind === 'cram') {
		return genome.primary.size + (genome.crai?.size ?? 0) + (genome.fasta?.size ?? 0) + (genome.fai?.size ?? 0)
	}
	if (genome.kind === 'vcf') {
		return genome.primary.size + (genome.tbi?.size ?? 0)
	}
	return genome.primary.size
}
