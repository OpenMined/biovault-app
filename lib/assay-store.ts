import { getAppDbSync } from '@/lib/app-db'
import { assayManifests, type AssayManifest } from '@/lib/assay-manifests'

export type InstalledAssayRecord = {
	installedAt: string
	isBundled: boolean
	manifest: AssayManifest
	source: 'bundled'
	version: string
}

type InstalledAssayRow = {
	id: string
	installed_at: string
	is_bundled: number
	manifest_json: string
	source: 'bundled'
	version: string
}

function parseInstalledAssayRow(row: InstalledAssayRow): InstalledAssayRecord | null {
	try {
		const manifest = JSON.parse(row.manifest_json) as AssayManifest
		if (!manifest || typeof manifest.id !== 'string') {
			return null
		}

		return {
			installedAt: row.installed_at,
			isBundled: row.is_bundled === 1,
			manifest,
			source: row.source,
			version: row.version,
		}
	} catch (error) {
		console.error('Failed to parse installed assay manifest:', error)
		return null
	}
}

export function ensureBundledAssaysSeeded() {
	const db = getAppDbSync()
	const installedAt = new Date().toISOString()

	db.withTransactionSync(() => {
		for (const manifest of assayManifests) {
			db.runSync(
				`INSERT INTO installed_assays (id, manifest_json, installed_at, is_bundled, source, version)
				 VALUES (?, ?, ?, 1, 'bundled', 'bundled-v1')
				 ON CONFLICT(id) DO UPDATE SET
				 	manifest_json = excluded.manifest_json,
				 	is_bundled = excluded.is_bundled,
				 	source = excluded.source,
				 	version = excluded.version`,
				manifest.id,
				JSON.stringify(manifest),
				installedAt
			)
		}
	})
	const rows = db.getAllSync<InstalledAssayRow>(
		'SELECT id, manifest_json, installed_at, is_bundled, source, version FROM installed_assays ORDER BY id ASC'
	)

	return rows
		.map(parseInstalledAssayRow)
		.filter((record): record is InstalledAssayRecord => record !== null)
}

export function listInstalledAssaysSync(): InstalledAssayRecord[] {
	return ensureBundledAssaysSeeded()
}

export function getInstalledAssayByIdSync(id: string): InstalledAssayRecord | null {
	ensureBundledAssaysSeeded()
	const db = getAppDbSync()
	const row = db.getFirstSync<InstalledAssayRow>(
		'SELECT id, manifest_json, installed_at, is_bundled, source, version FROM installed_assays WHERE id = ?',
		id
	)

	return row ? parseInstalledAssayRow(row) : null
}
