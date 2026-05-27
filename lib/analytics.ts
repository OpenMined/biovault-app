import Constants from 'expo-constants'
import * as Device from 'expo-device'
import { getAppPreferenceSync, setAppPreference, setAppPreferenceSync } from '@/lib/app-preferences'
import { getOrCreateBioVaultAnalyticsUserId } from '@/lib/analytics-user-id'
import { Dimensions, Platform } from 'react-native'

const DEFAULT_METRICS_ENDPOINT = 'https://metrics.syftbox.net/api'
const DEFAULT_DEV_METRICS_SITE_ID = '4'
const DEFAULT_PROD_METRICS_SITE_ID = '6'
const DEFAULT_DEV_METRICS_DOMAIN = 'dev-app.biovault.net'
const DEFAULT_PROD_METRICS_DOMAIN = 'app.biovault.net'

interface AnalyticsEvent {
	type: 'pageview' | 'custom_event' | 'performance'
	site_id: string
	hostname: string
	pathname: string
	querystring: string
	screenWidth: number
	screenHeight: number
	language: string
	page_title?: string
	referrer: string
	event_name?: string
	_bs?: number
	// Additional fields for custom events
	properties?: string
	// Browser-like fields to avoid bot detection
	user_agent?: string
	user_id?: string
	// Session tracking
	visitor_id?: string
	session_id?: string
}

type AnalyticsProperties = Record<string, any>

export interface AnalyticsOptions {
	apiEndpoint?: string
	appDomain?: string
	appVariant?: string
	siteId?: string
}

export interface BioVaultAnalyticsConfig {
	apiEndpoint: string
	appDomain: string
	siteId: string
	variant: string
}

function getWebRuntimeHostname(): string | null {
	if (Platform.OS !== 'web' || typeof window === 'undefined') return null
	return window.location.hostname || null
}

function getWebRuntimeMetricsTarget():
	| { appDomain: string; siteId: string; variant: string }
	| null {
	const hostname = getWebRuntimeHostname()
	if (!hostname) return null
	if (hostname === DEFAULT_PROD_METRICS_DOMAIN) {
		return {
			appDomain: DEFAULT_PROD_METRICS_DOMAIN,
			siteId: DEFAULT_PROD_METRICS_SITE_ID,
			variant: 'production',
		}
	}
	if (hostname === DEFAULT_DEV_METRICS_DOMAIN || hostname === 'localhost' || hostname === '127.0.0.1') {
		return {
			appDomain: DEFAULT_DEV_METRICS_DOMAIN,
			siteId: DEFAULT_DEV_METRICS_SITE_ID,
			variant: 'development',
		}
	}
	return null
}

export class Analytics {
	private siteId: string
	private apiEndpoint: string
	private sessionId: string | null = null
	private visitorId: string | null = null
	private lastActivityTime: number = Date.now()
	private customUserAgent: string | null = null
	private appDomain: string = 'app.biovault.net'
	private appVariant: string = 'development'

	constructor(
		siteId: string,
		apiEndpoint: string = DEFAULT_METRICS_ENDPOINT,
		appDomain?: string,
		appVariant?: string
	) {
		this.siteId = siteId
		this.apiEndpoint = apiEndpoint
		if (appDomain) {
			this.appDomain = appDomain
		}
		if (appVariant) {
			this.appVariant = appVariant
		}
		this.initSession()
		this.initVisitor()
	}

	private initVisitor() {
		// Get or create a persistent visitor ID
		const storedVisitorId = getAppPreferenceSync('analytics_visitor_id')
		console.log('Analytics: Retrieved stored visitor ID:', storedVisitorId)

		if (storedVisitorId) {
			this.visitorId = storedVisitorId
			console.log('Analytics: Using existing visitor ID:', this.visitorId)
		} else {
			this.visitorId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
			setAppPreferenceSync('analytics_visitor_id', this.visitorId)
			console.log('Analytics: Created new visitor ID:', this.visitorId)

			// Verify it was saved
			const verification = getAppPreferenceSync('analytics_visitor_id')
			console.log('Analytics: Verification - stored visitor ID:', verification)
		}
	}

