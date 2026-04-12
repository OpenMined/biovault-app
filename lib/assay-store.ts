import { assayManifests, type AssayManifest } from '@/lib/assay-manifests'
import { Storage } from 'expo-sqlite/kv-store'

const ASSAY_STORE_KEY = 'installed_assays_v1'

export type InstalledAssayRecord = {
	installedAt: string
	isBundled: boolean
	manifest: AssayManifest
	source: 'bundled'
	version: string
}

function parseInstalledAssays(rawValue: string | null): InstalledAssayRecord[] {
	if (!rawValue) {
		return []
	}

	try {
		const parsed = JSON.parse(rawValue)
		if (!Array.isArray(parsed)) {
			return []
		}

		return parsed.filter(
			(value): value is InstalledAssayRecord =>
				typeof value === 'object' &&
				value !== null &&
				typeof value.installedAt === 'string' &&
				typeof value.isBundled === 'boolean' &&
				typeof value.source === 'string' &&
				typeof value.version === 'string' &&
				typeof value.manifest === 'object' &&
				value.manifest !== null &&
				typeof value.manifest.id === 'string'
		)
	} catch (error) {
		console.error('Failed to parse installed assays:', error)
		return []
	}
}

function buildBundledAssayRecords(): InstalledAssayRecord[] {
	const installedAt = new Date().toISOString()

	return assayManifests.map((manifest) => ({
		installedAt,
		isBundled: true,
		manifest,
		source: 'bundled' as const,
		version: 'bundled-v1',
	}))
}

function saveInstalledAssays(records: InstalledAssayRecord[]) {
	Storage.setItemSync(ASSAY_STORE_KEY, JSON.stringify(records))
}

export function ensureBundledAssaysSeeded() {
	const existing = parseInstalledAssays(Storage.getItemSync(ASSAY_STORE_KEY))
	if (existing.length > 0) {
		return existing
	}

	const seeded = buildBundledAssayRecords()
	saveInstalledAssays(seeded)
	return seeded
}

export function listInstalledAssaysSync(): InstalledAssayRecord[] {
	return ensureBundledAssaysSeeded()
}

export function getInstalledAssayByIdSync(id: string): InstalledAssayRecord | null {
	return listInstalledAssaysSync().find((record) => record.manifest.id === id) ?? null
}
