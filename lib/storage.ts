/**
 * Temporary storage shim while SQLite-backed persistence is disabled.
 * This keeps the app bootable on web and native without pulling in expo-sqlite.
 */
const memoryStore = new Map<string, string>()

export const Storage = {
	getItemSync(key: string): string | null {
		try {
			if (typeof localStorage !== 'undefined') {
				return localStorage.getItem(key)
			}
		} catch (e) {
			console.warn('localStorage.getItem error:', e)
		}

		return memoryStore.get(key) ?? null
	},

	setItemSync(key: string, value: string): void {
		try {
			if (typeof localStorage !== 'undefined') {
				localStorage.setItem(key, value)
				return
			}
		} catch (e) {
			console.warn('localStorage.setItem error:', e)
		}

		memoryStore.set(key, value)
	},

	removeItemSync(key: string): void {
		try {
			if (typeof localStorage !== 'undefined') {
				localStorage.removeItem(key)
			}
		} catch (e) {
			console.warn('localStorage.removeItem error:', e)
		}

		memoryStore.delete(key)
	},
}
