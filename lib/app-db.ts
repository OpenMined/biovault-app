import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite'
import { Platform } from 'react-native'

const APP_DB_NAME = 'biovault-app.db'

let dbInstance: SQLiteDatabase | null = null
let schemaReady = false

function ensureSchema(db: SQLiteDatabase) {
	if (schemaReady) {
		return
	}

	db.execSync(`
		PRAGMA journal_mode = WAL;

		CREATE TABLE IF NOT EXISTS app_preferences (
			key TEXT PRIMARY KEY NOT NULL,
			value TEXT
		);

		CREATE TABLE IF NOT EXISTS imported_documents (
			id TEXT PRIMARY KEY NOT NULL,
			name TEXT NOT NULL,
			original_name TEXT NOT NULL,
			uri TEXT NOT NULL,
			mime_type TEXT,
			size INTEGER,
			imported_at TEXT NOT NULL,
			contents TEXT
		);

		CREATE TABLE IF NOT EXISTS installed_assays (
			id TEXT PRIMARY KEY NOT NULL,
			manifest_json TEXT NOT NULL,
			installed_at TEXT NOT NULL,
			is_bundled INTEGER NOT NULL DEFAULT 0,
			source TEXT NOT NULL,
			version TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS assay_preferences (
			assay_id TEXT PRIMARY KEY NOT NULL,
			preferred_document_id TEXT,
			updated_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS test_runs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			slug TEXT NOT NULL,
			input_document_id TEXT,
			input_label TEXT NOT NULL,
			is_preview INTEGER NOT NULL DEFAULT 0,
			outcome TEXT,
			ran_at TEXT NOT NULL,
			unsupported_variants_json TEXT
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
		CREATE INDEX IF NOT EXISTS idx_test_runs_input_document_id_ran_at ON test_runs (input_document_id, ran_at DESC);
		CREATE INDEX IF NOT EXISTS idx_test_result_rows_run_id ON test_result_rows (run_id);
	`)

	const testRunColumns = db
		.getAllSync<{ name: string }>('PRAGMA table_info(test_runs)')
		.map((column) => column.name)

	if (!testRunColumns.includes('unsupported_variants_json')) {
		db.execSync('ALTER TABLE test_runs ADD COLUMN unsupported_variants_json TEXT;')
	}

	if (!testRunColumns.includes('outcome')) {
		db.execSync('ALTER TABLE test_runs ADD COLUMN outcome TEXT;')
	}

	const testResultColumns = db
		.getAllSync<{ name: string }>('PRAGMA table_info(test_result_rows)')
		.map((column) => column.name)

	if (!testResultColumns.includes('ref')) {
		db.execSync('ALTER TABLE test_result_rows ADD COLUMN ref TEXT;')
	}

	if (!testResultColumns.includes('alts_json')) {
		db.execSync('ALTER TABLE test_result_rows ADD COLUMN alts_json TEXT;')
	}

	schemaReady = true
}

export function getAppDbSync() {
	if (!dbInstance) {
		dbInstance = Platform.OS === 'web' ? (createWebDb() as unknown as SQLiteDatabase) : openDatabaseSync(APP_DB_NAME)
	}

	if (Platform.OS !== 'web') {
		ensureSchema(dbInstance)
	}
	return dbInstance
}

export async function getAppDb() {
	return getAppDbSync()
}

// ---------------------------------------------------------------------------
// Web fallback: wa-sqlite WASM doesn't support the sync API and initializes
// asynchronously, so we provide an in-memory shim backed by localStorage that
// routes the specific queries used by this app. Data persists per-origin but
// is best-effort: it is not a real SQL engine.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>
type TableName =
	| 'app_preferences'
	| 'imported_documents'
	| 'installed_assays'
	| 'assay_preferences'
	| 'test_runs'
	| 'test_result_rows'

const TABLE_COLUMNS: Record<TableName, string[]> = {
	app_preferences: ['key', 'value'],
	imported_documents: ['id', 'name', 'original_name', 'uri', 'mime_type', 'size', 'imported_at', 'contents'],
	installed_assays: ['id', 'manifest_json', 'installed_at', 'is_bundled', 'source', 'version'],
	assay_preferences: ['assay_id', 'preferred_document_id', 'updated_at'],
	test_runs: ['id', 'slug', 'input_document_id', 'input_label', 'is_preview', 'outcome', 'ran_at', 'unsupported_variants_json'],
	test_result_rows: ['id', 'run_id', 'gene', 'label', 'rsid', 'location', 'kind', 'status', 'note', 'ref', 'alts_json'],
}

const STORAGE_PREFIX = 'biovault-webdb:'

function hasLocalStorage(): boolean {
	try {
		return typeof globalThis !== 'undefined' && typeof (globalThis as any).localStorage !== 'undefined'
	} catch {
		return false
	}
}

