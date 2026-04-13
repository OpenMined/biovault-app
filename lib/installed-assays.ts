import { getAppDb } from '@/lib/app-db'
import { invalidateAvailableAssayManifestCache } from '@/lib/assay-loader'
import { Directory, File, Paths } from 'expo-file-system'
import { deleteAsync, writeAsStringAsync } from 'expo-file-system/legacy'
import YAML from 'yaml'

type YamlMap = Record<string, unknown>

type InstalledAssayManifestRecord = {
	assayPath: string
	fileUris: Record<string, string>
	rootUri: string
}

type InstalledAssayRow = {
	id: string
	installed_at: string
	manifest_json: string
	source: string
	version: string
}

export type InstalledAssaySummary = {
	id: string
	installedAt: string
	source: string
	version: string
}

export type InstallAssayPackageInput = {
	assayPath: string
	files: Record<string, string>
	source: string
}

function asString(value: unknown): string | null {
	return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function slugFromAssayId(assayId: string): string {
	return assayId
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
}

function ensureInstalledAssaysDirectory() {
	const directory = new Directory(Paths.document, 'assay-packages')
	if (!directory.exists) {
		directory.create({ idempotent: true, intermediates: true })
	}
	return directory
}

function parseAssayMetadata(assayContents: string, assayPath: string) {
	const parsed = YAML.parse(assayContents)
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error(`${assayPath} did not contain a YAML mapping`)
	}

	const assay = parsed as YamlMap
	const assayId = asString(assay.assay_id)
	if (!assayId) {
		throw new Error(`${assayPath} is missing assay_id`)
	}

	const packageBlock =
		assay.package && typeof assay.package === 'object' && !Array.isArray(assay.package)
			? (assay.package as YamlMap)
			: {}

	return {
		assayId: slugFromAssayId(assayId),
		version: asString(packageBlock.assay_version) ?? asString(assay.version) ?? '1.0',
	}
}

function getStoredRecord(row: InstalledAssayRow): InstalledAssayManifestRecord | null {
	try {
		const parsed = JSON.parse(row.manifest_json)
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			return null
		}

		const record = parsed as Partial<InstalledAssayManifestRecord>
		if (
			typeof record.rootUri !== 'string' ||
			typeof record.assayPath !== 'string' ||
			!record.fileUris ||
			typeof record.fileUris !== 'object' ||
			Array.isArray(record.fileUris)
		) {
			return null
		}

		const fileUris = Object.fromEntries(
			Object.entries(record.fileUris).filter(
				([relativePath, uri]): uri is string => typeof relativePath === 'string' && typeof uri === 'string'
			)
		)

		return {
			rootUri: record.rootUri,
			assayPath: record.assayPath,
			fileUris,
		}
	} catch {
		return null
	}
}

export async function installAssayPackage(input: InstallAssayPackageInput) {
	const assayContents = input.files[input.assayPath]
	if (!assayContents) {
		throw new Error(`Missing assay definition file: ${input.assayPath}`)
	}

	const { assayId, version } = parseAssayMetadata(assayContents, input.assayPath)
	const installsDirectory = ensureInstalledAssaysDirectory()
	const assayDirectory = new Directory(installsDirectory, assayId)

	if (assayDirectory.exists) {
		await deleteAsync(assayDirectory.uri, { idempotent: true })
	}

	assayDirectory.create({ idempotent: true, intermediates: true })

	const fileUris: Record<string, string> = {}

	for (const [relativePath, contents] of Object.entries(input.files)) {
		const parts = relativePath.split('/').filter(Boolean)
		const fileName = parts.pop()
		if (!fileName) {
			continue
		}

		let parentDirectory = assayDirectory
		for (const part of parts) {
			parentDirectory = new Directory(parentDirectory, part)
			if (!parentDirectory.exists) {
				parentDirectory.create({ idempotent: true, intermediates: true })
			}
		}

		const targetFile = new File(parentDirectory, fileName)
		await writeAsStringAsync(targetFile.uri, contents)
		fileUris[relativePath] = targetFile.uri
	}

	const db = await getAppDb()
	const installedAt = new Date().toISOString()

	await db.runAsync(
		`INSERT INTO installed_assays (id, manifest_json, installed_at, is_bundled, source, version)
		 VALUES (?, ?, ?, 0, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET
		 	manifest_json = excluded.manifest_json,
		 	installed_at = excluded.installed_at,
		 	source = excluded.source,
		 	version = excluded.version,
		 	is_bundled = 0`,
		assayId,
		JSON.stringify({
			rootUri: assayDirectory.uri,
			assayPath: input.assayPath,
			fileUris,
		} satisfies InstalledAssayManifestRecord),
		installedAt,
		input.source,
		version
	)

	invalidateAvailableAssayManifestCache()

	return {
		id: assayId,
		installedAt,
		rootUri: assayDirectory.uri,
		source: input.source,
		version,
	}
}

export async function uninstallInstalledAssay(id: string) {
	const db = await getAppDb()
	const row = await db.getFirstAsync<InstalledAssayRow>(
		'SELECT id, manifest_json, installed_at, source, version FROM installed_assays WHERE id = ? AND is_bundled = 0',
		id
	)

	if (!row) {
		return
	}

	const storedRecord = getStoredRecord(row)
	if (storedRecord?.rootUri) {
		await deleteAsync(storedRecord.rootUri, { idempotent: true })
	}

	await db.runAsync('DELETE FROM installed_assays WHERE id = ?', id)
	invalidateAvailableAssayManifestCache()
}

export async function listInstalledAssays(): Promise<InstalledAssaySummary[]> {
	const db = await getAppDb()
	const rows = await db.getAllAsync<InstalledAssayRow>(
		'SELECT id, manifest_json, installed_at, source, version FROM installed_assays WHERE is_bundled = 0 ORDER BY installed_at DESC, id DESC'
	)

	return rows.map((row) => ({
		id: row.id,
		installedAt: row.installed_at,
		source: row.source,
		version: row.version,
	}))
}
