import type {
	Assay,
	AssayLang,
	UnknownEntry,
} from '@/lib/lab/types'
import type { FileKind } from '@/lib/lab/core/file-kind'
import {
	classifyLabFile,
	humanLabSize,
	makeLabId,
	stripGenomeSuffix,
} from '@/lib/lab/core/file-utils'

export { classifyLabFile, humanLabSize, makeLabId, stripGenomeSuffix }

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

export function createUnknownEntry(file: File): UnknownEntry {
	return { id: makeLabId('unk'), file }
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
