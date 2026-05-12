// Clears browser-side state Biovault writes: localStorage namespaces/keys and
// IndexedDB databases we use (Lab caches, handles, app DB shim, notifications).
// Not covered: HTTP cache / service workers, other sites' data, or files on disk
// outside what the browser stored. Followed by a hard reload in the Lab UI.

const LOCAL_STORAGE_PREFIXES = [
	'biovault-webdb:',
	'biovault-remote-resource:',
	'biovault-remote-package:',
]

/** Known non-prefixed keys (analytics, legacy AsyncStorage, etc.). */
const LOCAL_STORAGE_EXACT_KEYS = ['biovault_analytics_user_id', 'rybbit-user-id', 'notificationStore']

const INDEXED_DB_NAMES = [
	'biovault-remote-lab-files',
	'biovault-file-handles',
	'biovault-app.db',
	'biovault-notifications.db',
]
const INDEXED_DB_DELETE_TIMEOUT_MS = 2_000

async function deleteIndexedDb(name: string): Promise<void> {
	if (typeof indexedDB === 'undefined') return
	return new Promise((resolve) => {
		const timer = setTimeout(resolve, INDEXED_DB_DELETE_TIMEOUT_MS)
		const done = () => {
			clearTimeout(timer)
			resolve()
		}
		const req = indexedDB.deleteDatabase(name)
		req.onsuccess = done
		req.onerror = done
		req.onblocked = done
	})
}

export async function clearAllAppStorage(): Promise<void> {
	if (typeof globalThis !== 'undefined' && typeof globalThis.localStorage !== 'undefined') {
		const storage = globalThis.localStorage
		const keys: string[] = []
		for (let i = 0; i < storage.length; i += 1) {
			const key = storage.key(i)
			if (!key) continue
			const prefixHit = LOCAL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))
			if (prefixHit || LOCAL_STORAGE_EXACT_KEYS.includes(key)) {
				keys.push(key)
			}
		}
		for (const key of keys) storage.removeItem(key)
	}
	await Promise.all(INDEXED_DB_NAMES.map(deleteIndexedDb))
}
