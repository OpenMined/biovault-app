import { getAppDb, getAppDbSync } from '@/lib/app-db'

type AppPreferenceListener = (value: string | null) => void

const appPreferenceListeners = new Map<string, Set<AppPreferenceListener>>()

function notifyAppPreferenceListeners(key: string, value: string | null) {
	const listeners = appPreferenceListeners.get(key)
	if (!listeners) return
	for (const listener of listeners) {
		listener(value)
	}
}

export function getAppPreferenceSync(key: string): string | null {
	const db = getAppDbSync()
	return db.getFirstSync<{ value: string | null }>('SELECT value FROM app_preferences WHERE key = ?', key)?.value ?? null
}

export function subscribeToAppPreference(key: string, listener: AppPreferenceListener): () => void {
	const listeners = appPreferenceListeners.get(key) ?? new Set<AppPreferenceListener>()
	listeners.add(listener)
	appPreferenceListeners.set(key, listeners)

	return () => {
		const current = appPreferenceListeners.get(key)
		if (!current) return
		current.delete(listener)
		if (current.size === 0) {
			appPreferenceListeners.delete(key)
		}
	}
}

export function setAppPreferenceSync(key: string, value: string | null) {
	const db = getAppDbSync()

	if (value === null) {
		db.runSync('DELETE FROM app_preferences WHERE key = ?', key)
		notifyAppPreferenceListeners(key, null)
		return
	}

	db.runSync(
		`INSERT INTO app_preferences (key, value)
		 VALUES (?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
		key,
		value
	)
	notifyAppPreferenceListeners(key, value)
}

export async function setAppPreference(key: string, value: string | null, retries = 3): Promise<void> {
	for (let attempt = 0; attempt <= retries; attempt += 1) {
		try {
			const db = await getAppDb()

			if (value === null) {
				await db.runAsync('DELETE FROM app_preferences WHERE key = ?', key)
				notifyAppPreferenceListeners(key, null)
				return
			}

			await db.runAsync(
				`INSERT INTO app_preferences (key, value)
				 VALUES (?, ?)
				 ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
				key,
				value
			)
			notifyAppPreferenceListeners(key, value)
			return
		} catch (error) {
			const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
			const isLocked = message.includes('database is locked')

			if (!isLocked || attempt === retries) {
				throw error
			}

			await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)))
		}
	}
}
