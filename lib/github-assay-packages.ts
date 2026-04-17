import { installAssayPackage } from '@/lib/installed-assays'

type GitHubDirectoryEntry = {
	name: string
	path: string
	type: 'dir' | 'file'
	url: string
}

type GitHubTreeEntry = {
	path: string
	type: 'blob' | 'tree' | 'commit'
	url: string
}

export type GitHubPackageLocation = {
	baseUrl: string
	owner: string
	path: string
	ref: string
	repo: string
}

export type RemoteGitHubAssayPackage = {
	assayPath: string
	compiledContents: string
	compiledPath: string
	location: GitHubPackageLocation
	source: string
}

export type GitHubAssayIndexEntry = {
	assemblies?: string[]
	assay_path: string
	artifact_format: string
	artifact_sha256: string
	artifact_size: number
	artifact_url: string
	category?: string
	compiled_path: string
	disclaimer?: string | null
	id: string
	notes?: string[]
	package_version?: string
	path: string
	runnable_variant_count?: number
	source_of_truth?: string
	summary?: string
	tags?: string[]
	template?: string
	title?: string
	unsupported_variant_count?: number
	works_with?: string[]
}

type GitHubAssayIndex = {
	assays?: GitHubAssayIndexEntry[]
	schema?: string
	version?: string
}

export type RemoteAssayFile = {
	contents: string
	language: 'python' | 'yaml'
	name: string
	source: string
}

function trimTrailingSlash(value: string) {
	return value.endsWith('/') ? value.slice(0, -1) : value
}

function getDecodedPath(pathname: string) {
	return pathname
		.split('/')
		.filter(Boolean)
		.map((part) => decodeURIComponent(part))
}

function getGitHubToken() {
	const token = '' // add token here for read-only access to exvitae branch (temporary) token-line
	return token ? token : null
}

function getGitHubHeaders(accept: string): HeadersInit {
	const token = getGitHubToken()
	return {
		Accept: accept,
		...(token ? { Authorization: `Bearer ${token}` } : {}),
	}
}

function buildGitHubTreeUrl(location: GitHubPackageLocation) {
	return `${location.baseUrl}/${location.owner}/${location.repo}/tree/${location.ref}/${location.path}`
}

function fileNameFromPath(path: string) {
	const trimmed = path.trim().replace(/\/+$/, '')
	const slashIndex = trimmed.lastIndexOf('/')
	return slashIndex >= 0 ? trimmed.slice(slashIndex + 1) : trimmed
}

function assayLanguageFromName(name: string): 'python' | 'yaml' | null {
	const lower = name.toLowerCase()
	if (lower.endsWith('.py')) return 'python'
	if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'yaml'
	return null
}

function parseGitHubPathUrl(input: string): GitHubPackageLocation {
	let url: URL
	try {
		url = new URL(input.trim())
	} catch {
		throw new Error('Enter a valid GitHub URL.')
	}

	if (url.hostname !== 'github.com') {
		throw new Error('Only github.com assay package URLs are supported right now.')
	}

	const parts = getDecodedPath(url.pathname)
	if (parts.length < 4) {
		throw new Error('Use a GitHub tree or blob URL that points to an assay package.')
	}

	const [owner, repo, kind, ref, ...rest] = parts
	if (!owner || !repo || !ref || (kind !== 'tree' && kind !== 'blob')) {
		throw new Error('Use a GitHub tree or blob URL that points to an assay package.')
	}

	const rawPath = rest.join('/')
	if (!rawPath) {
		throw new Error('Point the URL at an assay package directory or assay.yaml file.')
	}

	const path = kind === 'blob' && rawPath.endsWith('/assay.yaml') ? rawPath.slice(0, -'/assay.yaml'.length) : rawPath
	if (!path) {
		throw new Error('Point the URL at an assay package directory, not only assay.yaml.')
	}

	return {
		baseUrl: trimTrailingSlash(url.origin),
		owner,
		path,
		ref,
		repo,
	}
}

async function fetchGitHubJson<T>(url: string): Promise<T> {
	console.log('[github-assays] request json', {
		hasToken: Boolean(getGitHubToken()),
		url,
	})
	const response = await fetch(url, {
		headers: getGitHubHeaders('application/vnd.github+json'),
	})

	if (!response.ok) {
		console.log('[github-assays] request json failed', {
			status: response.status,
			url,
		})
		throw new Error(`GitHub request failed with status ${response.status}.`)
	}

	console.log('[github-assays] request json ok', {
		status: response.status,
		url,
	})
	return response.json() as Promise<T>
}

async function fetchGitHubText(url: string): Promise<string> {
	console.log('[github-assays] request text', {
		hasToken: Boolean(getGitHubToken()),
		url,
	})
	const response = await fetch(url, {
		headers: getGitHubHeaders('application/vnd.github.raw+json'),
	})

	if (!response.ok) {
		console.log('[github-assays] request text failed', {
			status: response.status,
			url,
		})
		throw new Error(`Unable to download assay file (${response.status}).`)
	}

	console.log('[github-assays] request text ok', {
		status: response.status,
		url,
	})
	return response.text()
}

async function fetchRemoteText(url: string): Promise<string> {
	const response = await fetch(url)
	if (!response.ok) {
		throw new Error(`Unable to download assay file (${response.status}).`)
	}
	return response.text()
}

export async function fetchGitHubFileText(
	location: GitHubPackageLocation,
	path: string
): Promise<string> {
	const endpoint = `https://api.github.com/repos/${location.owner}/${location.repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(location.ref)}`
	return fetchGitHubText(endpoint)
}

