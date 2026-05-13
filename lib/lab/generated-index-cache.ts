import type { LabFileRef } from '@/lib/lab/core/files'

const DB_NAME = 'biovault-generated-indexes'
const DB_VERSION = 2
const STORE_NAME = 'generated-indexes'
const IDB_TIMEOUT_MS = 2_000

type CachedGeneratedVcfIndex = {
	blob: Blob
	cachedAt: string
	key: string
	name: string
	size: number
}

let dbPromise: Promise<IDBDatabase> | null = null

function cacheKey(ref: LabFileRef, suffix: string): string {
	return `${suffix}:${ref.name}:${ref.size}:${ref.lastModified ?? 0}`
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | null = null
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s.`)), ms)
	})
	return Promise.race([promise, timeout]).finally(() => {
		if (timer) clearTimeout(timer)
	})
}

function openDb(): Promise<IDBDatabase> {
	if (typeof indexedDB === 'undefined') {
		return Promise.reject(new Error('IndexedDB is not available in this browser.'))
	}
	if (dbPromise) return dbPromise
	dbPromise = withTimeout(new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION)
		request.onupgradeneeded = () => {
			const db = request.result
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME, { keyPath: 'key' })
			}
		}
		request.onsuccess = () => resolve(request.result)
		request.onerror = () => reject(request.error ?? new Error('Failed to open generated index cache.'))
		request.onblocked = () => reject(new Error('Generated index cache is blocked by another tab.'))
	}), IDB_TIMEOUT_MS, 'Generated index cache open').catch((error) => {
		dbPromise = null
		throw error
	})
	return dbPromise
}

export async function getCachedGeneratedVcfIndexFile(vcfRef: LabFileRef): Promise<File | null> {
	return getCachedGeneratedIndexFile(vcfRef, 'tbi')
}

export async function putCachedGeneratedVcfIndexFile(vcfRef: LabFileRef, indexFile: File): Promise<void> {
	return putCachedGeneratedIndexFile(vcfRef, 'tbi', indexFile)
}

export async function getCachedGeneratedIndexFile(ref: LabFileRef, suffix: string): Promise<File | null> {
	return openDb()
		.then((db) => withTimeout(new Promise<CachedGeneratedVcfIndex | null>((resolve, reject) => {
			const tx = db.transaction(STORE_NAME, 'readonly')
			const request = tx.objectStore(STORE_NAME).get(cacheKey(ref, suffix))
			request.onsuccess = () => resolve((request.result as CachedGeneratedVcfIndex | undefined) ?? null)
			request.onerror = () => reject(request.error ?? new Error('Failed to read generated index cache.'))
		}), IDB_TIMEOUT_MS, 'Generated index cache read'))
		.then((record) => record ? new File([record.blob], record.name, { type: 'application/octet-stream' }) : null)
		.catch((error) => {
			console.warn('[generated-index-cache] skipping VCF index cache read', error)
			return null
		})
}

export async function putCachedGeneratedIndexFile(ref: LabFileRef, suffix: string, indexFile: File): Promise<void> {
	const record: CachedGeneratedVcfIndex = {
		blob: indexFile,
		cachedAt: new Date().toISOString(),
		key: cacheKey(ref, suffix),
		name: indexFile.name,
		size: indexFile.size,
	}
	return openDb()
		.then((db) => withTimeout(new Promise<void>((resolve, reject) => {
			const tx = db.transaction(STORE_NAME, 'readwrite')
			tx.objectStore(STORE_NAME).put(record)
			tx.oncomplete = () => resolve()
			tx.onerror = () => reject(tx.error ?? new Error('Failed to write generated index cache.'))
			tx.onabort = () => reject(tx.error ?? new Error('Generated index cache write was aborted.'))
		}), IDB_TIMEOUT_MS, 'Generated index cache write'))
		.catch((error) => {
			console.warn('[generated-index-cache] failed to cache generated VCF index', error)
		})
}
