const DEFAULT_SUGGESTIONS_API_URL = 'https://biovault.net/api/suggestions'

export type SuggestionMetadata = Record<string, string | number | boolean | null>

export type SubmitSuggestionInput = {
	suggestion: string
	email?: string
	newsletter?: boolean
	source?: string
	metadata?: SuggestionMetadata
}

type SuggestionsResponse = {
	success?: boolean
	ok?: boolean
	error?: string
	errors?: {
		email?: string
		form?: string
		suggestion?: string
	}
}

export function getSuggestionsApiUrl() {
	const configuredUrl = process.env.EXPO_PUBLIC_SUGGESTIONS_API_URL?.trim()
	return configuredUrl || DEFAULT_SUGGESTIONS_API_URL
}

export async function submitSuggestion(input: SubmitSuggestionInput) {
	const response = await fetch(getSuggestionsApiUrl(), {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(input),
	})

	const data = await readSuggestionsResponse(response)

	if (!response.ok || !(data.success || data.ok)) {
		throw new Error(data.errors?.suggestion ?? data.errors?.email ?? data.errors?.form ?? data.error ?? 'Suggestion failed')
	}

	return data
}

async function readSuggestionsResponse(response: Response): Promise<SuggestionsResponse> {
	try {
		return await response.json() as SuggestionsResponse
	} catch {
		return {}
	}
}
