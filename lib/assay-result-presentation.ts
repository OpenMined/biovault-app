import type { AssayManifest } from '@/lib/assay-manifests'
import type { StoredTestRun, TestResultStatus } from '@/lib/test-results'

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

	const matchedRows = latestRun.rows.filter((row) => row.status === 'matched')
	const normalRows = latestRun.rows.filter((row) => row.status === 'normal')
	const missingRows = latestRun.rows.filter((row) => row.status === 'missing')

	if (matchedRows.length > 0) {
		return {
			headline:
				matchedRows.length === 1
					? assay.resultSummary.matchHeadlineSingular
					: assay.resultSummary.matchHeadlinePlural ?? assay.resultSummary.matchHeadlineSingular,
			body: assay.resultSummary.matchBody,
			caveat:
				missingRows.length > 0
					? assay.resultSummary.matchCaveat ??
						`${missingRows.length} expected checks were missing from the file, so this is a partial result.`
					: assay.resultSummary.matchCaveat ?? null,
		}
	}

	if (normalRows.length > 0 && missingRows.length === 0) {
		return {
			headline: assay.resultSummary.normalHeadline,
			body: assay.resultSummary.normalBody,
			caveat: null,
		}
	}

	if (missingRows.length > 0 && normalRows.length === 0) {
		return {
			headline: assay.resultSummary.missingHeadline,
			body: assay.resultSummary.missingBody,
			caveat: assay.resultSummary.missingCaveat ?? 'Try a different file or a whole-genome format if you have one.',
		}
	}

	return {
		headline: assay.resultSummary.partialHeadline,
		body: assay.resultSummary.partialBody,
		caveat:
			assay.resultSummary.partialCaveat ??
			(missingRows.length > 0 ? `${missingRows.length} rows were missing from the file.` : null),
	}
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
