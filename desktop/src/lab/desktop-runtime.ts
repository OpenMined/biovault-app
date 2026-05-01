import { invoke } from '@tauri-apps/api/core'
import type { LabFileRef } from '@/lib/lab/core/files'
import type { LabAssayRef, LabGenomeRef } from '@/lib/lab/core/refs'
import { DesktopLabFileAdapter } from './desktop-file-adapter'
import { wsLabBridge } from './ws-lab-bridge'

export type DesktopVariantObservation = {
  name: string
  backend: string
  ref?: string
  alt?: string
  matchedRsid?: string
  assembly?: string
  genotype?: string
  refCount?: number
  altCount?: number
  depth?: number
  rawCounts: Record<string, number>
  decision?: string
  evidence: string[]
}

type DesktopRunAssayResult = {
  outputText: string
  observations?: DesktopVariantObservation[]
}

export async function runDesktopAssay(
  genome: LabGenomeRef,
  assay: LabAssayRef,
  files: DesktopLabFileAdapter,
): Promise<DesktopRunAssayResult> {
  const assayPath = requirePath(files, assay.file)
  const genomePath = requirePath(files, genome.primary)
  const request = {
    assayPath,
    genomePath,
    inputFormat: desktopInputFormat(genome),
    inputIndex: genome.kind === 'cram'
      ? requirePath(files, genome.crai)
      : genome.kind === 'vcf'
        ? requirePath(files, genome.tbi)
        : null,
    referenceFile: genome.kind === 'cram' ? requirePath(files, genome.fasta) : null,
    referenceIndex: genome.kind === 'cram' ? requirePath(files, genome.fai) : null,
  }
  if (assay.language === 'yaml') {
    return invokeOrBridge<DesktopRunAssayResult>('lab_run_variant_yaml', 'run_variant_yaml', { request })
  }
  return invokeOrBridge<DesktopRunAssayResult>('lab_run_assay', 'run_assay', { request })
}

function desktopInputFormat(genome: LabGenomeRef): string {
  switch (genome.kind) {
    case 'cram':
      return 'cram'
    case 'vcf':
      return 'vcf'
    case 'zip':
      return 'zip'
    case 'text':
      return 'text'
  }
}

function requirePath(files: DesktopLabFileAdapter, ref: LabFileRef | undefined): string {
  if (!ref) throw new Error('Genome is missing a required companion file')
  const path = files.filePath(ref)
  if (!path) throw new Error(`No desktop path registered for ${ref.name}`)
  return path
}

async function invokeOrBridge<T>(command: string, action: string, payload: unknown): Promise<T> {
  try {
    return await invoke<T>(command, payload as Record<string, unknown>)
  } catch (error) {
    if (!shouldUseBrowserBridge(error)) throw error
    return wsLabBridge.request<T>(action, payload)
  }
}

function shouldUseBrowserBridge(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /__TAURI__|not.*tauri|ipc|invoke/i.test(message)
}
