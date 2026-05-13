import type { FileKind } from '@/lib/lab/core/file-kind'

export function classifyLabFile(name: string): FileKind {
	const lower = name.toLowerCase()
	if (lower.endsWith('.bam.bai') || lower.endsWith('.bai')) return 'bai'
	if (lower.endsWith('.bam')) return 'bam'
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
	if (lower.endsWith('.bam.bai')) return name.slice(0, -4)
	if (lower.endsWith('.bai')) return name.slice(0, -4)
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

export function humanLabSize(bytes: number): string {
	if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} GB`
	if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
	if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`
	return `${bytes} B`
}
