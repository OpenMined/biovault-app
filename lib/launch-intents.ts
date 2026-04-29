export type LaunchIntentSource =
	| 'desktop-protocol'
	| 'native-link'
	| 'web-fragment'
	| 'web-query'

export type LaunchIntent = {
	kind: 'remote-resource'
	source: LaunchIntentSource
	url: string
}

function firstParamValue(params: URLSearchParams, names: string[]): string | null {
	for (const name of names) {
		const value = params.get(name)?.trim()
		if (value) return value
	}
	return null
}

function paramsFromFragment(hash: string): URLSearchParams {
	const fragment = hash.startsWith('#') ? hash.slice(1) : hash
	if (!fragment) return new URLSearchParams()
	const query = fragment.startsWith('?') ? fragment.slice(1) : fragment
	return new URLSearchParams(query)
}

export function parseLaunchIntentFromUrl(input: string, fallbackSource: LaunchIntentSource): LaunchIntent | null {
	let parsed: URL
	try {
		parsed = new URL(input)
	} catch {
		return null
	}

	const hashUrl = firstParamValue(paramsFromFragment(parsed.hash), ['url', 'resource'])
	if (hashUrl) {
		return {
			kind: 'remote-resource',
			source: 'web-fragment',
			url: hashUrl,
		}
	}

	const queryUrl = firstParamValue(parsed.searchParams, ['url', 'resource'])
	if (queryUrl) {
		return {
			kind: 'remote-resource',
			source: fallbackSource,
			url: queryUrl,
		}
	}

	return null
}

export function getCurrentWebLaunchIntent(): LaunchIntent | null {
	if (typeof window === 'undefined') return null
	return parseLaunchIntentFromUrl(window.location.href, 'web-query')
}

