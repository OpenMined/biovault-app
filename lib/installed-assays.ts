import { getAppDb } from '@/lib/app-db'
import { invalidateAvailableAssayManifestCache } from '@/lib/assay-loader'
import { Directory, File, Paths } from 'expo-file-system'
import { deleteAsync, writeAsStringAsync } from 'expo-file-system/legacy'

type InstalledAssayManifestRecord = {
	assayPath: string
	fileUris: Record<string, string>
	intermediatePath: string
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
	intermediatePath: string
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

function parseAssayMetadata(intermediateContents: string, intermediatePath: string) {
	let parsed: unknown
	try {
		parsed = JSON.parse(intermediateContents)
	} catch {
		throw new Error(`${intermediatePath} did not contain valid JSON`)
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error(`${intermediatePath} did not contain an assay intermediate object`)
	}

	const intermediate = parsed as Record<string, unknown>
	if (intermediate.schema !== 'bioscript:assay-intermediate') {
		throw new Error(`${intermediatePath} does not declare bioscript:assay-intermediate`)
	}

	const assay =
		intermediate.assay && typeof intermediate.assay === 'object' && !Array.isArray(intermediate.assay)
			? (intermediate.assay as Record<string, unknown>)
			: null
	if (!assay) {
		throw new Error(`${intermediatePath} is missing assay metadata`)
	}

	const assayId = asString(assay.id)
	if (!assayId) {
		throw new Error(`${intermediatePath} is missing assay.id`)
	}

	return {
		assayId: slugFromAssayId(assayId),
		version: asString(assay.package_version) ?? asString(intermediate.version) ?? '1.0',
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
			intermediatePath: record.intermediatePath,
		}
	} catch {
		return null
	}
}

export async function installAssayPackage(input: InstallAssayPackageInput) {
	const intermediateContents = input.files[input.intermediatePath]
	if (!intermediateContents) {
		throw new Error(`Missing assay intermediate file: ${input.intermediatePath}`)
	}

	const { assayId, version } = parseAssayMetadata(intermediateContents, input.intermediatePath)
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
			intermediatePath: input.intermediatePath,
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