	private initSession() {
		// For persistent sessions, use the same session ID as visitor ID
		// This ensures all events from the same user are in the same session
		const storedSessionId = getAppPreferenceSync('analytics_persistent_session_id')
		console.log('Analytics: Retrieved stored persistent session:', storedSessionId)

		if (storedSessionId) {
			this.sessionId = storedSessionId
			console.log('Analytics: Using existing persistent session:', this.sessionId)
		} else {
			// Create a persistent session ID that matches the visitor ID pattern
			this.sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
			setAppPreferenceSync('analytics_persistent_session_id', this.sessionId)
			console.log('Analytics: Created new persistent session:', this.sessionId)

			// Verify it was saved
			const verification = getAppPreferenceSync('analytics_persistent_session_id')
			console.log('Analytics: Verification - stored session ID:', verification)
		}

		// Update last activity time
		this.lastActivityTime = Date.now()
	}

	private saveSession() {
		// Just update the activity timestamp - session ID never changes
		void this.persistPreference('analytics_last_activity', this.lastActivityTime.toString())
	}

	private async persistPreference(key: string, value: string | null) {
		try {
			await setAppPreference(key, value)
		} catch (error) {
			console.warn(`Analytics: Failed to persist preference "${key}"`, error)
		}
	}

	private checkSession() {
		// For persistent sessions, just update the activity time
		this.lastActivityTime = Date.now()
		this.saveSession()
	}

	public setUserAgent(userAgent: string) {
		this.customUserAgent = userAgent
	}

	private getUserAgent(): string {
		if (this.customUserAgent) {
			return this.customUserAgent
		}

		if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.userAgent) {
			return navigator.userAgent
		}

		// Create a realistic mobile browser user agent based on the actual device
		const platform = Platform.OS
		const osVersion = Device.osVersion?.replace('.', '_') || '18_0'
		const appVersion = Constants.expoConfig?.version || '1.0.0'

		if (platform === 'ios') {
			// iOS Safari user agent format
			const deviceModel = Device.modelName || 'iPhone'
			return `Mozilla/5.0 (${deviceModel}; CPU iPhone OS ${osVersion} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1 BioVault/${appVersion}`
		} else if (platform === 'android') {
			// Android Chrome user agent format
			const androidVersion = Device.osVersion || '14'
			const deviceModel = Device.modelName || 'Pixel'
			return `Mozilla/5.0 (Linux; Android ${androidVersion}; ${deviceModel}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 BioVault/${appVersion}`
		}

