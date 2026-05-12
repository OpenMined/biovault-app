import { getAnalyticsClientContext, getBioVaultAnalyticsConfig } from '@/lib/analytics'
import { getOrCreateBioVaultAnalyticsUserId, shortBioVaultAnalyticsUserId } from '@/lib/analytics-user-id'

declare global {
	interface Window {
		__BIOVAULT_RYBBIT_IDENTIFY__?: {
			attempts: number
			directIdentifyStatus?: number
			hasRybbit: boolean
			lastError?: string
			lastIdentifiedAt?: string
			mode: 'direct-api' | 'window-rybbit'
			userId: string
		}
		rybbit?: {
			getUserId?: () => string | null
			identify?: (userId: string, traits?: Record<string, unknown>) => void
		}
	}
}

export function identifyBioVaultWebUser(appVariant?: string) {
	const userId = getOrCreateBioVaultAnalyticsUserId()
	if (!userId) return
	const config = getBioVaultAnalyticsConfig()
	const traits = {
		...getAnalyticsClientContext(appVariant ?? config.variant),
		analytics_id_source: 'localstorage',
		username: `BioVault ${shortBioVaultAnalyticsUserId(userId)}`,
	}
	window.__BIOVAULT_RYBBIT_IDENTIFY__ = {
		attempts: 0,
		hasRybbit: typeof window.rybbit?.identify === 'function',
		mode: typeof window.rybbit?.identify === 'function' ? 'window-rybbit' : 'direct-api',
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
				debug.mode = 'window-rybbit'
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
			debug.mode = 'direct-api'
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
