import { classifyLabFile, humanLabSize } from '@/lib/lab/file-model'
import type { FileKind } from '@/lib/lab/types'

export const REMOTE_LAB_FILE_CACHE_MAX_BYTES = 100 * 1024 * 1024
const REMOTE_LAB_FILE_IDB_TIMEOUT_MS = 10_000
const REMOTE_LAB_FILE_FETCH_TIMEOUT_MS = 120_000

export type RemoteLabFile = {
	cacheStatus: 'hit' | 'miss' | 'stored' | 'too-large' | 'uncached'
	file: File
	fileKind: FileKind
	sourceUrl: string
}

export type CachedRemoteLabFile = {
	blob?: Blob
	bytes?: ArrayBuffer
	cachedAt: string
	contentType: string
	name: string
	size: number
	sourceUrl: string
}

const DB_NAME = 'biovault-remote-lab-files'
const DB_VERSION = 1
const STORE_NAME = 'files'
const GITHUB_BLOB_RE = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/
const ALLOWED_REMOTE_FILE_HOSTS = new Set(['github.com', 'raw.githubusercontent.com'])
const DEV_REMOTE_FILE_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

let dbPromise: Promise<IDBDatabase> | null = null

function timeoutError(label: string, ms: number): Error {
	return new Error(`${label} timed out after ${Math.round(ms / 1000)}s.`)
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | null = null
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(timeoutError(label, ms)), ms)
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
	const nextPromise = withTimeout(new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION)
		request.onupgradeneeded = () => {
			const db = request.result
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME, { keyPath: 'sourceUrl' })
			}
		}
		request.onsuccess = () => resolve(request.result)
		request.onerror = () => reject(request.error ?? new Error('Failed to open remote file cache.'))
		request.onblocked = () => reject(new Error('Remote file cache is blocked by another tab.'))
	}), REMOTE_LAB_FILE_IDB_TIMEOUT_MS, 'Remote file cache open').catch((error) => {
		dbPromise = null
		throw error
	})
	dbPromise = nextPromise
	return nextPromise
}

function normalizeSourceUrl(input: string): string {
	return input.trim()
}

