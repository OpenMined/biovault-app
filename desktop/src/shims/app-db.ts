import type { SQLiteDatabase } from './expo-sqlite'

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
  imported_documents: ['id', 'name', 'original_name', 'uri', 'mime_type', 'size', 'imported_at', 'contents', 'inspection_json', 'origin'],
  installed_assays: ['id', 'manifest_json', 'installed_at', 'is_bundled', 'source', 'version'],
  assay_preferences: ['assay_id', 'preferred_document_id', 'updated_at'],
  test_runs: ['id', 'slug', 'input_document_id', 'input_label', 'is_preview', 'outcome', 'ran_at', 'unsupported_variants_json'],
  test_result_rows: ['id', 'run_id', 'gene', 'label', 'rsid', 'location', 'kind', 'status', 'note', 'ref', 'alts_json'],
}

const tables: Record<TableName, Row[]> = {
  app_preferences: [],
  imported_documents: [],
  installed_assays: [],
  assay_preferences: [],
  test_runs: [],
  test_result_rows: [],
}

const autoinc: Record<'test_runs' | 'test_result_rows', number> = {
  test_runs: 0,
  test_result_rows: 0,
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim()
}

function flattenParams(params: unknown[]): unknown[] {
  return params.length === 1 && Array.isArray(params[0]) ? params[0] as unknown[] : params
}

function run(sqlRaw: string, params: unknown[]): { lastInsertRowId: number; changes: number } {
  const sql = normalizeSql(sqlRaw)
  const args = flattenParams(params)

  if (/^(PRAGMA |CREATE TABLE|CREATE INDEX|ALTER TABLE|DROP TABLE|DROP INDEX)/i.test(sql)) {
    return { lastInsertRowId: 0, changes: 0 }
  }
  if (/^DELETE FROM app_preferences WHERE key = \?$/i.test(sql)) {
    const before = tables.app_preferences.length
    tables.app_preferences = tables.app_preferences.filter((row) => row.key !== args[0])
    return { lastInsertRowId: 0, changes: before - tables.app_preferences.length }
  }
  if (/^INSERT INTO app_preferences/i.test(sql)) {
    const [key, value] = args
    const existing = tables.app_preferences.find((row) => row.key === key)
    if (existing) existing.value = value
    else tables.app_preferences.push({ key, value })
    return { lastInsertRowId: 0, changes: 1 }
  }
  if (/^DELETE FROM assay_preferences WHERE assay_id = \?$/i.test(sql)) {
    const before = tables.assay_preferences.length
    tables.assay_preferences = tables.assay_preferences.filter((row) => row.assay_id !== args[0])
    return { lastInsertRowId: 0, changes: before - tables.assay_preferences.length }
  }
  if (/^INSERT INTO assay_preferences/i.test(sql)) {
    const [assay_id, preferred_document_id, updated_at] = args
    const existing = tables.assay_preferences.find((row) => row.assay_id === assay_id)
    if (existing) {
      existing.preferred_document_id = preferred_document_id
      existing.updated_at = updated_at
    } else {
      tables.assay_preferences.push({ assay_id, preferred_document_id, updated_at })
    }
    return { lastInsertRowId: 0, changes: 1 }
  }
  if (/^DELETE FROM imported_documents$/i.test(sql)) {
    const changes = tables.imported_documents.length
    tables.imported_documents = []
    return { lastInsertRowId: 0, changes }
  }
  if (/^INSERT INTO imported_documents/i.test(sql)) {
    const [id, name, original_name, uri, mime_type, size, imported_at, contents, inspection_json, origin] = args
    tables.imported_documents.push({ id, name, original_name, uri, mime_type, size, imported_at, contents, inspection_json, origin })
    return { lastInsertRowId: 0, changes: 1 }
  }
  if (/^INSERT INTO installed_assays/i.test(sql)) {
    const [id, manifest_json, installed_at, source, version] = args
    const existing = tables.installed_assays.find((row) => row.id === id)
    if (existing) Object.assign(existing, { manifest_json, installed_at, source, version, is_bundled: 0 })
    else tables.installed_assays.push({ id, manifest_json, installed_at, source, version, is_bundled: 0 })
    return { lastInsertRowId: 0, changes: 1 }
  }
  if (/^DELETE FROM installed_assays WHERE id = \?$/i.test(sql)) {
    const before = tables.installed_assays.length
    tables.installed_assays = tables.installed_assays.filter((row) => row.id !== args[0])
    return { lastInsertRowId: 0, changes: before - tables.installed_assays.length }
  }
  if (/^INSERT INTO test_runs/i.test(sql)) {
    const [slug, input_document_id, input_label, is_preview, outcome, ran_at, unsupported_variants_json] = args
    autoinc.test_runs += 1
    tables.test_runs.push({ id: autoinc.test_runs, slug, input_document_id, input_label, is_preview, outcome, ran_at, unsupported_variants_json })
    return { lastInsertRowId: autoinc.test_runs, changes: 1 }
  }
  if (/^DELETE FROM test_runs$/i.test(sql)) {
    const changes = tables.test_runs.length
    tables.test_runs = []
    return { lastInsertRowId: 0, changes }
  }
  if (/^INSERT INTO test_result_rows/i.test(sql)) {
    const [run_id, gene, label, rsid, location, kind, status, note, ref, alts_json] = args
    autoinc.test_result_rows += 1
    tables.test_result_rows.push({ id: autoinc.test_result_rows, run_id, gene, label, rsid, location, kind, status, note, ref, alts_json })
    return { lastInsertRowId: autoinc.test_result_rows, changes: 1 }
  }
  if (/^DELETE FROM test_result_rows$/i.test(sql)) {
    const changes = tables.test_result_rows.length
    tables.test_result_rows = []
    return { lastInsertRowId: 0, changes }
  }
  console.warn('[desktop-db] unsupported mutation:', sql)
  return { lastInsertRowId: 0, changes: 0 }
}

