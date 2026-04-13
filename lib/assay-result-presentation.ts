import type { AssayManifest } from '@/lib/assay-manifests'
import type { StoredTestRun, TestResultStatus, TestRunOutcome } from '@/lib/test-results'

export type AssayRunSummary = {
	body: string
	caveat: string | null
	headline: string
}

export type GeneGroupedResultRows = Array<{
	gene: string
	totalCount: number
	groups: Array<{
		rows: StoredTestRun['rows']
		status: TestResultStatus
	}>
}>

export function describeLatestRun(assay: AssayManifest, latestRun: StoredTestRun | null): AssayRunSummary | null {
	if (!latestRun) {
		return null
	}

	const outcome = latestRun.outcome
	const matchedRows = latestRun.rows.filter((row) => row.status === 'matched')
	const missingRows = latestRun.rows.filter((row) => row.status === 'missing')

	if (outcome === 'matched') {
		return {
			headline: assay.interpretation.matched.headline,
			body: assay.interpretation.matched.body,
			caveat: summarizeCaveat(
				missingRows.length > 0
					? assay.interpretation.matched.caveat ??
						`${missingRows.length} expected checks were missing from the file, so this is a partial result.`
					: assay.interpretation.matched.caveat ?? null,
				latestRun.unsupportedVariants?.length ?? 0
			),
		}
	}

	if (outcome === 'normal') {
		return {
			headline: assay.interpretation.normal.headline,
			body: assay.interpretation.normal.body,
			caveat: summarizeCaveat(null, latestRun.unsupportedVariants?.length ?? 0),
		}
	}

	if (outcome === 'missing') {
		return {
			headline: assay.interpretation.missing.headline,
			body: assay.interpretation.missing.body,
			caveat: summarizeCaveat(
				assay.interpretation.missing.caveat ?? 'Try a different file or a whole-genome format if you have one.',
				latestRun.unsupportedVariants?.length ?? 0
			),
		}
	}

	return {
		headline: assay.interpretation.partial.headline,
		body: assay.interpretation.partial.body,
		caveat: summarizeCaveat(
			assay.interpretation.partial.caveat ??
				(missingRows.length > 0 ? `${missingRows.length} rows were missing from the file.` : null),
			latestRun.unsupportedVariants?.length ?? 0
		),
	}
}

function summarizeCaveat(base: string | null, unsupportedCount: number): string | null {
	if (unsupportedCount <= 0) {
		return base
	}

	const runtimeNote =
		unsupportedCount === 1
			? '1 assay member could not be executed on this device runtime yet.'
			: `${unsupportedCount} assay members could not be executed on this device runtime yet.`

	return base ? `${base} ${runtimeNote}` : runtimeNote
}

export function groupTestResultRows(latestRun: StoredTestRun | null): GeneGroupedResultRows {
	if (!latestRun) {
		return []
	}

	const rowsByGene = new Map<string, StoredTestRun['rows']>()

	for (const row of latestRun.rows) {
		const gene = row.gene.trim() || 'Unassigned'
		const existingRows = rowsByGene.get(gene) ?? []
		existingRows.push(row)
		rowsByGene.set(gene, existingRows)
	}

	return Array.from(rowsByGene.entries())
		.map(([gene, rows]) => ({
			gene,
			totalCount: rows.length,
			groups: ['matched', 'normal', 'missing'].map((status) => ({
				status: status as TestResultStatus,
				rows: rows.filter((row) => row.status === status),
			})),
		}))
		.sort((left, right) => {
			const rankStatus = (status: TestResultStatus) =>
				status === 'matched' ? 0 : status === 'normal' ? 1 : 2
			const leftBestStatus = left.groups.find((group) => group.rows.length)?.status ?? 'missing'
			const rightBestStatus = right.groups.find((group) => group.rows.length)?.status ?? 'missing'

			return rankStatus(leftBestStatus) - rankStatus(rightBestStatus) || left.gene.localeCompare(right.gene)
		})
}
