import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite'

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
		CREATE INDEX IF NOT EXISTS idx_test_runs_input_document_id_ran_at ON test_runs (input_document_id, ran_at DESC);
		CREATE INDEX IF NOT EXISTS idx_test_result_rows_run_id ON test_result_rows (run_id);
	`)

	schemaReady = true
}

export function getAppDbSync() {
	if (!dbInstance) {
		dbInstance = openDatabaseSync(APP_DB_NAME)
	}

	ensureSchema(dbInstance)
	return dbInstance
}

export async function getAppDb() {
	return getAppDbSync()
}
