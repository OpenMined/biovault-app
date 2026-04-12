import type { AssayManifest } from '@/lib/assay-manifests'
import { getInstalledAssayByIdSync, listInstalledAssaysSync, type InstalledAssayRecord } from '@/lib/assay-store'

export type AvailableAssay = InstalledAssayRecord

export function listAvailableAssaysSync(): AvailableAssay[] {
	return listInstalledAssaysSync()
}

export function listAvailableAssayManifestsSync(): AssayManifest[] {
	return listAvailableAssaysSync().map((record) => record.manifest)
}

export function getAvailableAssayByIdSync(id: string): AvailableAssay | null {
	return getInstalledAssayByIdSync(id)
}

export function getAvailableAssayManifestByIdSync(id: string): AssayManifest | null {
	return getAvailableAssayByIdSync(id)?.manifest ?? null
}
