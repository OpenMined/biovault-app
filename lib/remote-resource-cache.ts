export type CachedRemoteResource = {
	cachedAt: string
	contents: string
	contentType: string | null
	name: string
	sha256: string
	sourceUrl: string
	version: string | null
}

const CACHE_PREFIX = 'biovault-remote-resource:'

function cacheKey(sourceUrl: string): string {
	return CACHE_PREFIX + sourceUrl
}

function hasLocalStorage(): boolean {
	try {
		return typeof globalThis !== 'undefined' && typeof (globalThis as any).localStorage !== 'undefined'
	} catch {
		return false
	}
}

export async function getCachedRemoteResource(sourceUrl: string): Promise<CachedRemoteResource | null> {
	if (!hasLocalStorage()) return null
	try {
		const raw = (globalThis as any).localStorage.getItem(cacheKey(sourceUrl))
		if (!raw) return null
		return parseCachedRemoteResource(raw)
	} catch {
		return null
	}
}

function parseCachedRemoteResource(raw: string): CachedRemoteResource | null {
	try {
		const parsed = JSON.parse(raw) as Partial<CachedRemoteResource>
		if (
			typeof parsed.sourceUrl !== 'string' ||
			typeof parsed.contents !== 'string' ||
			typeof parsed.sha256 !== 'string' ||
			typeof parsed.name !== 'string' ||
			typeof parsed.cachedAt !== 'string'
		) {
			return null
		}
		return {
			cachedAt: parsed.cachedAt,
			contents: parsed.contents,
			contentType: typeof parsed.contentType === 'string' ? parsed.contentType : null,
			name: parsed.name,
			sha256: parsed.sha256,
			sourceUrl: parsed.sourceUrl,
			version: typeof parsed.version === 'string' ? parsed.version : null,
		}
	} catch {
		return null
	}
}

export async function listCachedRemoteResources(): Promise<CachedRemoteResource[]> {
	if (!hasLocalStorage()) return []
	try {
		const storage = (globalThis as any).localStorage as Storage
		const resources: CachedRemoteResource[] = []
		for (let index = 0; index < storage.length; index += 1) {
			const key = storage.key(index)
			if (!key?.startsWith(CACHE_PREFIX)) continue
			const raw = storage.getItem(key)
			if (!raw) continue
			const parsed = parseCachedRemoteResource(raw)
			if (parsed) resources.push(parsed)
		}
		return resources.sort((left, right) => right.cachedAt.localeCompare(left.cachedAt))
	} catch {
		return []
	}
}

export async function putCachedRemoteResource(resource: CachedRemoteResource): Promise<void> {
	if (!hasLocalStorage()) return
	try {
		;(globalThis as any).localStorage.setItem(cacheKey(resource.sourceUrl), JSON.stringify(resource))
	} catch {
		// Best-effort. Browsers may reject writes when storage is full/private.
	}
}

export async function deleteCachedRemoteResource(sourceUrl: string): Promise<void> {
	if (!hasLocalStorage()) return
	try {
		;(globalThis as any).localStorage.removeItem(cacheKey(sourceUrl))
	} catch {
		// Best-effort.
	}
}
