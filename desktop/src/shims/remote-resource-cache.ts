export type CachedRemoteResource = {
  cachedAt: string
  contents: string
  contentType: string | null
  name: string
  sha256: string
  sourceUrl: string
  version: string | null
}

const resources = new Map<string, CachedRemoteResource>()

export async function getCachedRemoteResource(sourceUrl: string): Promise<CachedRemoteResource | null> {
  return resources.get(sourceUrl) ?? null
}

export async function listCachedRemoteResources(): Promise<CachedRemoteResource[]> {
  return Array.from(resources.values()).sort((left, right) => right.cachedAt.localeCompare(left.cachedAt))
}

export async function putCachedRemoteResource(resource: CachedRemoteResource): Promise<void> {
  resources.set(resource.sourceUrl, resource)
}

export async function deleteCachedRemoteResource(sourceUrl: string): Promise<void> {
  resources.delete(sourceUrl)
}
