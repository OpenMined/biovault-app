// Clears all browser-side state biovault writes: localStorage namespaces and
// IndexedDB databases. Used by the "Clear all" button to give users a hard
// reset without having to dig into devtools. Followed by a hard reload so
// wasm/JS bundles refetch (the dev cache-buster appends Date.now() per fetch).

const LOCAL_STORAGE_PREFIXES = [
	'biovault-webdb:',
	'biovault-remote-resource:',
	'biovault-remote-package:',
]

const INDEXED_DB_NAMES = [
	'biovault-remote-lab-files',
	'biovault-file-handles',
	'biovault-app.db',
]

async function deleteIndexedDb(name: string): Promise<void> {
	if (typeof indexedDB === 'undefined') return
	return new Promise((resolve) => {
		const req = indexedDB.deleteDatabase(name)
		req.onsuccess = () => resolve()
		req.onerror = () => resolve()
		req.onblocked = () => resolve()
	})
}

export async function clearAllAppStorage(): Promise<void> {
	if (typeof globalThis !== 'undefined' && typeof globalThis.localStorage !== 'undefined') {
		const storage = globalThis.localStorage
		const keys: string[] = []
		for (let i = 0; i < storage.length; i += 1) {
			const key = storage.key(i)
			if (key && LOCAL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) keys.push(key)
		}
		for (const key of keys) storage.removeItem(key)
	}
	await Promise.all(INDEXED_DB_NAMES.map(deleteIndexedDb))
}
