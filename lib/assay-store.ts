import { assayManifests, type AssayManifest } from '@/lib/assay-manifests'

export type InstalledAssayRecord = {
	installedAt: string
	isBundled: boolean
	manifest: AssayManifest
	source: 'bundled'
	version: string
}

const BUNDLED_ASSAY_VERSION = 'bundled-v1'
const BUNDLED_ASSAY_INSTALLED_AT = '2026-04-12T00:00:00.000Z'

function toInstalledAssayRecord(manifest: AssayManifest): InstalledAssayRecord {
	return {
		installedAt: BUNDLED_ASSAY_INSTALLED_AT,
		isBundled: true,
		manifest,
		source: 'bundled',
		version: BUNDLED_ASSAY_VERSION,
	}
}

export function ensureBundledAssaysSeeded() {
	return assayManifests.map(toInstalledAssayRecord)
}

export function listInstalledAssaysSync(): InstalledAssayRecord[] {
	return ensureBundledAssaysSeeded()
}

export function getInstalledAssayByIdSync(id: string): InstalledAssayRecord | null {
	const manifest = assayManifests.find((item) => item.id === id) ?? null
	return manifest ? toInstalledAssayRecord(manifest) : null
}
