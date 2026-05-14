// Clears browser-side state Biovault writes: localStorage namespaces/keys and
// IndexedDB databases we use (Lab caches, handles, app DB shim, notifications).
// Not covered: HTTP cache / service workers, other sites' data, or files on disk
// outside what the browser stored. Followed by a hard reload in the Lab UI.

import { COLOR_SCHEME_PREFERENCE_KEY } from '@/lib/color-theme'

const LOCAL_STORAGE_PREFIXES = [
	'biovault-webdb:',
	'biovault-remote-resource:',
	'biovault-remote-package:',
]
const WEB_APP_PREFERENCES_STORAGE_KEY = 'biovault-webdb:app_preferences'

/** Known non-prefixed keys (analytics, legacy AsyncStorage, etc.). */
const LOCAL_STORAGE_EXACT_KEYS = ['biovault_analytics_user_id', 'rybbit-user-id', 'notificationStore']

const INDEXED_DB_NAMES = [
	'biovault-remote-lab-files',
	'biovault-file-handles',
	'biovault-app.db',
	'biovault-notifications.db',
]
const INDEXED_DB_DELETE_TIMEOUT_MS = 2_000

function readPreservedAppPreferences(storage: Storage): Array<{ key: string; value: string | null }> {
	try {
		const raw = storage.getItem(WEB_APP_PREFERENCES_STORAGE_KEY)
		if (!raw) return []
		const rows = JSON.parse(raw)
		if (!Array.isArray(rows)) return []
		return rows
			.filter((row): row is { key: string; value: string | null } =>
				row?.key === COLOR_SCHEME_PREFERENCE_KEY
				&& (row.value === 'light' || row.value === 'dark')
			)
			.map((row) => ({ key: row.key, value: row.value }))
	} catch {
		return []
	}
}

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
		const preservedAppPreferences = readPreservedAppPreferences(storage)
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
		if (preservedAppPreferences.length > 0) {
			storage.setItem(WEB_APP_PREFERENCES_STORAGE_KEY, JSON.stringify(preservedAppPreferences))
		}
	}
	await Promise.all(INDEXED_DB_NAMES.map(deleteIndexedDb))
}
