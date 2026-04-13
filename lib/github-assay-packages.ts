import { installAssayPackage } from '@/lib/installed-assays'

type GitHubDirectoryEntry = {
	download_url: string | null
	name: string
	path: string
	type: 'dir' | 'file'
}

type ResolvedGitHubPackageLocation = {
	baseUrl: string
	owner: string
	path: string
	ref: string
	repo: string
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

function parseGitHubPathUrl(input: string): ResolvedGitHubPackageLocation {
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
	const response = await fetch(url, {
		headers: {
			Accept: 'application/vnd.github+json',
		},
	})

	if (!response.ok) {
		throw new Error(`GitHub request failed with status ${response.status}.`)
	}

	return response.json() as Promise<T>
}

async function fetchDirectoryEntries(
	location: ResolvedGitHubPackageLocation,
	path: string
): Promise<GitHubDirectoryEntry[]> {
	const endpoint = `https://api.github.com/repos/${location.owner}/${location.repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(location.ref)}`
	const payload = await fetchGitHubJson<GitHubDirectoryEntry | GitHubDirectoryEntry[]>(endpoint)
	return Array.isArray(payload) ? payload : [payload]
}

async function fetchTextFile(downloadUrl: string): Promise<string> {
	const response = await fetch(downloadUrl)
	if (!response.ok) {
		throw new Error(`Unable to download assay file (${response.status}).`)
	}
	return response.text()
}

async function collectGitHubPackageFiles(
	location: ResolvedGitHubPackageLocation,
	path: string,
	files: Record<string, string>
): Promise<void> {
	const entries = await fetchDirectoryEntries(location, path)

	for (const entry of entries) {
		if (entry.type === 'dir') {
			await collectGitHubPackageFiles(location, entry.path, files)
			continue
		}

		if (entry.type !== 'file' || !entry.download_url) {
			continue
		}

		files[entry.path] = await fetchTextFile(entry.download_url)
	}
}

export async function installAssayPackageFromGitHubUrl(url: string) {
	const location = parseGitHubPathUrl(url)
	const files: Record<string, string> = {}

	await collectGitHubPackageFiles(location, location.path, files)

	const assayPath = `${location.path}/assay.yaml`
	if (!files[assayPath]) {
		throw new Error('The selected GitHub path does not contain an assay.yaml file.')
	}

	return installAssayPackage({
		assayPath,
		files,
		source: `${location.baseUrl}/${location.owner}/${location.repo}/tree/${location.ref}/${location.path}`,
	})
}
