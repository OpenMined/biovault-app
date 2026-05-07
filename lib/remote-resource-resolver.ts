import {
	deleteCachedRemoteResource,
	getCachedRemoteResource,
	listCachedRemoteResources,
	putCachedRemoteResource,
	type CachedRemoteResource,
} from '@/lib/remote-resource-cache'
import { fetchRemoteLabFile } from '@/lib/remote-lab-file'
import {
	resolvePackageReleaseText,
	resolvePackageZipBytes,
	resolveRemoteResourceText,
	verifyPackageArtifactSha256,
	type BioscriptPackageFile,
	type BioscriptPackageRelease,
	type BioscriptPackageResource,
} from '@/modules/expo-bioscript'

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

export type ResolvedRemotePackage = {
	cacheStatus: 'hit' | 'miss'
	artifactUrl: string
	entrypoint: string
	files: BioscriptPackageFile[]
	name: string
	resources: ResolvedRemoteResource[]
	sourceUrl: string
}

type CachedRemotePackage = {
	artifactSha256: string | null
	artifactUrl: string
	cachedAt: string
	entrypoint: string
	files?: BioscriptPackageFile[]
	name: string
	resourceUrls: string[]
	sourceUrl: string
}

const GITHUB_BLOB_RE = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/
const ALLOWED_REMOTE_RESOURCE_HOSTS = new Set(['github.com', 'raw.githubusercontent.com'])
const PACKAGE_CACHE_PREFIX = 'biovault-remote-package:'

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

function hasLocalStorage(): boolean {
	try {
		return typeof globalThis !== 'undefined' && typeof (globalThis as { localStorage?: Storage }).localStorage !== 'undefined'
	} catch {
		return false
	}
}

function packageCacheKey(sourceUrl: string, artifactSha256: string | null): string {
	return `${PACKAGE_CACHE_PREFIX}${sourceUrl}#${artifactSha256 ?? 'no-sha'}`
}

function getCachedRemotePackage(sourceUrl: string, artifactSha256: string | null): CachedRemotePackage | null {
	if (!hasLocalStorage()) return null
	try {
		const raw = globalThis.localStorage.getItem(packageCacheKey(sourceUrl, artifactSha256))
		if (!raw) return null
		const parsed = JSON.parse(raw) as Partial<CachedRemotePackage>
		if (
			typeof parsed.sourceUrl !== 'string' ||
			typeof parsed.artifactUrl !== 'string' ||
			typeof parsed.entrypoint !== 'string' ||
			typeof parsed.name !== 'string' ||
			!Array.isArray(parsed.resourceUrls)
		) {
			return null
		}
		return {
			artifactSha256: typeof parsed.artifactSha256 === 'string' ? parsed.artifactSha256 : null,
			artifactUrl: parsed.artifactUrl,
			cachedAt: typeof parsed.cachedAt === 'string' ? parsed.cachedAt : new Date(0).toISOString(),
			entrypoint: parsed.entrypoint,
			files: Array.isArray(parsed.files)
				? parsed.files.filter((file): file is BioscriptPackageFile =>
						typeof file?.path === 'string' &&
						typeof file?.contents === 'string' &&
						typeof file?.source_url === 'string',
					)
				: undefined,
			name: parsed.name,
			resourceUrls: parsed.resourceUrls.filter((url): url is string => typeof url === 'string'),
			sourceUrl: parsed.sourceUrl,
		}
	} catch {
		return null
	}
}

function listCachedRemotePackages(): CachedRemotePackage[] {
	if (!hasLocalStorage()) return []
	const packages: CachedRemotePackage[] = []
	try {
		const storage = globalThis.localStorage
		for (let index = 0; index < storage.length; index += 1) {
			const key = storage.key(index)
			if (!key?.startsWith(PACKAGE_CACHE_PREFIX)) continue
			const raw = storage.getItem(key)
			if (!raw) continue
			const parsed = JSON.parse(raw) as Partial<CachedRemotePackage>
			if (
				typeof parsed.sourceUrl !== 'string' ||
				typeof parsed.artifactUrl !== 'string' ||
				typeof parsed.entrypoint !== 'string' ||
				typeof parsed.name !== 'string' ||
				!Array.isArray(parsed.resourceUrls)
			) {
				continue
			}
			packages.push({
				artifactSha256: typeof parsed.artifactSha256 === 'string' ? parsed.artifactSha256 : null,
				artifactUrl: parsed.artifactUrl,
				cachedAt: typeof parsed.cachedAt === 'string' ? parsed.cachedAt : new Date(0).toISOString(),
				entrypoint: parsed.entrypoint,
				files: Array.isArray(parsed.files)
					? parsed.files.filter((file): file is BioscriptPackageFile =>
							typeof file?.path === 'string' &&
							typeof file?.contents === 'string' &&
							typeof file?.source_url === 'string',
						)
					: undefined,
				name: parsed.name,
				resourceUrls: parsed.resourceUrls.filter((url): url is string => typeof url === 'string'),
				sourceUrl: parsed.sourceUrl,
			})
		}
	} catch {
		return []
	}
	return packages
}

function putCachedRemotePackage(record: CachedRemotePackage): void {
	if (!hasLocalStorage()) return
	try {
		globalThis.localStorage.setItem(packageCacheKey(record.sourceUrl, record.artifactSha256), JSON.stringify(record))
	} catch {
		// Best-effort package metadata cache.
	}
}

