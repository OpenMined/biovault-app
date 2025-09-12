import { Buffer } from 'buffer'
import * as SecureStore from 'expo-secure-store'

export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export type AccessLevel = 1 | 2 | 4 | 8

export interface AuthTokens {
	accessToken: string
	refreshToken: string
}

export interface SyftBoxClientConfig {
	serverUrl: string
	proxyBaseUrl?: string
	logging?: boolean
}

function joinUrl(base: string, path: string): string {
	const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base
	const cleanPath = path.startsWith('/') ? path : `/${path}`
	return `${cleanBase}${cleanPath}`
}

async function request<T>(serverUrl: string, init: RequestInit & { path: string }): Promise<T> {
	const url = joinUrl(serverUrl, init.path)
	const res = await fetch(url, init)
	if (!res.ok) {
		const text = await res.text().catch(() => '')
		throw new Error(`HTTP ${res.status}: ${res.statusText} ${text}`)
	}
	const ct = res.headers.get('content-type') || ''
	if (ct.includes('application/json')) return (await res.json()) as T
	return (await res.text()) as unknown as T
}

const TOKEN_KEY = 'syftbox_auth_tokens'

async function getTokens(): Promise<AuthTokens | null> {
	const raw = await SecureStore.getItemAsync(TOKEN_KEY)
	if (!raw) return null
	try {
		return JSON.parse(raw) as AuthTokens
	} catch {
		await SecureStore.deleteItemAsync(TOKEN_KEY)
		return null
	}
}

async function setTokens(tokens: AuthTokens): Promise<void> {
	await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(tokens))
}

async function clearTokens(): Promise<void> {
	await SecureStore.deleteItemAsync(TOKEN_KEY)
}

function decodeJwtPayload(token: string): Record<string, unknown> {
	const parts = token.split('.')
	if (parts.length !== 3) throw new Error('Invalid JWT')
	const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
	const padded = base64 + '==='.slice((base64.length + 3) % 4)
	const json = Buffer.from(padded, 'base64').toString('utf8')
	return JSON.parse(json) as Record<string, unknown>
}

function isExpired(jwt: string, skewSeconds = 30): boolean {
	try {
		const json = decodeJwtPayload(jwt)
		const exp = typeof json.exp === 'number' ? (json.exp as number) : 0
		const now = Math.floor(Date.now() / 1000)
		return exp <= now + skewSeconds
	} catch {
		return true
	}
}

export class SyftBoxClient {
	private serverUrl: string
	private proxyBaseUrl: string
	private logging: boolean

	constructor(config: SyftBoxClientConfig) {
		this.serverUrl = config.serverUrl
		this.proxyBaseUrl = (config.proxyBaseUrl ?? 'http://127.0.0.1:8000') + '/proxy-download'
		this.logging = !!config.logging
	}

	// Auth
	async requestOTP(email: string): Promise<void> {
		await request<void>(this.serverUrl, {
			path: '/auth/otp/request',
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email }),
		})
	}

	async verifyOTP(email: string, code: string): Promise<AuthTokens> {
		const tokens = await request<AuthTokens>(this.serverUrl, {
			path: '/auth/otp/verify',
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email, code }),
		})
		await setTokens(tokens)
		return tokens
	}

	async ensureValidToken(): Promise<string> {
		const tokens = await getTokens()
		if (!tokens) throw new Error('Not authenticated')
		if (!isExpired(tokens.accessToken, 300)) return tokens.accessToken
		const refreshed = await this.refreshToken(tokens.refreshToken)
		await setTokens(refreshed)
		return refreshed.accessToken
	}

	async refreshToken(refreshToken?: string): Promise<AuthTokens> {
		const rt = refreshToken ?? (await getTokens())?.refreshToken
		if (!rt) throw new Error('No refresh token')
		const tokens = await request<AuthTokens>(this.serverUrl, {
			path: '/auth/refresh',
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ refreshToken: rt }),
		})
		await setTokens(tokens)
		return tokens
	}

	async logout(): Promise<void> {
		await clearTokens()
	}

	async isAuthenticated(): Promise<boolean> {
		const tokens = await getTokens()
		if (!tokens) return false
		return !isExpired(tokens.accessToken, 30)
	}

	async getCurrentUserEmail(): Promise<string | null> {
		const tokens = await getTokens()
		if (!tokens) return null
		try {
			const payload = decodeJwtPayload(tokens.accessToken)
			const emailField = typeof payload.email === 'string' ? (payload.email as string) : null
			const subField = typeof payload.sub === 'string' ? (payload.sub as string) : null
			return emailField || subField || null
		} catch {
			return null
		}
	}

	// Blob
	async upload(key: string, data: Blob | ArrayBuffer): Promise<void> {
		const accessToken = await this.ensureValidToken()
		const form = new FormData()
		const blob = data instanceof Blob ? data : new Blob([data])
		form.append('file', blob)
		await request(this.serverUrl, {
			path: `/api/v1/blob/upload?key=${encodeURIComponent(key)}`,
			method: 'PUT',
			headers: { Authorization: `Bearer ${accessToken}` },
			body: form,
		})
	}

	async downloadFile(key: string): Promise<ArrayBuffer> {
		// 1) Ask server for a presigned URL
		const token = await this.ensureValidToken()
		const { urls, errors } = await request<{
			urls: { key: string; url: string }[]
			errors?: { key: string; code: string; message: string }[]
		}>(this.serverUrl, {
			path: '/api/v1/blob/download',
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({ keys: [key] }),
		})
		if (errors && errors.length) {
			const e = errors.find((e) => e.key === key) || errors[0]
			throw new Error(`Download URL error: ${e.message}`)
		}
		const found = urls.find((u) => u.key === key)
		if (!found) throw new Error('No download URL provided')

		// 2) Fetch via local proxy to bypass CORS
		const proxyUrl = this.proxyBaseUrl
		const res = await fetch(proxyUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ url: found.url, key }),
		})
		if (!res.ok) throw new Error(`Proxy download failed: ${res.status}`)
		return await res.arrayBuffer()
	}

	async listDatasite(): Promise<
		{ key: string; size: number; lastModified: string; etag: string }[]
	> {
		const accessToken = await this.ensureValidToken()
		const resp = await request<{
			files: { key: string; size: number; lastModified: string; etag: string }[]
		}>(this.serverUrl, {
			path: '/api/v1/datasite/view',
			method: 'GET',
			headers: { Authorization: `Bearer ${accessToken}` },
		})
		return resp.files
	}

	// Simple authorized request helper
	async authed<T>(init: RequestInit & { path: string }): Promise<T> {
		const token = await this.ensureValidToken()
		const headers = new Headers(init.headers)
		headers.set('Authorization', `Bearer ${token}`)
		return request<T>(this.serverUrl, { ...init, headers })
	}
}

export function createSyftBoxClient(config: SyftBoxClientConfig): SyftBoxClient {
	return new SyftBoxClient(config)
}
