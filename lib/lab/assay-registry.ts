import type { BioscriptPackageFile } from '@/modules/expo-bioscript'

const DB_NAME = 'biovault-assay-registry'
const DB_VERSION = 1
const PANELS_STORE = 'panels'
const ASSAYS_STORE = 'assays'
const IDB_TIMEOUT_MS = 10_000

export type RegistryOrigin = 'url' | 'local-drop'

export type RegistryPanel = {
	id: string
	version: string | null
	title: string
	label?: string | null
	summary?: string | null
	tags?: string[]
	sourceUrl: string | null
	artifactUrl?: string | null
	artifactSha256?: string | null
	entrypoint: string
	files: BioscriptPackageFile[]
	memberAssayIds: string[]
	origin: RegistryOrigin
	cachedAt: string
}

export type RegistryAssay = {
	id: string
	version: string | null
	title: string
	label?: string | null
	summary?: string | null
	tags?: string[]
	parentPanelId?: string | null
	sourceUrl: string | null
	pathInPackage?: string | null
	artifactUrl?: string | null
	artifactSha256?: string | null
	entrypoint?: string | null
	files?: BioscriptPackageFile[] | null
	origin: RegistryOrigin
	cachedAt: string
}

let dbPromise: Promise<IDBDatabase> | null = null

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | null = null
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms)
	})
	return Promise.race([promise, timeout]).finally(() => {
		if (timer) clearTimeout(timer)
	})
}

function openDb(): Promise<IDBDatabase> {
	if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB unavailable'))
	if (dbPromise) return dbPromise
	const next = withTimeout(new Promise<IDBDatabase>((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION)
		req.onupgradeneeded = () => {
			const db = req.result
			if (!db.objectStoreNames.contains(PANELS_STORE)) db.createObjectStore(PANELS_STORE, { keyPath: 'id' })
			if (!db.objectStoreNames.contains(ASSAYS_STORE)) db.createObjectStore(ASSAYS_STORE, { keyPath: 'id' })
		}
		req.onsuccess = () => resolve(req.result)
		req.onerror = () => reject(req.error ?? new Error('Failed to open assay registry'))
		req.onblocked = () => reject(new Error('Assay registry is blocked by another tab'))
	}), IDB_TIMEOUT_MS, 'Assay registry open').catch((error) => {
		dbPromise = null
		throw error
	})
	dbPromise = next
	return next
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T> {
	return openDb().then((db) => withTimeout(new Promise<T>((resolve, reject) => {
		const t = db.transaction(store, mode)
		const s = t.objectStore(store)
		const req = fn(s)
		t.oncomplete = () => resolve(((req as IDBRequest | undefined)?.result ?? undefined) as T)
		t.onerror = () => reject(t.error ?? new Error('Assay registry tx failed'))
		t.onabort = () => reject(t.error ?? new Error('Assay registry tx aborted'))
	}), IDB_TIMEOUT_MS, `Assay registry ${mode} on ${store}`))
}

export async function upsertPanel(panel: RegistryPanel): Promise<void> {
	await tx<void>(PANELS_STORE, 'readwrite', (s) => s.put({ ...panel, cachedAt: panel.cachedAt || new Date().toISOString() }))
}

export async function upsertAssay(assay: RegistryAssay): Promise<void> {
	await tx<void>(ASSAYS_STORE, 'readwrite', (s) => s.put({ ...assay, cachedAt: assay.cachedAt || new Date().toISOString() }))
}

export async function getPanel(id: string): Promise<RegistryPanel | null> {
	const result = await tx<RegistryPanel | undefined>(PANELS_STORE, 'readonly', (s) => s.get(id))
	return result ?? null
}

export async function getAssay(id: string): Promise<RegistryAssay | null> {
	const result = await tx<RegistryAssay | undefined>(ASSAYS_STORE, 'readonly', (s) => s.get(id))
	return result ?? null
}

export async function listPanels(): Promise<RegistryPanel[]> {
	const result = await tx<RegistryPanel[]>(PANELS_STORE, 'readonly', (s) => s.getAll() as IDBRequest<RegistryPanel[]>)
	return result ?? []
}

export async function listAssays(): Promise<RegistryAssay[]> {
	const result = await tx<RegistryAssay[]>(ASSAYS_STORE, 'readonly', (s) => s.getAll() as IDBRequest<RegistryAssay[]>)
	return result ?? []
}

export async function removeAssay(id: string): Promise<void> {
	await tx<void>(ASSAYS_STORE, 'readwrite', (s) => s.delete(id))
}

/** Removes the panel and every assay row that belongs to it. */
export async function removePanel(id: string): Promise<void> {
	const panel = await getPanel(id)
	await tx<void>(PANELS_STORE, 'readwrite', (s) => s.delete(id))
	if (panel?.memberAssayIds?.length) {
		await Promise.all(panel.memberAssayIds.map((assayId) => removeAssay(assayId)))
	}
	const orphaned = (await listAssays()).filter((assay) => assay.parentPanelId === id)
	await Promise.all(orphaned.map((assay) => removeAssay(assay.id)))
}

export type PackageRunBundle = { entrypoint: string; files: BioscriptPackageFile[] }

/** Resolve the entrypoint + files needed to run a panel or assay. */
export async function resolvePackageForRun(
	kind: 'panel' | 'assay',
	id: string,
): Promise<PackageRunBundle | null> {
	if (kind === 'panel') {
		const panel = await getPanel(id)
		if (!panel) return null
		return { entrypoint: panel.entrypoint, files: panel.files }
	}
	const assay = await getAssay(id)
	if (!assay) return null
	if (assay.parentPanelId) {
		const panel = await getPanel(assay.parentPanelId)
		if (!panel) return null
		return { entrypoint: panel.entrypoint, files: panel.files }
	}
	if (assay.entrypoint && assay.files?.length) {
		return { entrypoint: assay.entrypoint, files: assay.files }
	}
	return null
}

export async function isRunReady(kind: 'panel' | 'assay', id: string): Promise<boolean> {
	const bundle = await resolvePackageForRun(kind, id)
	return Boolean(bundle?.files?.length && bundle.entrypoint)
}
