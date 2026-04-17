import type {
	Assay,
	AssayLang,
	CramGenome,
	FileKind,
	Genome,
	UnknownEntry,
	VcfGenome,
} from '@/lib/lab/types'

export function classifyLabFile(name: string): FileKind {
	const lower = name.toLowerCase()
	if (lower.endsWith('.cram.crai') || lower.endsWith('.crai')) return 'crai'
	if (lower.endsWith('.cram')) return 'cram'
	if (lower.endsWith('.vcf.gz.tbi') || lower.endsWith('.tbi')) return 'tbi'
	if (lower.endsWith('.vcf.gz') || lower.endsWith('.vcf.bgz')) return 'vcf_gz'
	if (lower.endsWith('.fa.fai') || lower.endsWith('.fasta.fai')) return 'fai'
	if (lower.endsWith('.fa') || lower.endsWith('.fasta')) return 'fasta'
	if (lower.endsWith('.py')) return 'assay_python'
	if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'assay_yaml'
	if (lower.endsWith('.zip')) return 'zip'
	if (
		lower.endsWith('.txt') ||
		lower.endsWith('.tsv') ||
		lower.endsWith('.csv') ||
		lower.endsWith('.vcf')
	) {
		return 'genotype_text'
	}
	return 'unknown'
}

export function stripGenomeSuffix(name: string): string {
	const lower = name.toLowerCase()
	if (lower.endsWith('.cram.crai')) return name.slice(0, -5)
	if (lower.endsWith('.crai')) return name.slice(0, -5)
	if (lower.endsWith('.vcf.gz.tbi')) return name.slice(0, -4)
	if (lower.endsWith('.tbi')) return name.slice(0, -4)
	if (lower.endsWith('.fa.fai')) return name.slice(0, -4)
	if (lower.endsWith('.fasta.fai')) return name.slice(0, -4)
	if (lower.endsWith('.fai')) return name.slice(0, -4)
	return name
}

export function makeLabId(prefix: string) {
	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function createAssayFromFile(file: File, language: AssayLang, source?: string): Assay {
	return {
		id: makeLabId('assay'),
		name: file.name,
		file,
		language,
		source,
	}
}

export function appendAssay(assays: Assay[], assay: Assay): Assay[] {
	if (!assay.source) return [...assays, assay]
	return [...assays.filter((existing) => existing.source !== assay.source), assay]
}

export function createGenomeFromPrimaryFile(file: File, kind: Extract<FileKind, 'cram' | 'vcf_gz' | 'genotype_text' | 'zip'>): Genome {
	if (kind === 'cram') {
		return { id: makeLabId('cram'), kind: 'cram', primary: file }
	}
	if (kind === 'vcf_gz') {
		return { id: makeLabId('vcf'), kind: 'vcf', primary: file }
	}
	if (kind === 'genotype_text') {
		return { id: makeLabId('text'), kind: 'text', primary: file }
	}
	return { id: makeLabId('zip'), kind: 'zip', primary: file }
}

export function createUnknownEntry(file: File): UnknownEntry {
	return { id: makeLabId('unk'), file }
}

export function pairCompanionFile(genomes: Genome[], file: File, kind: Extract<FileKind, 'crai' | 'tbi' | 'fai' | 'fasta'>): Genome[] {
	const stem = stripGenomeSuffix(file.name).toLowerCase()
	const next = genomes.map((genome) => ({ ...genome }))

	if (kind === 'crai') {
		const target =
			next.find((genome) => genome.kind === 'cram' && genome.primary.name.toLowerCase() === stem) ??
			next.find((genome) => genome.kind === 'cram' && !(genome as CramGenome).crai)
		if (target?.kind === 'cram') target.crai = file
		return next
	}

	if (kind === 'tbi') {
		const target =
			next.find((genome) => genome.kind === 'vcf' && genome.primary.name.toLowerCase() === stem) ??
			next.find((genome) => genome.kind === 'vcf' && !(genome as VcfGenome).tbi)
		if (target?.kind === 'vcf') target.tbi = file
		return next
	}

	if (kind === 'fai') {
		const named = next.find(
			(genome) =>
				genome.kind === 'cram' && (genome as CramGenome).fasta?.name.toLowerCase() === stem,
		) as CramGenome | undefined
		if (named) {
			named.fai = file
			return next
		}
		for (const genome of next) {
			if (genome.kind === 'cram' && !genome.fai) {
				genome.fai = file
				return next
			}
		}
		return next
	}

	for (const genome of next) {
		if (genome.kind === 'cram' && !genome.fasta) {
			genome.fasta = file
		}
	}
	return next
}

export function sortFilesForIngestion(files: File[]): File[] {
	return [...files].sort((a, b) => {
		const kindA = classifyLabFile(a.name)
		const kindB = classifyLabFile(b.name)
		const isPrimary = (kind: FileKind) =>
			kind === 'cram' || kind === 'vcf_gz' || kind === 'genotype_text' || kind === 'zip'
		if (isPrimary(kindA) && !isPrimary(kindB)) return -1
		if (isPrimary(kindB) && !isPrimary(kindA)) return 1
		return 0
	})
}

export function genomeDisplayName(genome: Genome): string {
	return genome.primary.name
}

export function genomeKindLabel(genome: Genome): string {
	switch (genome.kind) {
		case 'cram': return 'CRAM alignment'
		case 'vcf': return 'VCF (bgzipped, tabix-indexed)'
		case 'text': return 'Genotype text'
		case 'zip': return 'Zipped genotype (23andMe etc.)'
	}
}

export function missingGenomeSlots(genome: Genome): string[] {
	if (genome.kind === 'cram') {
		const missing: string[] = []
		if (!genome.crai) missing.push('.cram.crai index')
		if (!genome.fasta) missing.push('reference .fa')
		if (!genome.fai) missing.push('.fa.fai index')
		return missing
	}
	if (genome.kind === 'vcf') {
		return genome.tbi ? [] : ['.vcf.gz.tbi index']
	}
	return []
}

export function isGenomeComplete(genome: Genome): boolean {
	return missingGenomeSlots(genome).length === 0
}

export function genomeBytesTotal(genome: Genome): number {
	if (genome.kind === 'cram') {
		return genome.primary.size + (genome.crai?.size ?? 0) + (genome.fasta?.size ?? 0) + (genome.fai?.size ?? 0)
	}
	if (genome.kind === 'vcf') {
		return genome.primary.size + (genome.tbi?.size ?? 0)
	}
	return genome.primary.size
}

export function humanLabSize(bytes: number): string {
	if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} GB`
	if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
	if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`
	return `${bytes} B`
}
