import { getAnalyticsClientContext, getBioVaultAnalyticsConfig } from '@/lib/analytics'

const BIOVAULT_ANALYTICS_USER_ID_KEY = 'biovault_analytics_user_id'
const BIOVAULT_ANALYTICS_USER_ID_PREFIX = 'bv_'
const RYBBIT_SCRIPT_ID = 'biovault-rybbit-script'
const RYBBIT_LOCAL_STORAGE_USER_ID_KEY = 'rybbit-user-id'

declare global {
	interface Window {
		__BIOVAULT_RYBBIT_IDENTIFY__?: {
			attempts: number
			directIdentifyStatus?: number
			hasRybbit: boolean
			lastError?: string
			lastIdentifiedAt?: string
			scriptSrc?: string
			userId: string
		}
		rybbit?: {
			getUserId?: () => string | null
			identify?: (userId: string, traits?: Record<string, unknown>) => void
		}
	}
}

function createAnalyticsUserId(): string {
	const uuid =
		typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
			? crypto.randomUUID()
			: `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`
	return `${BIOVAULT_ANALYTICS_USER_ID_PREFIX}${uuid}`
}

function shortDisplayId(userId: string): string {
	return userId.replace(/^bv_/, '').slice(0, 8)
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

function ensureRybbitScript(): Promise<void> {
	if (typeof window === 'undefined') return Promise.resolve()
	if (typeof window.rybbit?.identify === 'function') return Promise.resolve()

	const existing = document.getElementById(RYBBIT_SCRIPT_ID) as HTMLScriptElement | null
	if (existing) {
		return new Promise((resolve) => {
			existing.addEventListener('load', () => resolve(), { once: true })
			window.setTimeout(resolve, 1500)
		})
	}

	const config = getBioVaultAnalyticsConfig()
	const script = document.createElement('script')
	script.id = RYBBIT_SCRIPT_ID
	script.src = `${config.apiEndpoint.replace(/\/+$/, '')}/script.js`
	script.defer = true
	script.dataset.siteId = config.siteId
	return new Promise((resolve) => {
		script.addEventListener('load', () => resolve(), { once: true })
		script.addEventListener('error', () => resolve(), { once: true })
		document.head.appendChild(script)
		window.setTimeout(resolve, 2000)
	})
}

export function identifyBioVaultWebUser(appVariant?: string) {
	const userId = getOrCreateBioVaultAnalyticsUserId()
	if (!userId) return
	const config = getBioVaultAnalyticsConfig()
	const traits = {
		...getAnalyticsClientContext(appVariant ?? config.variant),
		analytics_id_source: 'localstorage',
		username: `BioVault ${shortDisplayId(userId)}`,
	}
	window.__BIOVAULT_RYBBIT_IDENTIFY__ = {
		attempts: 0,
		hasRybbit: typeof window.rybbit?.identify === 'function',
		scriptSrc: `${config.apiEndpoint.replace(/\/+$/, '')}/script.js`,
		userId,
	}

	const identify = () => {
		const debug = window.__BIOVAULT_RYBBIT_IDENTIFY__
		if (debug) {
			debug.attempts += 1
			debug.hasRybbit = typeof window.rybbit?.identify === 'function'
		}
		if (typeof window.rybbit?.identify !== 'function') {
			return false
		}
		try {
			window.rybbit.identify(userId, traits)
			const identifiedId = window.rybbit.getUserId?.()
			if (debug) {
				debug.hasRybbit = true
				debug.lastIdentifiedAt = new Date().toISOString()
				if (identifiedId !== userId) {
					debug.lastError = `Rybbit getUserId returned ${identifiedId ?? 'null'}`
				} else {
					delete debug.lastError
				}
			}
			return true
		} catch (error) {
			if (debug) {
				debug.lastError = error instanceof Error ? error.message : String(error)
			}
			return false
		}
	}

	if (identify()) return
	void identifyDirectly(config.apiEndpoint, config.siteId, userId, traits)
	void ensureRybbitScript().then(() => {
		if (identify()) return
		const delays = [250, 500, 1000, 2000, 4000]
		for (const delay of delays) {
			window.setTimeout(identify, delay)
		}
	})
}

async function identifyDirectly(
	apiEndpoint: string,
	siteId: string,
	userId: string,
	traits: Record<string, unknown>,
) {
	try {
		const response = await fetch(`${apiEndpoint.replace(/\/+$/, '')}/identify`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				site_id: siteId,
				user_id: userId,
				traits,
				is_new_identify: true,
			}),
			mode: 'cors',
			keepalive: true,
		})
		const debug = window.__BIOVAULT_RYBBIT_IDENTIFY__
		if (debug) {
			debug.directIdentifyStatus = response.status
			if (response.ok) {
				debug.lastIdentifiedAt = new Date().toISOString()
			} else {
				debug.lastError = `Direct identify failed with HTTP ${response.status}`
			}
		}
	} catch (error) {
		const debug = window.__BIOVAULT_RYBBIT_IDENTIFY__
		if (debug) {
			debug.lastError = error instanceof Error ? error.message : String(error)
		}
	}
}
