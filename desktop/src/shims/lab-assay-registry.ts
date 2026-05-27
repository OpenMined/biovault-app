import type { BioscriptPackageFile } from '@/modules/expo-bioscript'

export type RegistryOrigin = 'url' | 'local-drop'

export type RegistryPanel = {
  id: string
  version: string | null
  title: string
  label?: string | null
  summary?: string | null
  tags?: string[]
  sourceUrl: string | null
  artifactUrl?: string | null
  artifactSha256?: string | null
  entrypoint: string
  files: BioscriptPackageFile[]
  memberAssayIds: string[]
  origin: RegistryOrigin
  cachedAt: string
}

export type RegistryAssay = {
  id: string
  version: string | null
  title: string
  label?: string | null
  summary?: string | null
  tags?: string[]
  parentPanelId?: string | null
  sourceUrl: string | null
  pathInPackage?: string | null
  artifactUrl?: string | null
  artifactSha256?: string | null
  entrypoint?: string | null
  files?: BioscriptPackageFile[] | null
  origin: RegistryOrigin
  cachedAt: string
}

export type PackageRunBundle = { entrypoint: string; files: BioscriptPackageFile[] }

const panels = new Map<string, RegistryPanel>()
const assays = new Map<string, RegistryAssay>()

export async function upsertPanel(panel: RegistryPanel): Promise<void> {
  panels.set(panel.id, { ...panel, cachedAt: panel.cachedAt || new Date().toISOString() })
}

export async function upsertAssay(assay: RegistryAssay): Promise<void> {
  assays.set(assay.id, { ...assay, cachedAt: assay.cachedAt || new Date().toISOString() })
}

export async function getPanel(id: string): Promise<RegistryPanel | null> {
  return panels.get(id) ?? null
}

export async function getAssay(id: string): Promise<RegistryAssay | null> {
  return assays.get(id) ?? null
}

export async function listPanels(): Promise<RegistryPanel[]> {
  return Array.from(panels.values())
}

export async function listAssays(): Promise<RegistryAssay[]> {
  return Array.from(assays.values())
}

export async function removeAssay(id: string): Promise<void> {
  assays.delete(id)
}

export async function removePanel(id: string): Promise<void> {
  panels.delete(id)
  for (const [id, assay] of assays.entries()) {
    if (assay.parentPanelId === id) assays.delete(id)
  }
}

export async function resolvePackageForRun(
  kind: 'panel' | 'assay',
  id: string,
): Promise<PackageRunBundle | null> {
  if (kind === 'panel') {
    const panel = panels.get(id)
    return panel ? { entrypoint: panel.entrypoint, files: panel.files } : null
  }
  const assay = assays.get(id)
  if (!assay) return null
  if (assay.parentPanelId) {
    const panel = panels.get(assay.parentPanelId)
    return panel ? { entrypoint: assay.pathInPackage || panel.entrypoint, files: panel.files } : null
  }
  return assay.entrypoint && assay.files?.length ? { entrypoint: assay.entrypoint, files: assay.files } : null
}

export async function isRunReady(kind: 'panel' | 'assay', id: string): Promise<boolean> {
  const bundle = await resolvePackageForRun(kind, id)
  return Boolean(bundle?.files?.length && bundle.entrypoint)
}
