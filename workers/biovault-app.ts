interface AssetFetcher {
	fetch(request: Request): Promise<Response>
}

interface Env {
	ASSETS: AssetFetcher
}

const SECURITY_HEADERS = {
	'Cross-Origin-Embedder-Policy': 'unsafe-none',
	'Cross-Origin-Opener-Policy': 'unsafe-none',
	'Permissions-Policy': 'cross-origin-isolated=()',
	'X-Content-Type-Options': 'nosniff',
} as const

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url)
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