function loadTable(name: TableName): Row[] {
	if (!hasLocalStorage()) return []
	try {
		const raw = (globalThis as any).localStorage.getItem(STORAGE_PREFIX + name)
		if (!raw) return []
		const parsed = JSON.parse(raw)
		return Array.isArray(parsed) ? parsed : []
	} catch {
		return []
	}
}

function saveTable(name: TableName, rows: Row[]) {
	if (!hasLocalStorage()) return
	try {
		;(globalThis as any).localStorage.setItem(STORAGE_PREFIX + name, JSON.stringify(rows))
	} catch {
		// best-effort
	}
}

function normalizeSql(sql: string): string {
	return sql.replace(/\s+/g, ' ').trim()
}

type WebDb = {
	execSync(sql: string): void
	execAsync(sql: string): Promise<void>
	getAllSync<T = Row>(sql: string, ...params: unknown[]): T[]
	getAllAsync<T = Row>(sql: string, ...params: unknown[]): Promise<T[]>
	getFirstSync<T = Row>(sql: string, ...params: unknown[]): T | null
	getFirstAsync<T = Row>(sql: string, ...params: unknown[]): Promise<T | null>
	runSync(sql: string, ...params: unknown[]): { lastInsertRowId: number; changes: number }
	runAsync(sql: string, ...params: unknown[]): Promise<{ lastInsertRowId: number; changes: number }>
	withTransactionSync(fn: () => void): void
	withExclusiveTransactionAsync(fn: (txn: WebDb) => Promise<void>): Promise<void>
}

