import { classifyLabFile, makeLabId, stripGenomeSuffix } from '@/lib/lab/core/file-utils'
import type { FileKind } from '@/lib/lab/core/file-kind'
import type { LabFileRef } from '@/lib/lab/core/files'

export type LabFileGroupPlan = {
	groupId: string
	groupLabel: string
}

type PlannedGroup = LabFileGroupPlan & {
	crai?: string
	fai?: string
	fasta?: string
	kind: 'assay' | 'cram' | 'other' | 'vcf'
	names: string[]
	primary?: string
	tbi?: string
}

export function isPrimaryGenomeFileKind(kind: FileKind): boolean {
	return kind === 'bam' || kind === 'cram' || kind === 'vcf_gz' || kind === 'genotype_text' || kind === 'zip'
}

export function sortLabFileRefsForIngestion(refs: LabFileRef[]): LabFileRef[] {
	return [...refs].sort((a, b) => {
		if (isPrimaryGenomeFileKind(a.kind) && !isPrimaryGenomeFileKind(b.kind)) return -1
		if (isPrimaryGenomeFileKind(b.kind) && !isPrimaryGenomeFileKind(a.kind)) return 1
		return 0
	})
}

export function savedLabFileGroupKey(name: string): string {
	const kind = classifyLabFile(name)
	if (kind === 'bai' || kind === 'crai' || kind === 'tbi' || kind === 'fai') {
		return stripGenomeSuffix(name).toLowerCase()
	}
	if (kind === 'fasta') return name.toLowerCase()
	return stripGenomeSuffix(name).toLowerCase()
}

export function buildLabFileGroupPlan(refs: LabFileRef[]): Map<string, LabFileGroupPlan> {
	const groups: PlannedGroup[] = []
	const ordered = sortLabFileRefsForIngestion(refs)
	const addStandalone = (ref: LabFileRef, kind: PlannedGroup['kind'] = 'other') => {
		groups.push({
			groupId: makeLabId('drop-record'),
			groupLabel: ref.name,
			kind,
			names: [ref.name],
			primary: ref.name,
		})
	}

	for (const ref of ordered) {
		const kind = ref.kind
		if (kind === 'bam' || kind === 'cram') {
			addStandalone(ref, 'cram')
			continue
		}
		if (kind === 'vcf_gz') {
			addStandalone(ref, 'vcf')
			continue
		}
		if (kind === 'genotype_text' || kind === 'zip') {
			addStandalone(ref, 'other')
			continue
		}
		if (kind === 'assay_yaml' || kind === 'assay_python') {
			addStandalone(ref, 'assay')
			continue
		}
		if (kind === 'bai' || kind === 'crai') {
			const stem = stripGenomeSuffix(ref.name).toLowerCase()
			const target =
				groups.find((group) => group.kind === 'cram' && group.primary?.toLowerCase() === stem) ??
				groups.find((group) => group.kind === 'cram' && !group.crai)
			if (target) {
				target.crai = ref.name
				target.names.push(ref.name)
			} else {
				addStandalone(ref)
			}
			continue
		}
		if (kind === 'tbi') {
			const stem = stripGenomeSuffix(ref.name).toLowerCase()
			const target =
				groups.find((group) => group.kind === 'vcf' && group.primary?.toLowerCase() === stem) ??
				groups.find((group) => group.kind === 'vcf' && !group.tbi)
			if (target) {
				target.tbi = ref.name
				target.names.push(ref.name)
			} else {
				addStandalone(ref)
			}
			continue
		}
		if (kind === 'fasta') {
			const target = groups.find((group) => group.kind === 'cram' && !group.fasta)
			if (target) {
				target.fasta = ref.name
				target.names.push(ref.name)
			} else {
				addStandalone(ref)
			}
			continue
		}
		if (kind === 'fai') {
			const stem = stripGenomeSuffix(ref.name).toLowerCase()
			const target =
				groups.find((group) => group.kind === 'cram' && group.fasta?.toLowerCase() === stem) ??
				groups.find((group) => group.kind === 'cram' && !group.fai)
			if (target) {
				target.fai = ref.name
				target.names.push(ref.name)
			} else {
				addStandalone(ref)
			}
			continue
		}
		addStandalone(ref)
	}

	const plan = new Map<string, LabFileGroupPlan>()
	for (const group of groups) {
		for (const name of group.names) {
			plan.set(name, { groupId: group.groupId, groupLabel: group.groupLabel })
		}
	}
	return plan
}
