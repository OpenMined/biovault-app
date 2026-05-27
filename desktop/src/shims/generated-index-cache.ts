import type { LabFileRef } from '@/lib/lab/core/files'

const indexes = new Map<string, File>()

function cacheKey(ref: LabFileRef, suffix: string): string {
  return `${suffix}:${ref.name}:${ref.size}:${ref.lastModified ?? 0}`
}

export async function getCachedGeneratedVcfIndexFile(vcfRef: LabFileRef): Promise<File | null> {
  return getCachedGeneratedIndexFile(vcfRef, 'tbi')
}

export async function putCachedGeneratedVcfIndexFile(vcfRef: LabFileRef, indexFile: File): Promise<void> {
  return putCachedGeneratedIndexFile(vcfRef, 'tbi', indexFile)
}

export async function getCachedGeneratedIndexFile(ref: LabFileRef, suffix: string): Promise<File | null> {
  return indexes.get(cacheKey(ref, suffix)) ?? null
}

export async function putCachedGeneratedIndexFile(ref: LabFileRef, suffix: string, indexFile: File): Promise<void> {
  indexes.set(cacheKey(ref, suffix), indexFile)
}
