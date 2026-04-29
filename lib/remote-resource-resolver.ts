import {
	deleteCachedRemoteResource,
	getCachedRemoteResource,
	listCachedRemoteResources,
	putCachedRemoteResource,
	type CachedRemoteResource,
} from '@/lib/remote-resource-cache'
import { resolveRemoteResourceText } from '@/modules/expo-bioscript'

export type RemoteResourceKind =
	| 'assay'
	| 'catalogue'
	| 'panel'
	| 'python'
	| 'unknown'
	| 'variant'

export type RemoteDependency = {
	kind: string
	label: string
	optional: boolean
	url: string
	version?: string | null
}

export type FetchedRemoteResource = {
	cacheStatus: 'hit' | 'miss' | 'updated'
	cachedAt: string
	contents: string
	contentType: string | null
	name: string
	previousSha256: string | null
	previousVersion: string | null
	sha256: string
	sourceUrl: string
	version: string | null
}

export type ResolvedRemoteResource = FetchedRemoteResource & {
	dependencies: RemoteDependency[]
	kind: RemoteResourceKind
	schema: string | null
	summary: string
	title: string
}

const GITHUB_BLOB_RE = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/
const ALLOWED_REMOTE_RESOURCE_HOSTS = new Set(['github.com', 'raw.githubusercontent.com'])

function fileNameFromUrl(url: URL): string {
	const parts = url.pathname.split('/').filter(Boolean)
	return decodeURIComponent(parts[parts.length - 1] || 'remote-resource')
}

function toFetchableUrl(input: string): string {
	const trimmed = input.trim()
	const match = trimmed.match(GITHUB_BLOB_RE)
	if (match) {
		const [, owner, repo, ref, path] = match
		return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`
	}
	return trimmed
}

function normalizeSourceUrl(input: string): string {
	return input.trim()
}

function summarize(kind: RemoteResourceKind, dependencies: RemoteDependency[]): string {
	const label = kind === 'unknown' ? 'remote resource' : kind
	if (!dependencies.length) return `This looks like a ${label}. No dependencies were detected.`
	return `This looks like a ${label}. It references ${dependencies.length} ${dependencies.length === 1 ? 'dependency' : 'dependencies'}.`
}

function buildCachedResource(input: {
	contents: string
	contentType: string | null
	name: string
	sha256: string
	sourceUrl: string
	version: string | null
}): CachedRemoteResource {
	return {
		cachedAt: new Date().toISOString(),
		contents: input.contents,
		contentType: input.contentType,
		name: input.name,
		sha256: input.sha256,
		sourceUrl: input.sourceUrl,
		version: input.version,
	}
}

export async function fetchRemoteResource(input: string): Promise<FetchedRemoteResource> {
	const sourceUrl = normalizeSourceUrl(input)
	const parsedSource = new URL(sourceUrl)
	if (!ALLOWED_REMOTE_RESOURCE_HOSTS.has(parsedSource.hostname)) {
		throw new Error('Remote resources must come from github.com or raw.githubusercontent.com.')
	}

	const cached = await getCachedRemoteResource(sourceUrl)
	const fetchUrl = toFetchableUrl(sourceUrl)
	const response = await fetch(fetchUrl)
	if (!response.ok) {
		if (cached) {
			return {
				...cached,
				cacheStatus: 'hit',
				previousSha256: null,
				previousVersion: null,
			}
		}
		throw new Error(`Unable to fetch remote resource (${response.status}).`)
	}

	const contents = await response.text()
	const contentType = response.headers.get('content-type')
	const name = fileNameFromUrl(parsedSource)

	return {
		cacheStatus: cached ? 'updated' : 'miss',
		cachedAt: new Date().toISOString(),
		contents,
		contentType,
		name,
		previousSha256: cached?.sha256 ?? null,
		previousVersion: cached?.version ?? null,
		sha256: '',
		sourceUrl,
		version: null,
	}
}

export async function resolveRemoteResource(input: string): Promise<ResolvedRemoteResource> {
	const fetched = await fetchRemoteResource(input)
	const resolution = await resolveRemoteResourceText(fetched.sourceUrl, fetched.name, fetched.contents)
	const cacheStatus =
		fetched.previousSha256 && fetched.previousSha256 === resolution.sha256
			? 'hit'
			: fetched.cacheStatus
	await putCachedRemoteResource(buildCachedResource({
		contents: fetched.contents,
		contentType: fetched.contentType,
		name: fetched.name,
		sha256: resolution.sha256,
		sourceUrl: fetched.sourceUrl,
		version: resolution.version ?? null,
	}))

	return {
		...fetched,
		cacheStatus,
		dependencies: resolution.dependencies,
		kind: resolution.kind,
		schema: resolution.schema ?? null,
		sha256: resolution.sha256,
		summary: summarize(resolution.kind, resolution.dependencies),
		title: resolution.title,
		version: resolution.version ?? null,
	}
}

export async function resolveCachedRemoteResource(cached: CachedRemoteResource): Promise<ResolvedRemoteResource> {
	const resolution = await resolveRemoteResourceText(cached.sourceUrl, cached.name, cached.contents)
	return {
		...cached,
		cacheStatus: 'hit',
		dependencies: resolution.dependencies,
		kind: resolution.kind,
		previousSha256: null,
		previousVersion: null,
		schema: resolution.schema ?? null,
		sha256: resolution.sha256,
		summary: summarize(resolution.kind, resolution.dependencies),
		title: resolution.title,
		version: resolution.version ?? cached.version ?? null,
	}
}

export async function listResolvedCachedRemoteResources(): Promise<ResolvedRemoteResource[]> {
	const cached = await listCachedRemoteResources()
	const resolved = await Promise.allSettled(cached.map((resource) => resolveCachedRemoteResource(resource)))
	return resolved.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
}

export async function deleteRemoteResourceCache(sourceUrl: string): Promise<void> {
	await deleteCachedRemoteResource(sourceUrl)
}

export function resourceKindLabel(kind: RemoteResourceKind): string {
	switch (kind) {
		case 'assay': return 'Assay'
		case 'catalogue': return 'Catalogue'
		case 'panel': return 'Panel'
		case 'python': return 'Python assay'
		case 'variant': return 'Variant'
		case 'unknown': return 'Unknown resource'
	}
}
