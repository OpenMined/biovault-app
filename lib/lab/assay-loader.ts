import { fetchRemoteAssayFileFromUrl } from '@/lib/github-assay-packages'
import { createLabMemoryFile } from '@/lib/lab/platform-file'
import type { AssayLang } from '@/lib/lab/types'

const ALLOWED_REMOTE_ASSAY_HOSTS = new Set(['github.com', 'raw.githubusercontent.com'])

export function normalizeLabSearchParam(value: string | string[] | undefined): string | null {
	if (Array.isArray(value)) return value[0]?.trim() || null
	return value?.trim() || null
}

export async function loadRemoteAssayFile(url: string): Promise<{
	file: File
	language: AssayLang
	source: string
}> {
	let parsed: URL
	try {
		parsed = new URL(url.trim())
	} catch {
		throw new Error('Enter a valid assay URL.')
	}

	if (!ALLOWED_REMOTE_ASSAY_HOSTS.has(parsed.hostname)) {
		throw new Error('Remote assay URLs must come from github.com or raw.githubusercontent.com.')
	}

	const remote = await fetchRemoteAssayFileFromUrl(url)
	return {
		file: createLabMemoryFile(
			remote.name,
			remote.contents,
			remote.language === 'python' ? 'text/x-python' : 'application/yaml',
		),
		language: remote.language,
		source: remote.source,
	}
}

export function getRemoteAssaySourceHost(url: string): string {
	try {
		return new URL(url).hostname
	} catch {
		return 'invalid'
	}
}