function githubBlobToRawUrl(input: string): string {
	const match = input.match(GITHUB_BLOB_RE)
	if (!match) return input
	const [, owner, repo, ref, path] = match
	return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`
}

function repairNestedArtifactUrl(input: string): string {
	try {
		const parsed = new URL(input)
		const marker = parsed.pathname.match(/\/([^/]+\.(?:ya?ml|zip))\/([^/]+\.zip)$/i)
		if (!marker) return input
		const prefix = parsed.pathname.slice(0, marker.index)
		parsed.pathname = `${prefix}/${marker[2]}`
		return parsed.toString()
	} catch {
		return input
	}
}

function toFetchableUrl(input: string): string {
	return githubBlobToRawUrl(repairNestedArtifactUrl(input.trim()))
}

function fileNameFromUrl(input: string): string {
	try {
		const parsed = new URL(input)
		const parts = parsed.pathname.split('/').filter(Boolean)
		return decodeURIComponent(parts[parts.length - 1] || 'remote-file')
	} catch {
		return 'remote-file'
	}
}

function assertAllowedRemoteFile(input: string) {
	const parsed = new URL(input)
	if (!ALLOWED_REMOTE_FILE_HOSTS.has(parsed.hostname) && !isAllowedDevRemoteHost(parsed.hostname)) {
		throw new Error('Remote files must come from github.com, raw.githubusercontent.com, or an allowed local test host.')
	}
}

function isAllowedDevRemoteHost(hostname: string): boolean {
	return DEV_REMOTE_FILE_HOSTS.has(hostname) || hostname.endsWith('.biovault.test')
}

function cachedRecordFile(record: CachedRemoteLabFile): File | null {
	const body = record.bytes ?? record.blob
	if (!body) return null
	return new File([body], record.name, { type: record.contentType })
}

function getCachedRemoteLabFile(sourceUrl: string): Promise<CachedRemoteLabFile | null> {
	return openDb().then((db) => withTimeout(new Promise<CachedRemoteLabFile | null>((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readonly')
		const candidates = Array.from(new Set([
			sourceUrl,
			repairNestedArtifactUrl(sourceUrl),
			githubBlobToRawUrl(sourceUrl),
			githubBlobToRawUrl(repairNestedArtifactUrl(sourceUrl)),
		]))
		const store = tx.objectStore(STORE_NAME)
		let index = 0
		const tryNext = () => {
			const candidate = candidates[index]
			if (!candidate) {
				resolve(null)
				return
			}
			const request = store.get(candidate)
			request.onsuccess = () => {
				const result = (request.result as CachedRemoteLabFile | undefined) ?? null
				if (result) resolve(result)
				else {
					index += 1
					tryNext()
				}
			}
			request.onerror = () => reject(request.error ?? new Error('Failed to read remote file cache.'))
		}
		tryNext()
	}), REMOTE_LAB_FILE_IDB_TIMEOUT_MS, 'Remote file cache read')).catch((error) => {
		console.warn('[remote-lab-file] skipping cache read', error)
		return null
	})
}

function putCachedRemoteLabFile(record: CachedRemoteLabFile): Promise<void> {
	return openDb().then((db) => withTimeout(new Promise<void>((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readwrite')
		tx.objectStore(STORE_NAME).put(record)
		tx.oncomplete = () => resolve()
		tx.onerror = () => reject(tx.error ?? new Error('Failed to write remote file cache.'))
		tx.onabort = () => reject(tx.error ?? new Error('Remote file cache write was aborted.'))
	}), REMOTE_LAB_FILE_IDB_TIMEOUT_MS, 'Remote file cache write'))
}

export function listCachedRemoteLabFiles(): Promise<RemoteLabFile[]> {
	return openDb().then((db) => withTimeout(new Promise<RemoteLabFile[]>((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readonly')
		const request = tx.objectStore(STORE_NAME).getAll()
		request.onsuccess = () => {
			const records = (request.result as CachedRemoteLabFile[] | undefined) ?? []
			resolve(records.flatMap((record) => {
				const file = cachedRecordFile(record)
				if (!file) return []
				return [{
					cacheStatus: 'hit',
					file,
					fileKind: classifyLabFile(record.name),
					sourceUrl: record.sourceUrl,
				}]
			}))
		}
		request.onerror = () => reject(request.error ?? new Error('Failed to list remote file cache.'))
	}), REMOTE_LAB_FILE_IDB_TIMEOUT_MS, 'Remote file cache list')).catch((error) => {
		console.warn('[remote-lab-file] failed to list remote file cache', error)
		return []
	})
}

export function deleteCachedRemoteLabFile(sourceUrl: string): Promise<void> {
	return openDb().then((db) => withTimeout(new Promise<void>((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readwrite')
		tx.objectStore(STORE_NAME).delete(sourceUrl)
		tx.oncomplete = () => resolve()
		tx.onerror = () => reject(tx.error ?? new Error('Failed to delete remote file cache entry.'))
		tx.onabort = () => reject(tx.error ?? new Error('Remote file cache delete was aborted.'))
	}), REMOTE_LAB_FILE_IDB_TIMEOUT_MS, 'Remote file cache delete')).catch((error) => {
		console.warn('[remote-lab-file] failed to delete remote file cache entry', error)
	})
}

export function remoteLabFileName(input: string): string {
	return fileNameFromUrl(repairNestedArtifactUrl(normalizeSourceUrl(input)))
}

export function remoteLabFileKind(input: string): FileKind {
	return classifyLabFile(remoteLabFileName(input))
}

export async function fetchRemoteLabFile(input: string): Promise<RemoteLabFile> {
	const sourceUrl = repairNestedArtifactUrl(normalizeSourceUrl(input))
	assertAllowedRemoteFile(sourceUrl)
	const name = remoteLabFileName(sourceUrl)
	const fileKind = classifyLabFile(name)
	const cached = await getCachedRemoteLabFile(sourceUrl)
	if (cached) {
		const file = cachedRecordFile(cached)
		if (file) {
			return {
				cacheStatus: 'hit',
				file,
				fileKind,
				sourceUrl,
			}
		}
	}

	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), REMOTE_LAB_FILE_FETCH_TIMEOUT_MS)
	let response: Response
	try {
		response = await fetch(toFetchableUrl(sourceUrl), { signal: controller.signal })
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') {
			throw timeoutError('Remote file download', REMOTE_LAB_FILE_FETCH_TIMEOUT_MS)
		}
		throw error
	} finally {
		clearTimeout(timer)
	}
	if (!response.ok) {
		throw new Error(`Unable to fetch remote file (${response.status}).`)
	}
	const blob = await response.blob()
	const contentType = response.headers.get('content-type') ?? blob.type ?? ''
	const file = new File([blob], name, { type: contentType })
	if (blob.size <= REMOTE_LAB_FILE_CACHE_MAX_BYTES) {
		try {
			const bytes = await blob.arrayBuffer()
			await putCachedRemoteLabFile({
				bytes,
				cachedAt: new Date().toISOString(),
				contentType,
				name,
				size: blob.size,
				sourceUrl,
			})
			return { cacheStatus: 'stored', file, fileKind, sourceUrl }
		} catch (error) {
			console.warn('[remote-lab-file] failed to write remote file cache', error)
			return { cacheStatus: 'uncached', file, fileKind, sourceUrl }
		}
	}
	return { cacheStatus: 'too-large', file, fileKind, sourceUrl }
}

export function remoteLabFileCacheLimitLabel(): string {
	return humanLabSize(REMOTE_LAB_FILE_CACHE_MAX_BYTES)
}
