interface AssetFetcher {
	fetch(request: Request): Promise<Response>
}

interface D1PreparedStatement {
	bind(...values: unknown[]): D1PreparedStatement
	run(): Promise<unknown>
}

interface D1Database {
	prepare(query: string): D1PreparedStatement
}

interface NewsletterFormData {
	get(name: string): unknown
	entries(): Iterable<[string, unknown]>
}

interface Env {
	ASSETS: AssetFetcher
	DB: D1Database
}

const SECURITY_HEADERS = {
	'Cross-Origin-Embedder-Policy': 'unsafe-none',
	'Cross-Origin-Opener-Policy': 'unsafe-none',
	'Permissions-Policy': 'cross-origin-isolated=()',
	'X-Content-Type-Options': 'nosniff',
} as const

const NEWSLETTER_CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
	'Access-Control-Max-Age': '86400',
} as const

function jsonResponse(body: unknown, init?: ResponseInit) {
	const headers = new Headers(init?.headers)
	headers.set('Content-Type', 'application/json')
	for (const [name, value] of Object.entries(NEWSLETTER_CORS_HEADERS)) {
		headers.set(name, value)
	}
	return new Response(JSON.stringify(body), {
		...init,
		headers,
	})
}

function isValidEmail(email: string) {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function normalizeSource(source: string) {
	const normalized = source.trim().toLowerCase().replace(/[^a-z0-9_.:-]/g, '-')
	return normalized.slice(0, 80) || 'biovault-app-web'
}

async function readNewsletterPayload(request: Request) {
	const contentType = request.headers.get('content-type') ?? ''
	if (contentType.includes('application/json')) {
		const payload = await request.json() as Record<string, unknown>
		return {
			email: typeof payload.email === 'string' ? payload.email : '',
			source: typeof payload.source === 'string' ? payload.source : 'app',
			metadata: typeof payload.metadata === 'object' && payload.metadata !== null
				? payload.metadata as Record<string, unknown>
				: {},
		}
	}

	const form = await request.formData() as unknown as NewsletterFormData
	return {
		email: String(form.get('email') ?? ''),
		source: String(form.get('source') ?? 'biovault-app-web'),
		metadata: Object.fromEntries(
			[...form.entries()]
				.filter(([key]) => key !== 'email')
				.map(([key, value]) => [
					key,
					typeof value === 'string'
						? value
						: value && typeof value === 'object' && 'name' in value
							? String(value.name)
							: String(value ?? ''),
				])
		),
	}
}

async function handleNewsletter(request: Request, env: Env) {
	if (request.method === 'OPTIONS') {
		return new Response(null, { status: 204, headers: NEWSLETTER_CORS_HEADERS })
	}
	if (request.method !== 'POST') {
		return jsonResponse({ ok: false, error: 'Method not allowed' }, {
			status: 405,
			headers: { Allow: 'POST, OPTIONS' },
		})
	}

	const payload = await readNewsletterPayload(request)
	const email = payload.email.trim().toLowerCase()
	if (!isValidEmail(email)) {
		return jsonResponse({ ok: false, error: 'Please enter a valid email address.' }, { status: 400 })
	}
	const source = normalizeSource(payload.source)

	const metadata = JSON.stringify({
		...payload.metadata,
		source,
		signedUpFrom: 'biovault-app',
		submittedAt: new Date().toISOString(),
	})

	await env.DB.prepare(
		`INSERT INTO newsletter_subscribers (email, source, status, metadata, updated_at)
		 VALUES (?, ?, 'subscribed', ?, CURRENT_TIMESTAMP)
		 ON CONFLICT(email) DO UPDATE SET
			source = excluded.source,
			status = 'subscribed',
			metadata = excluded.metadata,
			updated_at = CURRENT_TIMESTAMP`
	).bind(email, source, metadata).run()

	return jsonResponse({ ok: true, success: true })
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url)
			if (url.pathname === '/api/newsletter' || url.pathname === '/api/waitlist') {
				return handleNewsletter(request, env)
			}

		if (url.pathname === '/web') {
			url.pathname = '/web/'
			return Response.redirect(url.toString(), 308)
		}

		const response = await env.ASSETS.fetch(request)
		const headers = new Headers(response.headers)

		for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
			headers.set(name, value)
		}

		// Expo emits content-hashed filenames under these prefixes, so the
		// bytes for a given URL never change. Cache them aggressively to stop
		// repeat visitors re-downloading the JS bundle, WASM and fonts.
		const p = url.pathname
		if (p === '/version.json' || p.endsWith('/version.json')) {
			headers.set('Cache-Control', 'no-store')
		}
		const isHashedAsset =
			p.includes('/_expo/static/') ||
			p.includes('/assets/') ||
			/\.(?:wasm|wasm\.part\d+)$/.test(p)
		if (isHashedAsset) {
			headers.set('Cache-Control', 'public, max-age=31536000, immutable')
		} else if (p.endsWith('.html') || p.endsWith('/') || !p.includes('.')) {
			headers.set('Cache-Control', 'public, max-age=0, must-revalidate')
		}

		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers,
		})
	},
}