		// Fallback
		return `Mozilla/5.0 (Mobile; ${Device.osName}/${Device.osVersion}) BioVault/${appVersion}`
	}

	private getProperties(properties?: AnalyticsProperties): AnalyticsProperties {
		return {
			...getAnalyticsClientContext(this.appVariant),
			...properties,
		}
	}

	private getCurrentPathname(): string {
		if (Platform.OS === 'web' && typeof window !== 'undefined') {
			return window.location.pathname || '/'
		}
		return ''
	}

	private getCurrentHostname(): string {
		if (Platform.OS === 'web' && hasTauriRuntime()) return this.appDomain
		if (Platform.OS === 'web' && typeof window !== 'undefined') {
			return window.location.hostname || this.appDomain
		}
		return this.appDomain
	}

	private getCurrentQuerystring(): string {
		if (Platform.OS === 'web' && typeof window !== 'undefined') {
			return window.location.search.replace(/^\?/, '')
		}
		return ''
	}

	private getCurrentPageTitle(): string {
		if (Platform.OS === 'web' && typeof document !== 'undefined') {
			return document.title || ''
		}
		return ''
	}

	private getWebBotScore(): number | undefined {
		return Platform.OS === 'web' ? 0 : undefined
	}

	private getPayloadUserAgent(): string | undefined {
		if (Platform.OS === 'web' && hasTauriRuntime()) return this.getUserAgent()
		return Platform.OS === 'web' ? undefined : this.getUserAgent()
	}

	private getPayloadUserId(): string | undefined {
		return Platform.OS === 'web' ? (getOrCreateBioVaultAnalyticsUserId() ?? undefined) : undefined
	}

	private getPayloadVisitorId(): string | undefined {
		return Platform.OS === 'web' ? undefined : this.visitorId || undefined
	}

	private getPayloadSessionId(): string | undefined {
		return Platform.OS === 'web' ? undefined : this.sessionId || undefined
	}

	private getRequestHeaders(): HeadersInit {
		if (Platform.OS === 'web') {
			return {
				'Content-Type': 'application/json',
				Accept: 'application/json, text/plain, */*',
			}
		}

		return {
			'Content-Type': 'application/json',
			Origin: `https://${this.appDomain}`,
			Referer: `https://${this.appDomain}/`,
			'User-Agent': this.getUserAgent(),
			Accept: 'application/json, text/plain, */*',
			'Accept-Language': 'en-US,en;q=0.9',
			'Cache-Control': 'no-cache',
			Pragma: 'no-cache',
		}
	}

	private async sendEvent(event: AnalyticsEvent) {
		try {
			this.checkSession()

			// Don't include extra fields, just send what the API expects
			const payload = event

			console.log('Analytics payload:', {
				type: event.type,
				pathname: event.pathname,
				site_id: this.siteId,
				user_id: event.user_id,
				visitor_id: event.visitor_id,
				session_id: event.session_id,
				endpoint: `${this.apiEndpoint}/track`,
			})

			const response = await fetch(`${this.apiEndpoint}/track`, {
				method: 'POST',
				headers: this.getRequestHeaders(),
				body: JSON.stringify(payload),
			})

			if (!response.ok) {
				const errorText = await response.text()
				console.log('payload', JSON.stringify(payload, null, 2))
				console.warn('Analytics tracking failed:', {
					status: response.status,
					statusText: response.statusText,
					error: errorText,
					payload: {
						type: event.type,
						site_id: this.siteId,
						pathname: event.pathname,
					},
				})
			} else {
				console.log('Analytics event sent successfully:', event.type)
			}
		} catch (error) {
			console.warn('Analytics error:', error)
		}
	}

	public async trackScreen(screenName: string, properties?: Record<string, any>) {
		// If the screenName already contains a path (like "gene/BRCA1"), use it directly
		// Otherwise, convert camelCase screen names to URL paths
		let urlPath: string
		if (screenName.includes('/')) {
			urlPath = screenName
		} else {
			urlPath = screenName
				.replace(/Screen$/, '')
				.replace(/([A-Z])/g, '-$1')
				.toLowerCase()
				.replace(/^-/, '')
		}

		await this.sendEvent({
			type: 'pageview',
			site_id: this.siteId,
			hostname: this.getCurrentHostname(),
			pathname: `/${urlPath}`,
			querystring: '',
			screenWidth: Math.round(Dimensions.get('window').width || 428),
			screenHeight: Math.round(Dimensions.get('window').height || 926),
			language: 'en-US',
			page_title: screenName.includes('/')
				? `${screenName.replace('/', ': ')} - BioVault`
				: `${screenName} - BioVault`,
			referrer: properties?.referrer || '',
			event_name: '',
			_bs: this.getWebBotScore(),
			properties: JSON.stringify(this.getProperties(properties)),
			user_agent: this.getPayloadUserAgent(),
			user_id: this.getPayloadUserId(),
			visitor_id: this.getPayloadVisitorId(),
			session_id: this.getPayloadSessionId(),
		})
	}

	public async trackEvent(eventName: string, properties?: Record<string, any>) {
		const eventProperties = this.getProperties(properties)
		await this.sendEvent({
			type: 'custom_event',
			site_id: this.siteId,
			hostname: this.getCurrentHostname(),
			pathname: this.getCurrentPathname(),
			querystring: this.getCurrentQuerystring(),
			screenWidth: Math.round(Dimensions.get('window').width || 428),
			screenHeight: Math.round(Dimensions.get('window').height || 926),
			language: 'en-US',
			page_title: this.getCurrentPageTitle(),
			referrer: '',
			event_name: eventName,
			_bs: this.getWebBotScore(),
			properties: JSON.stringify(eventProperties),
			user_agent: this.getPayloadUserAgent(),
			user_id: this.getPayloadUserId(),
			visitor_id: this.getPayloadVisitorId(),
			session_id: this.getPayloadSessionId(),
		})
	}

	public async trackError(error: Error, context?: Record<string, any>) {
		await this.sendEvent({
			type: 'custom_event',
			site_id: this.siteId,
			hostname: this.getCurrentHostname(),
			pathname: this.getCurrentPathname(),
			querystring: this.getCurrentQuerystring(),
			screenWidth: Math.round(Dimensions.get('window').width || 428),
			screenHeight: Math.round(Dimensions.get('window').height || 926),
			language: 'en-US',
			page_title: this.getCurrentPageTitle(),
			referrer: '',
			event_name: 'error',
			_bs: this.getWebBotScore(),
			properties: JSON.stringify(this.getProperties({
				message: error.message,
				stack: error.stack,
				...context,
			})),
			user_agent: this.getPayloadUserAgent(),
			user_id: this.getPayloadUserId(),
		})
	}

	public async startSession() {
		if (Platform.OS === 'web') return

		// Session is already initialized and persistent, just send start event
		console.log('Analytics: Starting session event for persistent session:', this.sessionId)

		await this.sendEvent({
			type: 'custom_event',
			site_id: this.siteId,
			hostname: this.getCurrentHostname(),
			pathname: this.getCurrentPathname(),
			querystring: this.getCurrentQuerystring(),
			screenWidth: Math.round(Dimensions.get('window').width || 428),
			screenHeight: Math.round(Dimensions.get('window').height || 926),
			language: 'en-US',
			page_title: this.getCurrentPageTitle(),
			referrer: '',
			event_name: 'session_start',
			_bs: this.getWebBotScore(),
			properties: JSON.stringify(this.getProperties()),
			user_agent: this.getPayloadUserAgent(),
			user_id: this.getPayloadUserId(),
		})
	}

	public async endSession() {
		if (Platform.OS === 'web') return

		await this.sendEvent({
			type: 'custom_event',
			site_id: this.siteId,
			hostname: this.getCurrentHostname(),
			pathname: this.getCurrentPathname(),
			querystring: this.getCurrentQuerystring(),
			screenWidth: Math.round(Dimensions.get('window').width || 428),
			screenHeight: Math.round(Dimensions.get('window').height || 926),
			language: 'en-US',
			page_title: this.getCurrentPageTitle(),
			referrer: '',
			event_name: 'session_end',
			_bs: this.getWebBotScore(),
			properties: JSON.stringify(this.getProperties()),
			user_agent: this.getPayloadUserAgent(),
			user_id: this.getPayloadUserId(),
		})

		// For persistent sessions, just update the timestamp
		this.saveSession()
		console.log('Analytics: Session end event sent, keeping persistent session:', this.sessionId)
	}
}

