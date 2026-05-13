const STORAGE_KEY = 'biovault-assay-package-source-urls'

function hasLocalStorage(): boolean {
	try {
		return typeof globalThis !== 'undefined' && typeof (globalThis as { localStorage?: Storage }).localStorage !== 'undefined'
	} catch {
		return false
	}
}

function readRaw(): string[] {
	if (!hasLocalStorage()) return []
	try {
		const raw = globalThis.localStorage.getItem(STORAGE_KEY)
		if (!raw) return []
		const parsed = JSON.parse(raw)
		if (!Array.isArray(parsed)) return []
		return parsed.filter((entry): entry is string => typeof entry === 'string')
	} catch {
		return []
	}
}

function writeRaw(entries: string[]): void {
	if (!hasLocalStorage()) return
	try {
		globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
	} catch {
		// Best effort.
	}
}

export function listAssayPackageSourceUrls(): string[] {
	return readRaw()
}

export function addAssayPackageSourceUrl(sourceUrl: string): void {
	const current = new Set(readRaw())
	if (current.has(sourceUrl)) return
	current.add(sourceUrl)
	writeRaw(Array.from(current))
}

export function removeAssayPackageSourceUrl(sourceUrl: string): void {
	const current = new Set(readRaw())
	if (!current.delete(sourceUrl)) return
	writeRaw(Array.from(current))
}