async function resolvedPackageFromCache(
	sourceUrl: string,
	release: BioscriptPackageRelease,
): Promise<ResolvedRemotePackage | null> {
	const cached = getCachedRemotePackage(sourceUrl, release.artifactSha256 ?? null)
	if (!cached) return null
	if (!cached.files?.length) return null
	const resources = await Promise.all(cached.resourceUrls.map((url) => getCachedRemoteResource(url)))
	if (resources.some((resource) => !resource)) return null
	const resolved = await Promise.all(resources.map((resource) => resolveCachedRemoteResource(resource as CachedRemoteResource)))
	return {
		artifactUrl: cached.artifactUrl,
		cacheStatus: 'hit',
		entrypoint: cached.entrypoint,
		files: cached.files,
		name: cached.name,
		resources: resolved,
		sourceUrl: cached.sourceUrl,
	}
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

function resolvedFromPackageResource(
	resource: BioscriptPackageResource,
	contentType: string | null,
): ResolvedRemoteResource {
	const resolution = resource.resolution
	return {
		cacheStatus: 'miss',
		cachedAt: new Date().toISOString(),
		contents: resource.contents,
		contentType,
		dependencies: resolution.dependencies,
		kind: resolution.kind,
		name: resolution.name,
		previousSha256: null,
		previousVersion: null,
		schema: resolution.schema ?? null,
		sha256: resolution.sha256,
		sourceUrl: resolution.source_url,
		summary: summarize(resolution.kind, resolution.dependencies),
		title: resolution.title,
		version: resolution.version ?? null,
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

export async function resolveRemotePackage(input: string): Promise<ResolvedRemotePackage> {
	const sourceUrl = normalizeSourceUrl(input)
	const parsedSource = new URL(sourceUrl)
	if (!ALLOWED_REMOTE_RESOURCE_HOSTS.has(parsedSource.hostname)) {
		throw new Error('Remote resources must come from github.com or raw.githubusercontent.com.')
	}

	const name = fileNameFromUrl(parsedSource)
	let artifactUrl = sourceUrl
	let artifactSha256: string | null = null
	let packageName = name
	let release: BioscriptPackageRelease | null = null

	if (!name.toLowerCase().endsWith('.zip')) {
		const fetched = await fetchRemoteResource(sourceUrl)
		const releaseResolution = await resolveRemoteResourceText(fetched.sourceUrl, fetched.name, fetched.contents)
		await putCachedRemoteResource(buildCachedResource({
			contents: fetched.contents,
			contentType: fetched.contentType,
			name: fetched.name,
			sha256: releaseResolution.sha256,
			sourceUrl: fetched.sourceUrl,
			version: releaseResolution.version ?? null,
		}))
		release = await resolvePackageReleaseText(fetched.sourceUrl, fetched.name, fetched.contents)
		artifactUrl = release.artifactUrl
		artifactSha256 = release.artifactSha256 ?? null
		packageName = release.name ?? release.title ?? name
		const cachedPackage = await resolvedPackageFromCache(sourceUrl, release)
		if (cachedPackage) return cachedPackage
	}

	const remoteZip = await fetchRemoteLabFile(artifactUrl)
	const zipBytes = new Uint8Array(await remoteZip.file.arrayBuffer())
	if (artifactSha256) {
		await verifyPackageArtifactSha256(remoteZip.file.name, zipBytes, artifactSha256)
	}
	const pkg = await resolvePackageZipBytes(artifactUrl, remoteZip.file.name, zipBytes)
	const contentType = remoteZip.file.type || null
	const resources = pkg.resources.map((resource) => resolvedFromPackageResource(resource, contentType))

	for (const resource of resources) {
		await putCachedRemoteResource(buildCachedResource({
			contents: resource.contents,
			contentType: resource.contentType,
			name: resource.name,
			sha256: resource.sha256,
			sourceUrl: resource.sourceUrl,
			version: resource.version,
		}))
	}
	putCachedRemotePackage({
		artifactSha256,
		artifactUrl,
		cachedAt: new Date().toISOString(),
		entrypoint: pkg.entrypoint,
		files: pkg.files,
		name: pkg.name ?? packageName,
		resourceUrls: resources.map((resource) => resource.sourceUrl),
		sourceUrl,
	})

	return {
		artifactUrl,
		cacheStatus: remoteZip.cacheStatus === 'hit' ? 'hit' : 'miss',
		entrypoint: pkg.entrypoint,
		files: pkg.files,
		name: pkg.name ?? packageName,
		resources,
		sourceUrl,
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

export async function listResolvedCachedRemotePackages(): Promise<ResolvedRemotePackage[]> {
	const packages = listCachedRemotePackages()
	const resolved = await Promise.allSettled(
		packages.map(async (pkg): Promise<ResolvedRemotePackage> => {
			if (!pkg.files?.length) throw new Error(`Cached package ${pkg.name} has no package files`)
			const resources = await Promise.all(pkg.resourceUrls.map((url) => getCachedRemoteResource(url)))
			if (resources.some((resource) => !resource)) throw new Error(`Cached package ${pkg.name} is missing resources`)
			return {
				artifactUrl: pkg.artifactUrl,
				cacheStatus: 'hit',
				entrypoint: pkg.entrypoint,
				files: pkg.files,
				name: pkg.name,
				resources: await Promise.all(resources.map((resource) => resolveCachedRemoteResource(resource as CachedRemoteResource))),
				sourceUrl: pkg.sourceUrl,
			}
		}),
	)
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