export async function fetchRemoteAssayFileFromUrl(input: string): Promise<RemoteAssayFile> {
	const trimmed = input.trim()
	let url: URL
	try {
		url = new URL(trimmed)
	} catch {
		throw new Error('Enter a valid assay URL.')
	}

	if (url.hostname === 'github.com') {
		const location = parseGitHubPathUrl(trimmed)
		const name = fileNameFromPath(location.path)
		const language = assayLanguageFromName(name)
		if (!language) {
			throw new Error('GitHub assay URL must point directly to a .py, .yaml, or .yml file.')
		}
		const contents = await fetchGitHubFileText(location, location.path)
		return {
			contents,
			language,
			name,
			source: trimmed,
		}
	}

	const name = fileNameFromPath(url.pathname)
	const language = assayLanguageFromName(name)
	if (!language) {
		throw new Error('Assay URL must end in .py, .yaml, or .yml.')
	}

	return {
		contents: await fetchRemoteText(trimmed),
		language,
		name,
		source: trimmed,
	}
}

async function fetchDirectoryEntries(
	location: GitHubPackageLocation,
	path: string
): Promise<GitHubDirectoryEntry[]> {
	const endpoint = `https://api.github.com/repos/${location.owner}/${location.repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(location.ref)}`
	const payload = await fetchGitHubJson<GitHubDirectoryEntry | GitHubDirectoryEntry[]>(endpoint)
	return Array.isArray(payload) ? payload : [payload]
}

async function fetchRecursiveTree(location: GitHubPackageLocation): Promise<GitHubTreeEntry[]> {
	const treeRef = encodeURIComponent(location.ref)
	const endpoint = `https://api.github.com/repos/${location.owner}/${location.repo}/git/trees/${treeRef}?recursive=1`
	const payload = await fetchGitHubJson<{ tree?: GitHubTreeEntry[]; truncated?: boolean }>(endpoint)
	if (!Array.isArray(payload.tree)) {
		throw new Error('GitHub tree response did not contain a tree array.')
	}
	if (payload.truncated) {
		console.log('[github-assays] recursive tree truncated', {
			ref: location.ref,
			repo: `${location.owner}/${location.repo}`,
		})
	}
	return payload.tree
}

export async function fetchGitHubPackageFiles(
	location: GitHubPackageLocation,
	path: string,
	files: Record<string, string>
): Promise<void> {
	const entries = await fetchDirectoryEntries(location, path)

	for (const entry of entries) {
		if (entry.type === 'dir') {
			await fetchGitHubPackageFiles(location, entry.path, files)
			continue
		}

		if (entry.type !== 'file') {
			continue
		}

		files[entry.path] = await fetchGitHubText(entry.url)
	}
}

export async function listRemoteGitHubAssayPackages(rootLocation: GitHubPackageLocation): Promise<RemoteGitHubAssayPackage[]> {
	console.log('[github-assays] list remote packages start', rootLocation)
	const tree = await fetchRecursiveTree(rootLocation)
	const prefix = `${rootLocation.path}/`
	const compiledPaths = tree
		.filter((entry) => entry.type === 'blob' && entry.path.startsWith(prefix) && entry.path.endsWith('/assay.compiled.yaml'))
		.map((entry) => entry.path)
		.sort()

	console.log('[github-assays] recursive tree candidates', {
		count: compiledPaths.length,
	})

	const packages = await Promise.all(
		compiledPaths.map(async (compiledPath) => {
			const path = compiledPath.slice(0, -'/assay.compiled.yaml'.length)
			const location = {
				...rootLocation,
				path,
			}
			const endpoint = `https://api.github.com/repos/${location.owner}/${location.repo}/contents/${encodeURI(compiledPath)}?ref=${encodeURIComponent(location.ref)}`
			const compiledContents = await fetchGitHubText(endpoint)
			const assayPath = `${path}/assay.yaml`
			console.log('[github-assays] found remote assay package', {
				assayPath,
				compiledPath,
			})
			return {
				assayPath,
				compiledContents,
				compiledPath,
				location,
				source: buildGitHubTreeUrl(location),
			} satisfies RemoteGitHubAssayPackage
		})
	)

	console.log('[github-assays] list remote packages done', {
		count: packages.length,
	})
	return packages
}

export async function fetchGitHubAssayIndex(rootLocation: GitHubPackageLocation): Promise<GitHubAssayIndexEntry[]> {
	const indexPath = `${rootLocation.path}/index.json`
	const endpoint = `https://api.github.com/repos/${rootLocation.owner}/${rootLocation.repo}/contents/${encodeURI(indexPath)}?ref=${encodeURIComponent(rootLocation.ref)}`
	console.log('[github-assays] fetch assay index start', {
		indexPath,
		repo: `${rootLocation.owner}/${rootLocation.repo}`,
		ref: rootLocation.ref,
	})
	const text = await fetchGitHubText(endpoint)
	const parsed = JSON.parse(text) as GitHubAssayIndex
	const assays = Array.isArray(parsed.assays) ? parsed.assays : []
	console.log('[github-assays] fetch assay index done', {
		count: assays.length,
	})
	return assays
}

export async function installAssayPackageFromGitHubUrl(url: string) {
	const location = parseGitHubPathUrl(url)
	const files: Record<string, string> = {}

	await fetchGitHubPackageFiles(location, location.path, files)

	const assayPath = `${location.path}/assay.yaml`
	if (!files[assayPath]) {
		throw new Error('The selected GitHub path does not contain an assay.yaml file.')
	}
	const compiledPath = `${location.path}/assay.compiled.yaml`
	if (!files[compiledPath]) {
		throw new Error('The selected GitHub path does not contain an assay.compiled.yaml file.')
	}

	return installAssayPackage({
		assayPath,
		compiledPath,
		files,
		source: buildGitHubTreeUrl(location),
	})
}
