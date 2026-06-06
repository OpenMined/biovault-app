const DEFAULT_NEWSLETTER_API_URL = 'https://biovault.net/api/newsletter'

export type NewsletterMetadata = Record<string, string | number | boolean | null>

export type NewsletterSubscribeInput = {
	email: string
	source: string
	metadata?: NewsletterMetadata
}

type NewsletterResponse = {
	success?: boolean
	ok?: boolean
	error?: string
	errors?: {
		email?: string
		form?: string
	}
}

export function getNewsletterApiUrl() {
	const configuredUrl = process.env.EXPO_PUBLIC_NEWSLETTER_API_URL?.trim()
	return configuredUrl || DEFAULT_NEWSLETTER_API_URL
}

export async function subscribeToNewsletter(input: NewsletterSubscribeInput) {
	const response = await fetch(getNewsletterApiUrl(), {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(input),
	})

	const data = await readNewsletterResponse(response)

	if (!response.ok || !(data.success || data.ok)) {
		throw new Error(data.errors?.email ?? data.errors?.form ?? data.error ?? 'Newsletter signup failed')
	}

	return data
}

async function readNewsletterResponse(response: Response): Promise<NewsletterResponse> {
	try {
		return await response.json() as NewsletterResponse
	} catch {
		return {}
	}
}
