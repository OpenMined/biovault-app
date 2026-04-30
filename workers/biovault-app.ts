interface AssetFetcher {
	fetch(request: Request): Promise<Response>
}

interface Env {
	ASSETS: AssetFetcher
}

const SECURITY_HEADERS = {
	'Cross-Origin-Embedder-Policy': 'require-corp',
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Permissions-Policy': 'cross-origin-isolated=(self)',
	'X-Content-Type-Options': 'nosniff',
} as const

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
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