function getAll(sqlRaw: string, params: unknown[]): Row[] {
  const sql = normalizeSql(sqlRaw)
  const args = flattenParams(params)
  const pragmaMatch = sql.match(/^PRAGMA table_info\(([a-zA-Z_][a-zA-Z0-9_]*)\)$/i)
  if (pragmaMatch) return (TABLE_COLUMNS[pragmaMatch[1] as TableName] ?? []).map((name) => ({ name }))
  if (/^SELECT value FROM app_preferences WHERE key = \?$/i.test(sql)) {
    const row = tables.app_preferences.find((entry) => entry.key === args[0])
    return row ? [{ value: row.value ?? null }] : []
  }
  if (/^SELECT preferred_document_id FROM assay_preferences WHERE assay_id = \?$/i.test(sql)) {
    const row = tables.assay_preferences.find((entry) => entry.assay_id === args[0])
    return row ? [{ preferred_document_id: row.preferred_document_id ?? null }] : []
  }
  if (/^SELECT id, name, original_name, uri, mime_type, size, imported_at, contents(?:, inspection_json(?:, origin)?)? FROM imported_documents/i.test(sql)) {
    return [...tables.imported_documents].sort((left, right) => String(right.imported_at ?? '').localeCompare(String(left.imported_at ?? '')))
  }
  if (/^SELECT id, manifest_json, installed_at, source, version FROM installed_assays WHERE is_bundled = 0/i.test(sql)) {
    if (sql.includes('id = ?')) return tables.installed_assays.filter((row) => row.id === args[0] && row.is_bundled === 0)
    return tables.installed_assays.filter((row) => row.is_bundled === 0)
  }
  if (/^SELECT id, slug, input_document_id, input_label, is_preview, outcome, ran_at, unsupported_variants_json FROM test_runs WHERE slug = \?/i.test(sql)) {
    let rows = tables.test_runs.filter((row) => row.slug === args[0])
    if (/input_document_id IS NULL/i.test(sql)) rows = rows.filter((row) => row.input_document_id == null)
    if (/input_document_id = \?/i.test(sql)) rows = rows.filter((row) => row.input_document_id === args[1])
    return rows.sort((left, right) => String(right.ran_at ?? '').localeCompare(String(left.ran_at ?? '')) || Number(right.id) - Number(left.id)).slice(0, 1)
  }
  if (/^SELECT gene, label, rsid, location, kind, status, note, ref, alts_json FROM test_result_rows WHERE run_id = \?/i.test(sql)) {
    return tables.test_result_rows.filter((row) => row.run_id === args[0]).sort((left, right) => Number(left.id) - Number(right.id))
  }
  if (/^SELECT r\.id, r\.input_document_id, r\.slug, r\.input_label, r\.is_preview, r\.ran_at, COUNT\(rr\.id\) AS row_count FROM test_runs r/i.test(sql)) {
    const filterDoc = /WHERE r\.input_document_id = \?/i.test(sql)
    let runs = filterDoc ? tables.test_runs.filter((row) => row.input_document_id === args[0]) : [...tables.test_runs]
    const limit = Number(args[args.length - 1]) || runs.length
    runs = runs.sort((left, right) => String(right.ran_at ?? '').localeCompare(String(left.ran_at ?? '')) || Number(right.id) - Number(left.id))
    return runs.slice(0, limit).map((row) => ({
      id: row.id,
      input_document_id: row.input_document_id ?? null,
      slug: row.slug,
      input_label: row.input_label,
      is_preview: row.is_preview,
      ran_at: row.ran_at,
      row_count: tables.test_result_rows.filter((result) => result.run_id === row.id).length,
    }))
  }
  console.warn('[desktop-db] unsupported query:', sql)
  return []
}

const db: SQLiteDatabase = {
  execSync() {},
  async execAsync() {},
  getAllSync: (sql, ...params) => getAll(sql, params) as any,
  getAllAsync: async (sql, ...params) => getAll(sql, params) as any,
  getFirstSync: (sql, ...params) => (getAll(sql, params)[0] ?? null) as any,
  getFirstAsync: async (sql, ...params) => (getAll(sql, params)[0] ?? null) as any,
  runSync: (sql, ...params) => run(sql, params),
  runAsync: async (sql, ...params) => run(sql, params),
  withExclusiveTransactionAsync: async (fn) => fn(db),
  withTransactionSync: (fn) => fn(),
}

export function getAppDbSync(): SQLiteDatabase {
  return db
}

export async function getAppDb(): Promise<SQLiteDatabase> {
  return db
}
