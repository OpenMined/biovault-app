import { getAppDb } from '@/lib/app-db'
import { getTestBySlug } from '@/lib/test-catalog'
import type { UnsupportedAssayVariant } from '@/modules/expo-bioscript'

export type TestResultStatus = 'matched' | 'normal' | 'missing'

export type StoredTestResultRow = {
	alts?: string[]
	gene: string
	kind: 'SNV' | 'INDEL'
	label: string
	location: string
	note: string
	ref?: string
	rsid?: string
	status: TestResultStatus
}

export type StoredTestRun = {
	id?: number
	inputDocumentId?: string | null
	inputLabel: string
	isPreview: boolean
	ranAt: string
	rows: StoredTestResultRow[]
	slug: string
	unsupportedVariants?: UnsupportedAssayVariant[]
}

export type RecentTestRunSummary = {
	id: number
	inputDocumentId?: string | null
	inputLabel: string
	isPreview: boolean
	ranAt: string
	rowCount: number
	slug: string
	testTitle: string
}

type RunRowRecord = {
	id: number
	input_document_id: string | null
	input_label: string
	is_preview: number
	ran_at: string
	slug: string
	unsupported_variants_json: string | null
}

type ResultRowRecord = {
	alts_json: string | null
	gene: string
	kind: 'SNV' | 'INDEL'
	label: string
	location: string
	note: string
	ref: string | null
	rsid: string | null
	status: TestResultStatus
}

type RecentRunRow = {
	id: number
	input_document_id: string | null
	slug: string
	input_label: string
	is_preview: number
	ran_at: string
	row_count: number
}

