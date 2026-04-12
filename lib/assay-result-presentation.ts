import type { AssayManifest } from '@/lib/assay-manifests'
import type { StoredTestRun, TestResultStatus } from '@/lib/test-results'

export type AssayRunSummary = {
	body: string
	caveat: string | null
	headline: string
}

export type GroupedResultRows = Array<{
	rows: StoredTestRun['rows']
	status: TestResultStatus
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

export function groupTestResultRows(latestRun: StoredTestRun | null): GroupedResultRows {
	if (!latestRun) {
		return []
	}

	return ['matched', 'normal', 'missing'].map((status) => ({
		status: status as TestResultStatus,
		rows: latestRun.rows.filter((row) => row.status === status),
	}))
}
