// IndexedDB persistence for FileSystemFileHandle objects. Handles are
// structured-cloneable, so we can stash them and reopen across reloads without
// copying the underlying bytes — the handle is just a pointer into the user's
// disk plus the permission grant. On reload we still have to re-request
// permission (Chrome prompts once per origin/session).

export type HandleBundle = {
	primary?: FileSystemFileHandle
	reference?: FileSystemFileHandle
}

export type HandlePermission = 'granted' | 'denied' | 'prompt' | 'unsupported'

const DB_NAME = 'biovault-file-handles'
const DB_VERSION = 1
const STORE = 'handles'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
	if (dbPromise) return dbPromise
	if (typeof indexedDB === 'undefined') {
		return Promise.reject(new Error('IndexedDB not available'))
	}
	dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION)
		req.onupgradeneeded = () => {
			const db = req.result
			if (!db.objectStoreNames.contains(STORE)) {
				db.createObjectStore(STORE)
			}
		}
		req.onsuccess = () => resolve(req.result)
		req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
	})
	return dbPromise
}

async function runTx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest | void): Promise<T> {
	const db = await openDb()
	return new Promise<T>((resolve, reject) => {
		const tx = db.transaction(STORE, mode)
		const store = tx.objectStore(STORE)
		const req = fn(store)
		tx.oncomplete = () => resolve((req && 'result' in req ? (req.result as T) : (undefined as T)))
		tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
		tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
	})
}

export async function putHandles(documentId: string, handles: HandleBundle): Promise<void> {
	if (!handles.primary && !handles.reference) {
		await deleteHandles(documentId)
		return
	}
	try {
		await runTx('readwrite', (store) => store.put(handles, documentId))
	} catch (err) {
		// eslint-disable-next-line no-console
		console.warn('[file-handle-store] putHandles failed', err)
	}
}

export async function getHandles(documentId: string): Promise<HandleBundle | null> {
	try {
		const result = await runTx<HandleBundle | undefined>('readonly', (store) => store.get(documentId))
		return result ?? null
	} catch (err) {
		// eslint-disable-next-line no-console
		console.warn('[file-handle-store] getHandles failed', err)
		return null
	}
}

export async function deleteHandles(documentId: string): Promise<void> {
	try {
		await runTx('readwrite', (store) => store.delete(documentId))
	} catch {
		/* noop */
	}
}

type PermissionCapableHandle = FileSystemFileHandle & {
	queryPermission?: (opts: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
	requestPermission?: (opts: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
}

export async function checkPermission(
	handle: FileSystemFileHandle | null | undefined,
): Promise<HandlePermission> {
	if (!handle) return 'unsupported'
	const ph = handle as PermissionCapableHandle
	if (typeof ph.queryPermission !== 'function') return 'unsupported'
	try {
		const state = await ph.queryPermission({ mode: 'read' })
		return state as HandlePermission
	} catch {
		return 'unsupported'
	}
}

export async function ensurePermission(
	handle: FileSystemFileHandle | null | undefined,
): Promise<HandlePermission> {
	if (!handle) return 'unsupported'
	const ph = handle as PermissionCapableHandle
	if (typeof ph.requestPermission !== 'function') return 'unsupported'
	try {
		const existing = await checkPermission(handle)
		if (existing === 'granted') return existing
		const state = await ph.requestPermission({ mode: 'read' })
		return state as HandlePermission
	} catch {
		return 'denied'
	}
}
