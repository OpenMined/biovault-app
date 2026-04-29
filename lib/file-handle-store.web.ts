// IndexedDB persistence for FileSystemFileHandle objects. Handles are
// structured-cloneable, so we can stash them and reopen across reloads without
// copying the underlying bytes — the handle is just a pointer into the user's
// disk plus the permission grant. On reload we still have to re-request
// permission (Chrome prompts once per origin/session).

export type HandleBundle = {
	groupId?: string
	groupLabel?: string
	primary?: FileSystemFileHandle
	reference?: FileSystemFileHandle
}

export type StoredHandleBundle = {
	documentId: string
	handles: HandleBundle
}

export type HandlePermission = 'granted' | 'denied' | 'prompt' | 'unsupported'

export type HandlePermissionResult = {
	error?: string
	name?: string
	state: HandlePermission
	step: 'missing' | 'query' | 'request' | 'unsupported'
}

const DB_NAME = 'biovault-file-handles'
const DB_VERSION = 1
const STORE = 'handles'

let dbPromise: Promise<IDBDatabase> | null = null

function resetDb(db?: IDBDatabase) {
	try {
		db?.close()
	} catch {
		/* noop */
	}
	dbPromise = null
}

function isClosingConnectionError(error: unknown): boolean {
	if (!(error instanceof DOMException)) return false
	return error.name === 'InvalidStateError' && error.message.toLowerCase().includes('closing')
}

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
	}).then((db) => {
		db.onversionchange = () => resetDb(db)
		db.onclose = () => resetDb(db)
		return db
	})
	return dbPromise
}

async function runTxOnce<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest | void): Promise<T> {
	const db = await openDb()
	return new Promise<T>((resolve, reject) => {
		let tx: IDBTransaction
		let req: IDBRequest | void
		try {
			tx = db.transaction(STORE, mode)
			const store = tx.objectStore(STORE)
			req = fn(store)
		} catch (error) {
			if (isClosingConnectionError(error)) resetDb(db)
			reject(error)
			return
		}
		tx.oncomplete = () => resolve((req && 'result' in req ? (req.result as T) : (undefined as T)))
		tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
		tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
	})
}

async function runTx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest | void): Promise<T> {
	try {
		return await runTxOnce(mode, fn)
	} catch (error) {
		if (!isClosingConnectionError(error)) throw error
		return await runTxOnce(mode, fn)
	}
}

export async function putHandles(documentId: string, handles: HandleBundle): Promise<void> {
	if (!handles.primary && !handles.reference) {
		await deleteHandles(documentId)
		return
	}
	await runTx('readwrite', (store) => store.put(handles, documentId))
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

export async function listHandles(): Promise<StoredHandleBundle[]> {
	try {
		return await listHandlesOnce()
	} catch (err) {
		if (isClosingConnectionError(err)) {
			try {
				return await listHandlesOnce()
			} catch (retryErr) {
				console.warn('[file-handle-store] listHandles retry failed', retryErr)
				return []
			}
		}
		console.warn('[file-handle-store] listHandles failed', err)
		return []
	}
}

async function listHandlesOnce(): Promise<StoredHandleBundle[]> {
	const db = await openDb()
	return await new Promise<StoredHandleBundle[]>((resolve, reject) => {
		let tx: IDBTransaction
		try {
			tx = db.transaction(STORE, 'readonly')
		} catch (error) {
			if (isClosingConnectionError(error)) resetDb(db)
			reject(error)
			return
		}
		const store = tx.objectStore(STORE)
		const req = store.openCursor()
		const rows: StoredHandleBundle[] = []
		req.onsuccess = () => {
			const cursor = req.result
			if (!cursor) return
			if (typeof cursor.key === 'string') {
				rows.push({
					documentId: cursor.key,
					handles: cursor.value as HandleBundle,
				})
			}
			cursor.continue()
		}
		tx.oncomplete = () => resolve(rows)
		tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
		tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
	})
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

export async function inspectPermission(
	handle: FileSystemFileHandle | null | undefined,
): Promise<HandlePermissionResult> {
	if (!handle) return { state: 'unsupported', step: 'missing' }
	const ph = handle as PermissionCapableHandle
	if (typeof ph.queryPermission !== 'function') {
		return { name: handle.name, state: 'unsupported', step: 'unsupported' }
	}
	try {
		const state = await ph.queryPermission({ mode: 'read' })
		if (state === 'granted') return { name: handle.name, state: 'granted', step: 'query' }
		if (typeof ph.requestPermission !== 'function') {
			return { name: handle.name, state: state as HandlePermission, step: 'unsupported' }
		}
		const requested = await ph.requestPermission({ mode: 'read' })
		return { name: handle.name, state: requested as HandlePermission, step: 'request' }
	} catch (error) {
		return {
			error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
			name: handle.name,
			state: 'denied',
			step: 'request',
		}
	}
}

export async function ensurePermission(
	handle: FileSystemFileHandle | null | undefined,
): Promise<HandlePermission> {
	return (await inspectPermission(handle)).state
}
