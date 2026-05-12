interface AssetFetcher {
	fetch(request: Request): Promise<Response>
}

interface Env {
	ASSETS: AssetFetcher
}

const SECURITY_HEADERS = {
	'Cross-Origin-Embedder-Policy': 'credentialless',
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Permissions-Policy': 'cross-origin-isolated=(self)',
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

		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers,
		})
	},
}
