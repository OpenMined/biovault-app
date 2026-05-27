import { classifyLabFile, humanLabSize } from '../../../lib/lab/file-model'
import type { FileKind } from '../../../lib/lab/types'
import { makeDesktopPathFile } from './desktop-path-file'
import { invokeOrBridge } from './invoke-or-bridge'

export const REMOTE_LAB_FILE_CACHE_MAX_BYTES = 100 * 1024 * 1024

export type RemoteLabFile = {
  cacheStatus: 'hit' | 'miss' | 'stored' | 'too-large' | 'uncached'
  file: File
  fileKind: FileKind
  sourceUrl: string
}

export type FetchRemoteLabFileOptions = {
  bypassCache?: boolean
  onProgress?: (progress: { loadedBytes: number; totalBytes: number | null }) => void
}

type DesktopPickedFile = {
  lastModified?: number
  name: string
  path: string
  size: number
}

type CachedRemoteLabFile = {
  cachedAt: string
  contentType: string
  file: DesktopPickedFile
  sourceUrl: string
}

type CacheRemoteBytesRequest = {
  bytes: number[]
  contentType?: string
  name: string
  sourceUrl: string
}

const GITHUB_BLOB_RE = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/
const ALLOWED_REMOTE_FILE_HOSTS = new Set(['github.com', 'raw.githubusercontent.com'])
const DEV_REMOTE_FILE_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

function normalizeSourceUrl(input: string): string {
  return input.trim()
}

function githubBlobToRawUrl(input: string): string {
  const match = input.match(GITHUB_BLOB_RE)
  if (!match) return input
  const [, owner, repo, ref, path] = match
  return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`
}

function repairNestedArtifactUrl(input: string): string {
  try {
    const parsed = new URL(input)
    const marker = parsed.pathname.match(/\/([^/]+\.(?:ya?ml|zip))\/([^/]+\.zip)$/i)
    if (!marker) return input
    const prefix = parsed.pathname.slice(0, marker.index)
    parsed.pathname = `${prefix}/${marker[2]}`
    return parsed.toString()
  } catch {
    return input
  }
}

function toFetchableUrl(input: string): string {
  return githubBlobToRawUrl(repairNestedArtifactUrl(input.trim()))
}

function fileNameFromUrl(input: string): string {
  try {
    const parsed = new URL(input)
    const parts = parsed.pathname.split('/').filter(Boolean)
    return decodeURIComponent(parts[parts.length - 1] || 'remote-file')
  } catch {
    return 'remote-file'
  }
}

function assertAllowedRemoteFile(input: string) {
  const parsed = new URL(input)
  if (!ALLOWED_REMOTE_FILE_HOSTS.has(parsed.hostname) && !isAllowedDevRemoteHost(parsed.hostname)) {
    throw new Error('Remote files must come from github.com, raw.githubusercontent.com, or an allowed local test host.')
  }
}

function isAllowedDevRemoteHost(hostname: string): boolean {
  return DEV_REMOTE_FILE_HOSTS.has(hostname) || hostname.endsWith('.biovault.test')
}

function fromCached(record: CachedRemoteLabFile, status: RemoteLabFile['cacheStatus']): RemoteLabFile {
  const file = makeDesktopPathFile(record.file)
  return {
    cacheStatus: status,
    file,
    fileKind: classifyLabFile(file.name),
    sourceUrl: record.sourceUrl,
  }
}

export async function listCachedRemoteLabFiles(): Promise<RemoteLabFile[]> {
  const records = await invokeOrBridge<CachedRemoteLabFile[]>(
    'lab_list_cached_remote_lab_files',
    'list_cached_remote_lab_files',
    {},
  )
  return records.map((record) => fromCached(record, 'hit'))
}

export async function deleteCachedRemoteLabFile(sourceUrl: string): Promise<void> {
  await invokeOrBridge('lab_delete_cached_remote_lab_file', 'delete_cached_remote_lab_file', { sourceUrl })
}

export async function cacheRemoteLabFile(sourceUrl: string, file: File): Promise<RemoteLabFile> {
  const request: CacheRemoteBytesRequest = {
    bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
    contentType: file.type || undefined,
    name: file.name,
    sourceUrl,
  }
  const record = await invokeOrBridge<CachedRemoteLabFile>(
    'lab_cache_remote_bytes',
    'cache_remote_bytes',
    { request },
  )
  return fromCached(record, 'stored')
}

export function remoteLabFileName(input: string): string {
  return fileNameFromUrl(repairNestedArtifactUrl(normalizeSourceUrl(input)))
}

export function remoteLabFileKind(input: string): FileKind {
  return classifyLabFile(remoteLabFileName(input))
}

export async function fetchRemoteLabFile(
  input: string,
  options: FetchRemoteLabFileOptions = {},
): Promise<RemoteLabFile> {
  const sourceUrl = repairNestedArtifactUrl(normalizeSourceUrl(input))
  assertAllowedRemoteFile(sourceUrl)
  const records = options.bypassCache ? [] : await listCachedRemoteLabFiles()
  const cached = records.find((file) => {
    const candidates = new Set([
      sourceUrl,
      repairNestedArtifactUrl(sourceUrl),
      githubBlobToRawUrl(sourceUrl),
      githubBlobToRawUrl(repairNestedArtifactUrl(sourceUrl)),
    ])
    return candidates.has(file.sourceUrl)
  })
  if (cached) {
    options.onProgress?.({ loadedBytes: cached.file.size, totalBytes: cached.file.size })
    return cached
  }

  const name = remoteLabFileName(sourceUrl)
  const record = await invokeOrBridge<CachedRemoteLabFile>(
    'lab_cache_remote_url_file',
    'cache_remote_url_file',
    { request: { url: toFetchableUrl(sourceUrl), name } },
  )
  options.onProgress?.({ loadedBytes: record.file.size, totalBytes: record.file.size })
  return fromCached({ ...record, sourceUrl }, 'stored')
}

export function remoteLabFileCacheLimitLabel(): string {
  return humanLabSize(REMOTE_LAB_FILE_CACHE_MAX_BYTES)
}
