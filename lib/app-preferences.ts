import { getAppDb, getAppDbSync } from '@/lib/app-db'

export function getAppPreferenceSync(key: string): string | null {
	const db = getAppDbSync()
	return db.getFirstSync<{ value: string | null }>('SELECT value FROM app_preferences WHERE key = ?', key)?.value ?? null
}

export function setAppPreferenceSync(key: string, value: string | null) {
	const db = getAppDbSync()

	if (value === null) {
		db.runSync('DELETE FROM app_preferences WHERE key = ?', key)
		return
	}

	db.runSync(
		`INSERT INTO app_preferences (key, value)
		 VALUES (?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
		key,
		value
	)
}

export async function setAppPreference(key: string, value: string | null, retries = 3): Promise<void> {
	for (let attempt = 0; attempt <= retries; attempt += 1) {
		try {
			const db = await getAppDb()

			if (value === null) {
				await db.runAsync('DELETE FROM app_preferences WHERE key = ?', key)
				return
			}

			await db.runAsync(
				`INSERT INTO app_preferences (key, value)
				 VALUES (?, ?)
				 ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
				key,
				value
			)
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
