import { getAppDbSync } from '@/lib/app-db'

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
