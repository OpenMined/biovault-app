const sourceUrls = new Set<string>()

export function listAssayPackageSourceUrls(): string[] {
  return Array.from(sourceUrls)
}

export function addAssayPackageSourceUrl(sourceUrl: string): void {
  sourceUrls.add(sourceUrl)
}

export function removeAssayPackageSourceUrl(sourceUrl: string): void {
  sourceUrls.delete(sourceUrl)
}