export async function saveLatestTestRun(run: StoredTestRun) {
	const db = await getAppDb()

	await db.withExclusiveTransactionAsync(async (txn) => {
		const inserted = await txn.runAsync(
			'INSERT INTO test_runs (slug, input_document_id, input_label, is_preview, ran_at, unsupported_variants_json) VALUES (?, ?, ?, ?, ?, ?)',
			run.slug,
			run.inputDocumentId ?? null,
			run.inputLabel,
			run.isPreview ? 1 : 0,
			run.ranAt,
			run.unsupportedVariants?.length ? JSON.stringify(run.unsupportedVariants) : null
		)

		const runId = inserted.lastInsertRowId
		for (const row of run.rows) {
			await txn.runAsync(
				`INSERT INTO test_result_rows
					(run_id, gene, label, rsid, location, kind, status, note, ref, alts_json)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				runId,
				row.gene,
				row.label,
				row.rsid ?? null,
				row.location,
				row.kind,
				row.status,
				row.note,
				row.ref ?? null,
				row.alts?.length ? JSON.stringify(row.alts) : null
			)
		}
	})
}

export async function loadLatestTestRun(
	slug: string,
	inputDocumentId?: string | null
): Promise<StoredTestRun | null> {
	const db = await getAppDb()
	const run =
		inputDocumentId === undefined
			? await db.getFirstAsync<RunRowRecord>(
					'SELECT id, slug, input_document_id, input_label, is_preview, ran_at, unsupported_variants_json FROM test_runs WHERE slug = ? ORDER BY ran_at DESC, id DESC LIMIT 1',
					slug
				)
			: inputDocumentId === null
				? await db.getFirstAsync<RunRowRecord>(
						'SELECT id, slug, input_document_id, input_label, is_preview, ran_at, unsupported_variants_json FROM test_runs WHERE slug = ? AND input_document_id IS NULL ORDER BY ran_at DESC, id DESC LIMIT 1',
						slug
					)
				: await db.getFirstAsync<RunRowRecord>(
						'SELECT id, slug, input_document_id, input_label, is_preview, ran_at, unsupported_variants_json FROM test_runs WHERE slug = ? AND input_document_id = ? ORDER BY ran_at DESC, id DESC LIMIT 1',
						slug,
						inputDocumentId
					)

	if (!run) {
		return null
	}

	const rows = await db.getAllAsync<ResultRowRecord>(
		`SELECT gene, label, rsid, location, kind, status, note, ref, alts_json
		 FROM test_result_rows
		 WHERE run_id = ?
		 ORDER BY id ASC`,
		run.id
	)

	return {
		id: run.id,
		inputDocumentId: run.input_document_id ?? null,
		slug: run.slug,
		inputLabel: run.input_label,
		isPreview: run.is_preview === 1,
		ranAt: run.ran_at,
		unsupportedVariants: run.unsupported_variants_json
			? safelyParseUnsupportedVariantsJson(run.unsupported_variants_json)
			: undefined,
		rows: rows.map((row) => ({
			gene: row.gene,
			label: row.label,
			rsid: row.rsid ?? undefined,
			location: row.location,
			kind: row.kind,
			status: row.status,
			note: row.note,
			ref: row.ref ?? undefined,
			alts: row.alts_json ? safelyParseAltJson(row.alts_json) : undefined,
		})),
	}
}

function safelyParseAltJson(value: string): string[] | undefined {
	try {
		const parsed = JSON.parse(value)
		return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : undefined
	} catch {
		return undefined
	}
}

function safelyParseUnsupportedVariantsJson(value: string): UnsupportedAssayVariant[] | undefined {
	try {
		const parsed = JSON.parse(value)
		if (!Array.isArray(parsed)) {
			return undefined
		}
		return parsed.filter(
			(item): item is UnsupportedAssayVariant =>
				!!item &&
				typeof item === 'object' &&
				typeof (item as UnsupportedAssayVariant).variantName === 'string' &&
				typeof (item as UnsupportedAssayVariant).target === 'string' &&
				typeof (item as UnsupportedAssayVariant).reason === 'string'
		)
	} catch {
		return undefined
	}
}

export async function listRecentTestRuns(limit = 20): Promise<RecentTestRunSummary[]> {
	const db = await getAppDb()
	const rows = await db.getAllAsync<RecentRunRow>(
		`SELECT
			r.id,
			r.input_document_id,
			r.slug,
			r.input_label,
			r.is_preview,
			r.ran_at,
			COUNT(rr.id) AS row_count
		FROM test_runs r
		LEFT JOIN test_result_rows rr ON rr.run_id = r.id
		GROUP BY r.id
		ORDER BY r.ran_at DESC, r.id DESC
		LIMIT ?`,
		limit
	)

	return rows.map((row) => {
		const test = getTestBySlug(row.slug)
		return {
			id: row.id,
			inputDocumentId: row.input_document_id ?? null,
			slug: row.slug,
			inputLabel: row.input_label,
			isPreview: row.is_preview === 1,
			ranAt: row.ran_at,
			rowCount: row.row_count,
			testTitle: test?.title ?? row.slug,
		}
	})
}

export async function listRecentTestRunsForInputDocument(
	inputDocumentId: string,
	limit = 10
): Promise<RecentTestRunSummary[]> {
	const db = await getAppDb()
	const rows = await db.getAllAsync<RecentRunRow>(
		`SELECT
			r.id,
			r.input_document_id,
			r.slug,
			r.input_label,
			r.is_preview,
			r.ran_at,
			COUNT(rr.id) AS row_count
		FROM test_runs r
		LEFT JOIN test_result_rows rr ON rr.run_id = r.id
		WHERE r.input_document_id = ?
		GROUP BY r.id
		ORDER BY r.ran_at DESC, r.id DESC
		LIMIT ?`,
		inputDocumentId,
		limit
	)

	return rows.map((row) => {
		const test = getTestBySlug(row.slug)
		return {
			id: row.id,
			inputDocumentId: row.input_document_id ?? null,
			slug: row.slug,
			inputLabel: row.input_label,
			isPreview: row.is_preview === 1,
			ranAt: row.ran_at,
			rowCount: row.row_count,
			testTitle: test?.title ?? row.slug,
		}
	})
}

export async function deleteResultsDatabase() {
	const db = await getAppDb()

	await db.withExclusiveTransactionAsync(async (txn) => {
		await txn.runAsync('DELETE FROM test_result_rows')
		await txn.runAsync('DELETE FROM test_runs')
	})
}
