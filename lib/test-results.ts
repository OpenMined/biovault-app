import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite'
import { getTestBySlug } from '@/lib/test-catalog'

export type TestResultStatus = 'matched' | 'normal' | 'missing'

export type StoredTestResultRow = {
	gene: string
	kind: 'SNV' | 'INDEL'
	label: string
	location: string
	note: string
	rsid?: string
	status: TestResultStatus
}

export type StoredTestRun = {
	id?: number
	inputLabel: string
	isPreview: boolean
	ranAt: string
	rows: StoredTestResultRow[]
	slug: string
}

export type RecentTestRunSummary = {
	id: number
	inputLabel: string
	isPreview: boolean
	ranAt: string
	rowCount: number
	slug: string
	testTitle: string
}

let dbPromise: Promise<SQLiteDatabase> | null = null

async function getDb() {
	if (!dbPromise) {
		dbPromise = openDatabaseAsync('biovault-results.db')
	}

	const db = await dbPromise
	await db.execAsync(`
		PRAGMA journal_mode = WAL;
		CREATE TABLE IF NOT EXISTS test_runs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			slug TEXT NOT NULL,
			input_label TEXT NOT NULL,
			is_preview INTEGER NOT NULL DEFAULT 0,
			ran_at TEXT NOT NULL
		);
		CREATE TABLE IF NOT EXISTS test_result_rows (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			run_id INTEGER NOT NULL,
			gene TEXT NOT NULL,
			label TEXT NOT NULL,
			rsid TEXT,
			location TEXT NOT NULL,
			kind TEXT NOT NULL,
			status TEXT NOT NULL,
			note TEXT NOT NULL,
			FOREIGN KEY (run_id) REFERENCES test_runs (id) ON DELETE CASCADE
		);
		CREATE INDEX IF NOT EXISTS idx_test_runs_slug_ran_at ON test_runs (slug, ran_at DESC);
		CREATE INDEX IF NOT EXISTS idx_test_result_rows_run_id ON test_result_rows (run_id);
	`)
	return db
}

export async function saveLatestTestRun(run: StoredTestRun) {
	const db = await getDb()

	await db.withExclusiveTransactionAsync(async (txn) => {
		const inserted = await txn.runAsync(
			'INSERT INTO test_runs (slug, input_label, is_preview, ran_at) VALUES (?, ?, ?, ?)',
			run.slug,
			run.inputLabel,
			run.isPreview ? 1 : 0,
			run.ranAt
		)

		const runId = inserted.lastInsertRowId
		for (const row of run.rows) {
			await txn.runAsync(
				`INSERT INTO test_result_rows
					(run_id, gene, label, rsid, location, kind, status, note)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
				runId,
				row.gene,
				row.label,
				row.rsid ?? null,
				row.location,
				row.kind,
				row.status,
				row.note
			)
		}
	})
}

type RunRowRecord = {
	id: number
	input_label: string
	is_preview: number
	ran_at: string
	slug: string
}

type ResultRowRecord = {
	gene: string
	kind: 'SNV' | 'INDEL'
	label: string
	location: string
	note: string
	rsid: string | null
	status: TestResultStatus
}

export async function loadLatestTestRun(slug: string): Promise<StoredTestRun | null> {
	const db = await getDb()
	const run = await db.getFirstAsync<RunRowRecord>(
		'SELECT id, slug, input_label, is_preview, ran_at FROM test_runs WHERE slug = ? ORDER BY ran_at DESC, id DESC LIMIT 1',
		slug
	)

	if (!run) {
		return null
	}

	const rows = await db.getAllAsync<ResultRowRecord>(
		`SELECT gene, label, rsid, location, kind, status, note
		 FROM test_result_rows
		 WHERE run_id = ?
		 ORDER BY id ASC`,
		run.id
	)

	return {
		id: run.id,
		slug: run.slug,
		inputLabel: run.input_label,
		isPreview: run.is_preview === 1,
		ranAt: run.ran_at,
		rows: rows.map((row) => ({
			gene: row.gene,
			label: row.label,
			rsid: row.rsid ?? undefined,
			location: row.location,
			kind: row.kind,
			status: row.status,
			note: row.note,
		})),
	}
}

type RecentRunRow = {
	id: number
	slug: string
	input_label: string
	is_preview: number
	ran_at: string
	row_count: number
}

export async function listRecentTestRuns(limit = 20): Promise<RecentTestRunSummary[]> {
	const db = await getDb()
	const rows = await db.getAllAsync<RecentRunRow>(
		`SELECT
			r.id,
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
			slug: row.slug,
			inputLabel: row.input_label,
			isPreview: row.is_preview === 1,
			ranAt: row.ran_at,
			rowCount: row.row_count,
			testTitle: test?.title ?? row.slug,
		}
	})
}