function createWebDb(): WebDb {
	const tables: Record<TableName, Row[]> = {
		app_preferences: loadTable('app_preferences'),
		imported_documents: loadTable('imported_documents'),
		installed_assays: loadTable('installed_assays'),
		assay_preferences: loadTable('assay_preferences'),
		test_runs: loadTable('test_runs'),
		test_result_rows: loadTable('test_result_rows'),
	}

	const autoinc: Record<'test_runs' | 'test_result_rows', number> = {
		test_runs: tables.test_runs.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0),
		test_result_rows: tables.test_result_rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0),
	}

	function persist(name: TableName) {
		saveTable(name, tables[name])
	}

	function flattenParams(params: unknown[]): unknown[] {
		if (params.length === 1 && Array.isArray(params[0])) {
			return params[0] as unknown[]
		}
		return params
	}

	function run(sqlRaw: string, params: unknown[]): { lastInsertRowId: number; changes: number } {
		const sql = normalizeSql(sqlRaw)
		const args = flattenParams(params)

		// DDL / schema — all no-ops on web
		if (/^(PRAGMA |CREATE TABLE|CREATE INDEX|ALTER TABLE|DROP TABLE|DROP INDEX)/i.test(sql)) {
			return { lastInsertRowId: 0, changes: 0 }
		}

		// app_preferences
		if (/^DELETE FROM app_preferences WHERE key = \?$/i.test(sql)) {
			const [key] = args
			const before = tables.app_preferences.length
			tables.app_preferences = tables.app_preferences.filter((row) => row.key !== key)
			persist('app_preferences')
			return { lastInsertRowId: 0, changes: before - tables.app_preferences.length }
		}
		if (/^INSERT INTO app_preferences/i.test(sql)) {
			const [key, value] = args
			const existing = tables.app_preferences.find((row) => row.key === key)
			if (existing) {
				existing.value = value as string | null
			} else {
				tables.app_preferences.push({ key, value })
			}
			persist('app_preferences')
			return { lastInsertRowId: 0, changes: 1 }
		}

		// assay_preferences
		if (/^DELETE FROM assay_preferences WHERE assay_id = \?$/i.test(sql)) {
			const [assayId] = args
			const before = tables.assay_preferences.length
			tables.assay_preferences = tables.assay_preferences.filter((row) => row.assay_id !== assayId)
			persist('assay_preferences')
			return { lastInsertRowId: 0, changes: before - tables.assay_preferences.length }
		}
		if (/^INSERT INTO assay_preferences/i.test(sql)) {
			const [assayId, documentId, updatedAt] = args
			const existing = tables.assay_preferences.find((row) => row.assay_id === assayId)
			if (existing) {
				existing.preferred_document_id = documentId as string | null
				existing.updated_at = updatedAt as string
			} else {
				tables.assay_preferences.push({
					assay_id: assayId,
					preferred_document_id: documentId,
					updated_at: updatedAt,
				})
			}
			persist('assay_preferences')
			return { lastInsertRowId: 0, changes: 1 }
		}

		// imported_documents
		if (/^DELETE FROM imported_documents$/i.test(sql)) {
			const changes = tables.imported_documents.length
			tables.imported_documents = []
			persist('imported_documents')
			return { lastInsertRowId: 0, changes }
		}
		if (/^INSERT INTO imported_documents/i.test(sql)) {
			const [id, name, originalName, uri, mimeType, size, importedAt, contents] = args
			tables.imported_documents.push({
				id,
				name,
				original_name: originalName,
				uri,
				mime_type: mimeType,
				size,
				imported_at: importedAt,
				contents,
			})
			persist('imported_documents')
			return { lastInsertRowId: 0, changes: 1 }
		}

		// installed_assays
		if (/^INSERT INTO installed_assays/i.test(sql)) {
			const [id, manifestJson, installedAt, source, version] = args
			const existing = tables.installed_assays.find((row) => row.id === id)
			if (existing) {
				existing.manifest_json = manifestJson as string
				existing.installed_at = installedAt as string
				existing.source = source as string
				existing.version = version as string
				existing.is_bundled = 0
			} else {
				tables.installed_assays.push({
					id,
					manifest_json: manifestJson,
					installed_at: installedAt,
					is_bundled: 0,
					source,
					version,
				})
			}
			persist('installed_assays')
			return { lastInsertRowId: 0, changes: 1 }
		}
		if (/^DELETE FROM installed_assays WHERE id = \?$/i.test(sql)) {
			const [id] = args
			const before = tables.installed_assays.length
			tables.installed_assays = tables.installed_assays.filter((row) => row.id !== id)
			persist('installed_assays')
			return { lastInsertRowId: 0, changes: before - tables.installed_assays.length }
		}

		// test_runs
		if (/^INSERT INTO test_runs/i.test(sql)) {
			const [slug, inputDocumentId, inputLabel, isPreview, outcome, ranAt, unsupportedVariantsJson] = args
			autoinc.test_runs += 1
			tables.test_runs.push({
				id: autoinc.test_runs,
				slug,
				input_document_id: inputDocumentId,
				input_label: inputLabel,
				is_preview: isPreview,
				outcome,
				ran_at: ranAt,
				unsupported_variants_json: unsupportedVariantsJson,
			})
			persist('test_runs')
			return { lastInsertRowId: autoinc.test_runs, changes: 1 }
		}
		if (/^DELETE FROM test_runs$/i.test(sql)) {
			const changes = tables.test_runs.length
			tables.test_runs = []
			persist('test_runs')
			return { lastInsertRowId: 0, changes }
		}

		// test_result_rows
		if (/^INSERT INTO test_result_rows/i.test(sql)) {
			const [runId, gene, label, rsid, location, kind, status, note, ref, altsJson] = args
			autoinc.test_result_rows += 1
			tables.test_result_rows.push({
				id: autoinc.test_result_rows,
				run_id: runId,
				gene,
				label,
				rsid,
				location,
				kind,
				status,
				note,
				ref,
				alts_json: altsJson,
			})
			persist('test_result_rows')
			return { lastInsertRowId: autoinc.test_result_rows, changes: 1 }
		}
		if (/^DELETE FROM test_result_rows$/i.test(sql)) {
			const changes = tables.test_result_rows.length
			tables.test_result_rows = []
			persist('test_result_rows')
			return { lastInsertRowId: 0, changes }
		}

		console.warn('[web-db] unsupported mutation:', sql)
		return { lastInsertRowId: 0, changes: 0 }
	}

	function getAll(sqlRaw: string, params: unknown[]): Row[] {
		const sql = normalizeSql(sqlRaw)
		const args = flattenParams(params)

		// PRAGMA table_info(X) → return canonical column list
		const pragmaMatch = sql.match(/^PRAGMA table_info\(([a-zA-Z_][a-zA-Z0-9_]*)\)$/i)
		if (pragmaMatch) {
			const tableName = pragmaMatch[1] as TableName
			const columns = TABLE_COLUMNS[tableName] ?? []
			return columns.map((name) => ({ name }))
		}

		// app_preferences
		if (/^SELECT value FROM app_preferences WHERE key = \?$/i.test(sql)) {
			const [key] = args
			const row = tables.app_preferences.find((entry) => entry.key === key)
			return row ? [{ value: row.value ?? null }] : []
		}

		// assay_preferences
		if (/^SELECT preferred_document_id FROM assay_preferences WHERE assay_id = \?$/i.test(sql)) {
			const [assayId] = args
			const row = tables.assay_preferences.find((entry) => entry.assay_id === assayId)
			return row ? [{ preferred_document_id: row.preferred_document_id ?? null }] : []
		}

		// imported_documents list
		if (/^SELECT id, name, original_name, uri, mime_type, size, imported_at, contents FROM imported_documents/i.test(sql)) {
			return [...tables.imported_documents].sort((left, right) => {
				const leftAt = String(left.imported_at ?? '')
				const rightAt = String(right.imported_at ?? '')
				if (leftAt !== rightAt) return leftAt < rightAt ? 1 : -1
				const leftId = String(left.id ?? '')
				const rightId = String(right.id ?? '')
				return leftId < rightId ? 1 : leftId > rightId ? -1 : 0
			})
		}

		// installed_assays list
		if (/^SELECT id, manifest_json, installed_at, source, version FROM installed_assays WHERE is_bundled = 0/i.test(sql)) {
			if (sql.includes('id = ?')) {
				const [id] = args
				const row = tables.installed_assays.find((entry) => entry.id === id && entry.is_bundled === 0)
				return row ? [row] : []
			}
			return [...tables.installed_assays]
				.filter((row) => row.is_bundled === 0)
				.sort((left, right) => {
					const leftAt = String(left.installed_at ?? '')
					const rightAt = String(right.installed_at ?? '')
					if (leftAt !== rightAt) return leftAt < rightAt ? 1 : -1
					const leftId = String(left.id ?? '')
					const rightId = String(right.id ?? '')
					return leftId < rightId ? 1 : leftId > rightId ? -1 : 0
				})
		}

		// test_runs single lookup
		if (/^SELECT id, slug, input_document_id, input_label, is_preview, outcome, ran_at, unsupported_variants_json FROM test_runs WHERE slug = \?/i.test(sql)) {
			const filterNullDoc = /input_document_id IS NULL/i.test(sql)
			const filterDocEq = /input_document_id = \?/i.test(sql)
			let filtered = tables.test_runs.filter((row) => row.slug === args[0])
			if (filterNullDoc) {
				filtered = filtered.filter((row) => row.input_document_id == null)
			} else if (filterDocEq) {
				filtered = filtered.filter((row) => row.input_document_id === args[1])
			}
			filtered.sort((left, right) => {
				const leftAt = String(left.ran_at ?? '')
				const rightAt = String(right.ran_at ?? '')
				if (leftAt !== rightAt) return leftAt < rightAt ? 1 : -1
				return Number(right.id) - Number(left.id)
			})
			return filtered.slice(0, 1)
		}

		// test_result_rows for run
		if (/^SELECT gene, label, rsid, location, kind, status, note, ref, alts_json FROM test_result_rows WHERE run_id = \?/i.test(sql)) {
			const [runId] = args
			return tables.test_result_rows
				.filter((row) => row.run_id === runId)
				.sort((left, right) => Number(left.id) - Number(right.id))
		}

		// recent test_runs with row counts (optionally filtered by input_document_id)
		if (/^SELECT r\.id, r\.input_document_id, r\.slug, r\.input_label, r\.is_preview, r\.ran_at, COUNT\(rr\.id\) AS row_count FROM test_runs r/i.test(sql)) {
			const filterDoc = /WHERE r\.input_document_id = \?/i.test(sql)
			let runs = [...tables.test_runs]
			let limit = args[args.length - 1] as number
			if (filterDoc) {
				runs = runs.filter((row) => row.input_document_id === args[0])
			}
			runs.sort((left, right) => {
				const leftAt = String(left.ran_at ?? '')
				const rightAt = String(right.ran_at ?? '')
				if (leftAt !== rightAt) return leftAt < rightAt ? 1 : -1
				return Number(right.id) - Number(left.id)
			})
			return runs.slice(0, Number(limit) || runs.length).map((run) => ({
				id: run.id,
				input_document_id: run.input_document_id ?? null,
				slug: run.slug,
				input_label: run.input_label,
				is_preview: run.is_preview,
				ran_at: run.ran_at,
				row_count: tables.test_result_rows.filter((row) => row.run_id === run.id).length,
			}))
		}

		console.warn('[web-db] unsupported query:', sql)
		return []
	}

	const webDb: WebDb = {
		execSync(_sql) {
			/* noop: schema DDL */
		},
		async execAsync(_sql) {
			/* noop */
		},
		getAllSync(sql, ...params) {
			return getAll(sql, params) as any
		},
		async getAllAsync(sql, ...params) {
			return getAll(sql, params) as any
		},
		getFirstSync(sql, ...params) {
			const rows = getAll(sql, params)
			return (rows[0] ?? null) as any
		},
		async getFirstAsync(sql, ...params) {
			const rows = getAll(sql, params)
			return (rows[0] ?? null) as any
		},
		runSync(sql, ...params) {
			return run(sql, params)
		},
		async runAsync(sql, ...params) {
			return run(sql, params)
		},
		withTransactionSync(fn) {
			fn()
		},
		async withExclusiveTransactionAsync(fn) {
			await fn(webDb)
		},
	}

	return webDb
}