type AnalyticsClient = Pick<
	Analytics,
	'endSession' | 'setUserAgent' | 'startSession' | 'trackError' | 'trackEvent' | 'trackScreen'
>

let analyticsInstance: AnalyticsClient | null = null

const analyticsDisabled = process.env.EXPO_PUBLIC_DISABLE_ANALYTICS === '1'

const disabledAnalytics: AnalyticsClient = {
	setUserAgent() {},
	trackScreen: async () => {},
	trackEvent: async () => {},
	trackError: async () => {},
	startSession: async () => {},
	endSession: async () => {},
}

export const initAnalytics = (
	siteId: string,
	apiEndpoint?: string,
	appDomain?: string,
	appVariant?: string
) => {
	if (analyticsDisabled) {
		return disabledAnalytics
	}
	if (!analyticsInstance) {
		console.log('Analytics: Initializing new analytics instance')
		analyticsInstance = new Analytics(siteId, apiEndpoint, appDomain, appVariant)
	} else {
		console.log('Analytics: Using existing analytics instance')
	}
	return analyticsInstance
}

export const getAnalytics = (): AnalyticsClient | null => {
	return analyticsInstance
}

function hasTauriRuntime(): boolean {
	const globalValue = globalThis as Record<string, unknown>
	return Boolean(globalValue.__TAURI__ || globalValue.__TAURI_INTERNALS__)
}

