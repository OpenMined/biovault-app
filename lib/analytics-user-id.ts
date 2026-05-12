const BIOVAULT_ANALYTICS_USER_ID_KEY = 'biovault_analytics_user_id'
const BIOVAULT_ANALYTICS_USER_ID_PREFIX = 'bv_'
const RYBBIT_LOCAL_STORAGE_USER_ID_KEY = 'rybbit-user-id'

function createAnalyticsUserId(): string {
	const uuid =
		typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
			? crypto.randomUUID()
			: `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`
	return `${BIOVAULT_ANALYTICS_USER_ID_PREFIX}${uuid}`
}

export function getOrCreateBioVaultAnalyticsUserId(): string | null {
	if (typeof window === 'undefined') return null
	try {
		const existing = window.localStorage.getItem(BIOVAULT_ANALYTICS_USER_ID_KEY)
		if (existing) {
			window.localStorage.setItem(RYBBIT_LOCAL_STORAGE_USER_ID_KEY, existing)
			return existing
		}
		const userId = createAnalyticsUserId()
		window.localStorage.setItem(BIOVAULT_ANALYTICS_USER_ID_KEY, userId)
		window.localStorage.setItem(RYBBIT_LOCAL_STORAGE_USER_ID_KEY, userId)
		return userId
	} catch (error) {
		console.warn('Analytics: Failed to persist web analytics user ID', error)
		return null
	}
}

export function shortBioVaultAnalyticsUserId(userId: string): string {
	return userId.replace(/^bv_/, '').slice(0, 8)
}
