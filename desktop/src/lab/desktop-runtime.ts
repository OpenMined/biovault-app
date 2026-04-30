import { invoke } from '@tauri-apps/api/core'
import type { LabFileRef } from '@/lib/lab/core/files'
import type { LabAssayRef, LabGenomeRef } from '@/lib/lab/core/refs'
import { DesktopLabFileAdapter } from './desktop-file-adapter'

type DesktopRunAssayResult = {
  outputText: string
}

export async function runDesktopAssay(
  genome: LabGenomeRef,
  assay: LabAssayRef,
  files: DesktopLabFileAdapter,
): Promise<DesktopRunAssayResult> {
  if (assay.language !== 'python') {
    throw new Error('Desktop assay execution currently supports Python BioScript assays')
  }

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
  return invoke<DesktopRunAssayResult>('lab_run_assay', { request })
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