export function getAnalyticsClientContext(appVariant = 'development'): AnalyticsProperties {
	const appVersion = Constants.expoConfig?.version || '1.0.0'
	const runtimePlatform = Platform.OS
	const clientPlatform =
		runtimePlatform === 'web' && hasTauriRuntime()
			? 'desktop'
			: runtimePlatform === 'ios'
				? 'ios'
				: runtimePlatform === 'android'
					? 'android'
					: 'web'
	const clientSurface =
		clientPlatform === 'desktop'
			? 'desktop_app'
			: clientPlatform === 'ios' || clientPlatform === 'android'
				? 'mobile_app'
				: 'web_app'

	return {
		app_name: 'biovault',
		app_version: appVersion,
		app_variant: appVariant,
		client_platform: clientPlatform,
		client_surface: clientSurface,
		runtime_platform: runtimePlatform,
		device_os_name: Device.osName ?? runtimePlatform,
		device_os_version: Device.osVersion ?? '',
		device_model: Device.modelName ?? '',
	}
}

function readExpoExtra(): Record<string, any> {
	const extra = Constants.expoConfig?.extra
	return extra && typeof extra === 'object' ? extra : {}
}

function readAnalyticsExtra(): Partial<BioVaultAnalyticsConfig> {
	const analytics = readExpoExtra().analytics
	return analytics && typeof analytics === 'object' ? analytics : {}
}

export function getBioVaultAnalyticsConfig(options: AnalyticsOptions = {}): BioVaultAnalyticsConfig {
	const extra = readAnalyticsExtra()
	const runtimeTarget = getWebRuntimeMetricsTarget()
	const variant =
		runtimeTarget?.variant ??
		options.appVariant ??
		process.env.EXPO_PUBLIC_APP_VARIANT ??
		(typeof extra.variant === 'string' ? extra.variant : undefined) ??
		'development'
	const isProduction = variant === 'production'
	const siteId =
		options.siteId ??
		runtimeTarget?.siteId ??
		process.env.EXPO_PUBLIC_BIOVAULT_METRICS_SITE_ID ??
		(typeof extra.siteId === 'string' ? extra.siteId : undefined) ??
		(isProduction ? DEFAULT_PROD_METRICS_SITE_ID : DEFAULT_DEV_METRICS_SITE_ID)
	const appDomain =
		options.appDomain ??
		runtimeTarget?.appDomain ??
		process.env.EXPO_PUBLIC_BIOVAULT_METRICS_DOMAIN ??
		(typeof extra.appDomain === 'string' ? extra.appDomain : undefined) ??
		(isProduction ? DEFAULT_PROD_METRICS_DOMAIN : DEFAULT_DEV_METRICS_DOMAIN)
	const apiEndpoint =
		options.apiEndpoint ??
		process.env.EXPO_PUBLIC_BIOVAULT_METRICS_ENDPOINT ??
		(typeof extra.apiEndpoint === 'string' ? extra.apiEndpoint : undefined) ??
		DEFAULT_METRICS_ENDPOINT

	return {
		apiEndpoint,
		appDomain,
		siteId,
		variant,
	}
}

export function initBioVaultAnalytics(options: AnalyticsOptions = {}): AnalyticsClient {
	const config = getBioVaultAnalyticsConfig(options)
	return initAnalytics(config.siteId, config.apiEndpoint, config.appDomain, config.variant)
}
