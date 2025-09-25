import Storage from 'expo-sqlite/kv-store'
import Constants from 'expo-constants'
import * as Device from 'expo-device'
import { Dimensions, Platform } from 'react-native'

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
	// Additional fields for custom events
	properties?: string
	// Browser-like fields to avoid bot detection
	user_agent?: string
	viewport_width?: number
	viewport_height?: number
	// Session tracking
	visitor_id?: string
	session_id?: string
}

class Analytics {
	private siteId: string
	private apiEndpoint: string
	private sessionId: string | null = null
	private visitorId: string | null = null
	private lastActivityTime: number = Date.now()
	private customUserAgent: string | null = null
	private appDomain: string = 'app.biovault.net'

	constructor(
		siteId: string,
		apiEndpoint: string = 'https://metrics.syftbox.net/api',
		appDomain?: string
	) {
		this.siteId = siteId
		this.apiEndpoint = apiEndpoint
		if (appDomain) {
			this.appDomain = appDomain
		}
		this.initSession()
		this.initVisitor()
	}

	private initVisitor() {
		// Get or create a persistent visitor ID
		const storedVisitorId = Storage.getItemSync('analytics_visitor_id')
		console.log('Analytics: Retrieved stored visitor ID:', storedVisitorId)

		if (storedVisitorId) {
			this.visitorId = storedVisitorId
			console.log('Analytics: Using existing visitor ID:', this.visitorId)
		} else {
			this.visitorId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
			Storage.setItemSync('analytics_visitor_id', this.visitorId)
			console.log('Analytics: Created new visitor ID:', this.visitorId)

			// Verify it was saved
			const verification = Storage.getItemSync('analytics_visitor_id')
			console.log('Analytics: Verification - stored visitor ID:', verification)
		}
	}

	private initSession() {
		// For persistent sessions, use the same session ID as visitor ID
		// This ensures all events from the same user are in the same session
		const storedSessionId = Storage.getItemSync('analytics_persistent_session_id')
		console.log('Analytics: Retrieved stored persistent session:', storedSessionId)

		if (storedSessionId) {
			this.sessionId = storedSessionId
			console.log('Analytics: Using existing persistent session:', this.sessionId)
		} else {
			// Create a persistent session ID that matches the visitor ID pattern
			this.sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
			Storage.setItemSync('analytics_persistent_session_id', this.sessionId)
			console.log('Analytics: Created new persistent session:', this.sessionId)

			// Verify it was saved
			const verification = Storage.getItemSync('analytics_persistent_session_id')
			console.log('Analytics: Verification - stored session ID:', verification)
		}

		// Update last activity time
		this.lastActivityTime = Date.now()
	}

	private saveSession() {
		// Just update the activity timestamp - session ID never changes
		Storage.setItemSync('analytics_last_activity', this.lastActivityTime.toString())
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

	private async sendEvent(event: AnalyticsEvent) {
		try {
			this.checkSession()

			// Don't include extra fields, just send what the API expects
			const payload = event

			console.log('Analytics payload:', {
				type: event.type,
				pathname: event.pathname,
				site_id: this.siteId,
				visitor_id: event.visitor_id,
				session_id: event.session_id,
				endpoint: `${this.apiEndpoint}/track`,
			})

			const response = await fetch(`${this.apiEndpoint}/track`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Origin: `https://${this.appDomain}`,
					Referer: `https://${this.appDomain}/`,
					'User-Agent': this.getUserAgent(),
					Accept: 'application/json, text/plain, */*',
					'Accept-Language': 'en-US,en;q=0.9',
					'Cache-Control': 'no-cache',
					Pragma: 'no-cache',
				},
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
			hostname: this.appDomain,
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
			user_agent: this.getUserAgent(),
			viewport_width: Math.round(Dimensions.get('window').width || 428),
			viewport_height: Math.round(Dimensions.get('window').height || 926),
			visitor_id: this.visitorId || undefined,
			session_id: this.sessionId || undefined,
		})
	}

	public async trackEvent(eventName: string, properties?: Record<string, any>) {
		await this.sendEvent({
			type: 'custom_event',
			site_id: this.siteId,
			hostname: this.appDomain,
			pathname: '',
			querystring: '',
			screenWidth: Math.round(Dimensions.get('window').width || 428),
			screenHeight: Math.round(Dimensions.get('window').height || 926),
			language: 'en-US',
			page_title: '',
			referrer: '',
			event_name: eventName,
			properties: properties ? JSON.stringify(properties) : undefined,
			user_agent: this.getUserAgent(),
			viewport_width: Math.round(Dimensions.get('window').width || 428),
			viewport_height: Math.round(Dimensions.get('window').height || 926),
			visitor_id: this.visitorId || undefined,
			session_id: this.sessionId || undefined,
		})
	}

	public async trackError(error: Error, context?: Record<string, any>) {
		await this.sendEvent({
			type: 'custom_event',
			site_id: this.siteId,
			hostname: this.appDomain,
			pathname: '',
			querystring: '',
			screenWidth: Math.round(Dimensions.get('window').width || 428),
			screenHeight: Math.round(Dimensions.get('window').height || 926),
			language: 'en-US',
			page_title: '',
			referrer: '',
			event_name: 'error',
			properties: JSON.stringify({
				message: error.message,
				stack: error.stack,
				...context,
			}),
			user_agent: this.getUserAgent(),
			viewport_width: Math.round(Dimensions.get('window').width || 428),
			viewport_height: Math.round(Dimensions.get('window').height || 926),
		})
	}

	public async startSession() {
		// Session is already initialized and persistent, just send start event
		console.log('Analytics: Starting session event for persistent session:', this.sessionId)

		await this.sendEvent({
			type: 'custom_event',
			site_id: this.siteId,
			hostname: this.appDomain,
			pathname: '',
			querystring: '',
			screenWidth: Math.round(Dimensions.get('window').width || 428),
			screenHeight: Math.round(Dimensions.get('window').height || 926),
			language: 'en-US',
			page_title: '',
			referrer: '',
			event_name: 'session_start',
			user_agent: this.getUserAgent(),
			viewport_width: Math.round(Dimensions.get('window').width || 428),
			viewport_height: Math.round(Dimensions.get('window').height || 926),
		})
	}

	public async endSession() {
		await this.sendEvent({
			type: 'custom_event',
			site_id: this.siteId,
			hostname: this.appDomain,
			pathname: '',
			querystring: '',
			screenWidth: Math.round(Dimensions.get('window').width || 428),
			screenHeight: Math.round(Dimensions.get('window').height || 926),
			language: 'en-US',
			page_title: '',
			referrer: '',
			event_name: 'session_end',
			user_agent: this.getUserAgent(),
			viewport_width: Math.round(Dimensions.get('window').width || 428),
			viewport_height: Math.round(Dimensions.get('window').height || 926),
		})

		// For persistent sessions, just update the timestamp
		this.saveSession()
		console.log('Analytics: Session end event sent, keeping persistent session:', this.sessionId)
	}
}

let analyticsInstance: Analytics | null = null

export const initAnalytics = (siteId: string, apiEndpoint?: string, appDomain?: string) => {
	if (!analyticsInstance) {
		console.log('Analytics: Initializing new analytics instance')
		analyticsInstance = new Analytics(siteId, apiEndpoint, appDomain)
	} else {
		console.log('Analytics: Using existing analytics instance')
	}
	return analyticsInstance
}

export const getAnalytics = (): Analytics | null => {
	return analyticsInstance
}
