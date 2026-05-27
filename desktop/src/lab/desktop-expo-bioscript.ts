import { invokeOrBridge } from './invoke-or-bridge'
import { desktopPathForFile } from './desktop-path-file'
import YAML from 'yaml'
import assayResultSchema from '../../../bioscript/assay_result_schema.json'

export type BioscriptInputFormat = 'auto' | 'text' | 'zip' | 'vcf' | 'cram' | 'bam'

export type GenomeDescriptor =
  | { kind: 'text'; name: string; text: string }
  | { kind: 'zip'; name: string; bytes: Uint8Array }
  | { kind: 'vcf'; name: string; vcfFile: File; tbiBytes: Uint8Array }
  | { kind: 'bam'; name: string; bamFile: File; baiBytes: Uint8Array }
  | {
      kind: 'cram'
      name: string
      cramFile: File
      craiBytes: Uint8Array
      fastaFile: File
      faiBytes: Uint8Array
    }

export type RunFileRequest = {
  scriptPath: string
  scriptContents?: string
  root?: string
  inputFile?: string
  inputContents?: string
  inputBytes?: number[]
  inputIndexBytes?: number[]
  referenceIndexBytes?: number[]
  outputFile?: string
  fileContents?: Record<string, string>
  participantId?: string
  traceReportPath?: string
  timingReportPath?: string
  inputFormat?: BioscriptInputFormat
  inputIndex?: string
  referenceFile?: string
  referenceIndex?: string
  allowMd5Mismatch?: boolean
  autoIndex?: boolean
  cacheDir?: string
  maxDurationMs?: number
  maxMemoryBytes?: number
  maxAllocations?: number
  maxRecursionDepth?: number
  genomes?: Record<string, GenomeDescriptor>
}

export type RunFileResult = {
  ok: boolean
  outputText?: string
  outputFiles?: Record<string, string>
  assay?: {
    implementationKind: 'panel' | 'script'
    unsupportedVariants: UnsupportedAssayVariant[]
  }
}

export type BioscriptInspectOptions = {
  detectSex?: boolean
  inputIndexPath?: string
  referenceFilePath?: string
  referenceIndexPath?: string
}

type BioscriptConfidence = 'authoritative' | 'strong_heuristic' | 'weak_heuristic' | 'unknown'

export type BioscriptInspection = {
  fileName: string
  container: 'plain' | 'zip'
  detectedKind:
    | 'genotype_text'
    | 'vcf'
    | 'alignment_cram'
    | 'alignment_bam'
    | 'reference_fasta'
    | 'unknown'
  confidence: BioscriptConfidence
  assembly?: 'grch37' | 'grch38'
  phased?: boolean
  source?: {
    vendor: string
    platformVersion?: string
    confidence: BioscriptConfidence
    evidence: string[]
  }
  selectedEntry?: string
  hasIndex?: boolean
  referenceMatches?: boolean
  evidence: string[]
  warnings: string[]
  durationMs: number
}

export type VariantSpec = {
  name: string
  chrom: string
  start: number
  end: number
  ref: string
  alt: string
  observed_alts?: string[]
  rsid?: string
  assembly?: string
  kind?: string
  deletion_length?: number
}

export type VariantObservation = {
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

export type VariantLookupResult = {
  durationMs: number
  observations: VariantObservation[]
}

export type CramVariantObservation = VariantObservation
export type CramVariantSpec = VariantSpec
export type CramVariantLookupResult = VariantLookupResult

export type VcfVariantLookupInput = {
  vcfFile: File
  tbiBytes: Uint8Array
  variants: VariantSpec[]
}

export type BamVariantLookupInput = {
  bamFile: File
  baiBytes: Uint8Array
  variants: VariantSpec[]
}

export type CramVariantLookupInput = {
  cramFile: File
  craiBytes: Uint8Array
  fastaFile: File
  faiBytes: Uint8Array
  variants: VariantSpec[]
}

export type BioscriptRemoteDependency = {
  kind: string
  label: string
  optional: boolean
  url: string
  version?: string | null
}

export type BioscriptRemoteResourceResolution = {
  dependencies: BioscriptRemoteDependency[]
  kind: 'assay' | 'catalogue' | 'panel' | 'python' | 'unknown' | 'variant'
  name: string
  schema?: string | null
  sha256: string
  source_url: string
  title: string
  version?: string | null
}

export type BioscriptPackageFile = {
  contents: string
  path: string
  source_url?: string
  sourceUrl?: string
}

export type BioscriptPackageResource = {
  contents: string
  path: string
  resolution: BioscriptRemoteResourceResolution
}

export type BioscriptPackageResolution = {
  entrypoint: string
  files: BioscriptPackageFile[]
  name?: string | null
  resources: BioscriptPackageResource[]
}

export type BioscriptPackageRelease = {
  artifactSha256?: string | null
  artifactSizeBytes?: number | null
  artifactUrl: string
  entrypoint?: string | null
  name?: string | null
  title: string
  version?: string | null
}

export type BioscriptReportArtifact = {
  mimeType: string
  name: string
  path: string
  text: string
}

export type BioscriptPackageReportOptions = {
  analysisMaxDurationMs?: number
  detectSex?: boolean
  filters?: string[]
}

export type BioscriptPackageReportResult = {
  artifacts: BioscriptReportArtifact[]
  durationMs: number
  textOutput: string
}

export type RunAssayRequest = {
  assayPath: string
  assayContents?: string
  compiledContents?: string
  compiledPath?: string
  progressFile?: string
  root?: string
  inputFile?: string
  inputContents?: string
  outputFile?: string
  outputFileOverride?: string
  fileContents?: Record<string, string>
  participantId?: string
  traceReportPath?: string
  timingReportPath?: string
  inputFormat?: BioscriptInputFormat
  inputIndex?: string
  referenceFile?: string
  referenceIndex?: string
  autoIndex?: boolean
  cacheDir?: string
  maxDurationMs?: number
  maxMemoryBytes?: number
  maxAllocations?: number
  maxRecursionDepth?: number
  genomes?: Record<string, GenomeDescriptor>
}
export type UnsupportedAssayVariant = { variantName: string; target: string; reason: string }

type VariantDefinition = {
  gene?: string
  label: string
  location?: string
  note?: string
  alts?: string[]
  name: string
  fields: Record<string, string | number | string[] | undefined>
}

type LoadedAssayPackage = {
  implementationKind: 'panel' | 'script'
  outputFile: string
  scriptPath: string
  scriptContents: string
  bundledFiles: Record<string, string>
  unsupportedVariants: UnsupportedAssayVariant[]
}

const ASSAY_OUTCOME_FIELD =
  typeof assayResultSchema.outcomeField === 'string' && assayResultSchema.outcomeField
    ? assayResultSchema.outcomeField
    : 'assay_outcome'

export function isBioscriptAvailable(): boolean {
  return true
}

export async function warmupBioscriptRuntime(): Promise<void> {}
export async function warmupMontyRuntime(): Promise<void> {}
export async function warmupBioscriptLookupWorker(): Promise<void> {}

export async function runFile(request: RunFileRequest): Promise<RunFileResult> {
  const inputDescriptor = request.inputFile ? request.genomes?.[request.inputFile] : undefined
  const linkedRequest = inputDescriptor ? await linkedDesktopRunFileRequest(request, inputDescriptor) : null
  const desktopRequest: RunFileRequest = {
    ...(linkedRequest ?? request),
    inputBytes:
      !request.inputContents && inputDescriptor?.kind === 'zip'
        ? Array.from(inputDescriptor.bytes)
        : linkedRequest?.inputBytes ?? request.inputBytes,
  }
  return invokeOrBridge<RunFileResult>('lab_run_file_request', 'run_file_request', { request: desktopRequest })
}

async function linkedDesktopRunFileRequest(
  request: RunFileRequest,
  descriptor: GenomeDescriptor,
): Promise<RunFileRequest | null> {
  if (descriptor.kind === 'text' || descriptor.kind === 'zip') return null
  const primaryFile =
    descriptor.kind === 'vcf'
      ? descriptor.vcfFile
      : descriptor.kind === 'bam'
        ? descriptor.bamFile
        : descriptor.cramFile
  const primaryPath = desktopPathForFile(primaryFile)
  if (!primaryPath || !request.root) return null

  const runtimePath = (name: string) => `${request.root?.replace(/\/$/, '')}/inputs/${name}`.replace(/^\/+/, '')
  const runtimeFilePath = (name: string) => `${request.root?.replace(/\/$/, '')}/${name}`.replace(/^\/+/, '')
  const remappedFileContents = request.fileContents
    ? Object.fromEntries(Object.entries(request.fileContents).map(([path, contents]) => [runtimeFilePath(path), contents]))
    : request.fileContents
  const scriptPath = runtimeFilePath(request.scriptPath)
  const outputFile = request.outputFile
    ? `${request.root.replace(/\/$/, '')}/${request.outputFile}`.replace(/^\/+/, '')
    : request.outputFile
  const cacheDir = request.cacheDir
    ? `${request.root.replace(/\/$/, '')}/${request.cacheDir}`.replace(/^\/+/, '')
    : request.cacheDir

  if (descriptor.kind === 'vcf') {
    return {
      ...request,
      root: '/',
      scriptPath,
      fileContents: remappedFileContents,
      inputFile: primaryPath.replace(/^\/+/, ''),
      inputFormat: 'vcf',
      inputIndex: runtimePath(`${primaryFile.name}.tbi`),
      inputIndexBytes: Array.from(descriptor.tbiBytes),
      outputFile,
      cacheDir,
    }
  }

  if (descriptor.kind === 'bam') {
    return {
      ...request,
      root: '/',
      scriptPath,
      fileContents: remappedFileContents,
      inputFile: primaryPath.replace(/^\/+/, ''),
      inputFormat: 'bam',
      inputIndex: runtimePath(`${primaryFile.name}.bai`),
      inputIndexBytes: Array.from(descriptor.baiBytes),
      outputFile,
      cacheDir,
    }
  }

  const fastaPath = desktopPathForFile(descriptor.fastaFile)
  if (!fastaPath) return null
  return {
    ...request,
    root: '/',
    scriptPath,
    fileContents: remappedFileContents,
    inputFile: primaryPath.replace(/^\/+/, ''),
    inputFormat: 'cram',
    inputIndex: runtimePath(`${primaryFile.name}.crai`),
    inputIndexBytes: Array.from(descriptor.craiBytes),
    referenceFile: fastaPath.replace(/^\/+/, ''),
    referenceIndex: runtimePath(`${descriptor.fastaFile.name}.fai`),
    referenceIndexBytes: Array.from(descriptor.faiBytes),
    allowMd5Mismatch: true,
    outputFile,
    cacheDir,
  }
}

export async function inspectBytes(
  name: string,
  bytes: Uint8Array,
  options: BioscriptInspectOptions = {},
): Promise<BioscriptInspection> {
  return invokeOrBridge<BioscriptInspection>('lab_inspect_bytes', 'inspect_bytes', {
    name,
    bytes: Array.from(bytes),
    options,
  })
}

export async function compileVariantYamlText(name: string, text: string): Promise<VariantSpec[]> {
  return invokeOrBridge<VariantSpec[]>('lab_compile_variant_yaml_text', 'compile_variant_yaml_text', {
    name,
    text,
  })
}

export async function generateVcfTbiFile(vcfFile: File): Promise<Uint8Array> {
  return generateIndexFile('lab_generate_vcf_tbi', 'generate_vcf_tbi', vcfFile)
}

export async function generateCramCraiFile(cramFile: File): Promise<Uint8Array> {
  return generateIndexFile('lab_generate_cram_crai', 'generate_cram_crai', cramFile)
}

export async function generateBamBaiFile(bamFile: File): Promise<Uint8Array> {
  return generateIndexFile('lab_generate_bam_bai', 'generate_bam_bai', bamFile)
}

export async function generateFastaFaiFile(fastaFile: File): Promise<Uint8Array> {
  return generateIndexFile('lab_generate_fasta_fai', 'generate_fasta_fai', fastaFile)
}

export async function lookupGenotypeBytesVariants(
  name: string,
  bytes: Uint8Array,
  variants: VariantSpec[],
): Promise<VariantLookupResult> {
  return invokeOrBridge<VariantLookupResult>('lab_lookup_genotype_bytes_variants', 'lookup_genotype_bytes_variants', {
    name,
    bytes: Array.from(bytes),
    variants,
  })
}

export async function lookupCramVariants(input: CramVariantLookupInput): Promise<CramVariantLookupResult> {
  return lookupFileVariants<CramVariantLookupResult>('lab_lookup_cram_variants', 'lookup_cram_variants', input, 'cramFile', 'fastaFile')
}

export async function lookupBamVariants(input: BamVariantLookupInput): Promise<VariantLookupResult> {
  return lookupFileVariants<VariantLookupResult>('lab_lookup_bam_variants', 'lookup_bam_variants', input, 'bamFile')
}

export async function lookupVcfVariants(input: VcfVariantLookupInput): Promise<VariantLookupResult> {
  return lookupFileVariants<VariantLookupResult>('lab_lookup_vcf_variants', 'lookup_vcf_variants', input, 'vcfFile')
}

export async function lookupGenotypeBytesRsids(
  name: string,
  bytes: Uint8Array,
  rsids: string[],
): Promise<(string | null)[]> {
  return invokeOrBridge<(string | null)[]>('lab_lookup_genotype_bytes_rsids', 'lookup_genotype_bytes_rsids', {
    name,
    bytes: Array.from(bytes),
    rsids,
  })
}

export async function resolveRemoteResourceText(
  sourceUrl: string,
  name: string,
  text: string,
): Promise<BioscriptRemoteResourceResolution> {
  return invokeOrBridge<BioscriptRemoteResourceResolution>(
    'lab_resolve_remote_resource_text',
    'resolve_remote_resource_text',
    { sourceUrl, name, text },
  )
}

export async function resolvePackageZipBytes(
  sourceUrl: string,
  name: string,
  bytes: Uint8Array,
): Promise<BioscriptPackageResolution> {
  return invokeOrBridge<BioscriptPackageResolution>('lab_resolve_package_zip_bytes', 'resolve_package_zip_bytes', {
    sourceUrl,
    name,
    bytes: Array.from(bytes),
  })
}

export async function resolvePackageReleaseText(
  sourceUrl: string,
  name: string,
  text: string,
): Promise<BioscriptPackageRelease> {
  return invokeOrBridge<BioscriptPackageRelease>(
    'lab_resolve_package_release_text',
    'resolve_package_release_text',
    { sourceUrl, name, text },
  )
}

export async function verifyPackageArtifactSha256(
  name: string,
  bytes: Uint8Array,
  expected: string,
): Promise<void> {
  await invokeOrBridge('lab_verify_package_artifact_sha256', 'verify_package_artifact_sha256', {
    name,
    bytes: Array.from(bytes),
    expected,
  })
}

export async function runPackageReportBytes(
  manifestPath: string,
  packageFiles: BioscriptPackageFile[],
  inputName: string,
  inputBytes: Uint8Array,
  options: BioscriptPackageReportOptions = {},
): Promise<BioscriptPackageReportResult> {
  return invokeOrBridge<BioscriptPackageReportResult>(
    'lab_run_package_report_bytes',
    'run_package_report_bytes',
    {
      manifestPath,
      packageFiles,
      inputName,
      inputBytes: Array.from(inputBytes),
      options,
    },
  )
}

export async function runPackageReportFromCramFile(
  manifestPath: string,
  packageFiles: BioscriptPackageFile[],
  inputName: string,
  cramFile: File,
  craiBytes: Uint8Array,
  fastaFile: File,
  faiBytes: Uint8Array,
  options: BioscriptPackageReportOptions = {},
): Promise<BioscriptPackageReportResult> {
  const cramPath = desktopPathForFile(cramFile)
  const fastaPath = desktopPathForFile(fastaFile)
  if (!cramPath || !fastaPath) {
    return runPackageReportBytes(manifestPath, packageFiles, inputName, await fileBytes(cramFile), options)
  }
  return invokeOrBridge<BioscriptPackageReportResult>(
    'lab_run_package_report_from_cram',
    'run_package_report_from_cram',
    {
      manifestPath,
      packageFiles,
      inputName,
      cramPath,
      craiBytes: Array.from(craiBytes),
      fastaPath,
      faiBytes: Array.from(faiBytes),
      options,
    },
  )
}

export async function runPackageReportFromBamFile(
  manifestPath: string,
  packageFiles: BioscriptPackageFile[],
  inputName: string,
  bamFile: File,
  baiBytes: Uint8Array,
  options: BioscriptPackageReportOptions = {},
): Promise<BioscriptPackageReportResult> {
  const bamPath = desktopPathForFile(bamFile)
  if (!bamPath) {
    return runPackageReportBytes(manifestPath, packageFiles, inputName, await fileBytes(bamFile), options)
  }
  return invokeOrBridge<BioscriptPackageReportResult>(
    'lab_run_package_report_from_bam',
    'run_package_report_from_bam',
    {
      manifestPath,
      packageFiles,
      inputName,
      bamPath,
      baiBytes: Array.from(baiBytes),
      options,
    },
  )
}

export async function runPackageReportFromVcfFile(
  manifestPath: string,
  packageFiles: BioscriptPackageFile[],
  inputName: string,
  vcfFile: File,
  tbiBytes: Uint8Array,
  options: BioscriptPackageReportOptions = {},
): Promise<BioscriptPackageReportResult> {
  const vcfPath = desktopPathForFile(vcfFile)
  if (!vcfPath) {
    return runPackageReportBytes(manifestPath, packageFiles, inputName, await fileBytes(vcfFile), options)
  }
  return invokeOrBridge<BioscriptPackageReportResult>(
    'lab_run_package_report_from_vcf',
    'run_package_report_from_vcf',
    {
      manifestPath,
      packageFiles,
      inputName,
      vcfPath,
      tbiBytes: Array.from(tbiBytes),
      options,
    },
  )
}

function isFetchableUrl(path: string): boolean {
  return /^(https?:|blob:|data:)/i.test(path)
}

async function readTextSource(path: string): Promise<string> {
  if (isFetchableUrl(path)) {
    const response = await fetch(path)
    if (!response.ok) throw new Error(`failed to fetch '${path}': ${response.status} ${response.statusText}`)
    return response.text()
  }
  const nativePath = path.startsWith('file://') ? decodeURIComponent(new URL(path).pathname) : path
  return invokeOrBridge<string>('lab_read_file_text', 'read_file_text', { path: nativePath })
}

function splitPath(path: string): string[] {
  return path.replace(/\\/g, '/').split('/').filter(Boolean)
}

function dirname(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const parts = splitPath(normalized)
  if (parts.length <= 1) return normalized.startsWith('/') ? '/' : ''
  const prefix = normalized.startsWith('/') ? '/' : ''
  return `${prefix}${parts.slice(0, -1).join('/')}`
}

function joinPath(base: string, relative: string): string {
  if (/^(https?:|blob:|data:|file:)/i.test(relative) || relative.startsWith('/')) return relative
  if (isFetchableUrl(base)) return new URL(relative, base.endsWith('/') ? base : `${base}/`).toString()
  const prefix = base.startsWith('/') ? '/' : ''
  const stack = splitPath(base)
  for (const segment of splitPath(relative)) {
    if (segment === '.') continue
    if (segment === '..') {
      stack.pop()
      continue
    }
    stack.push(segment)
  }
  return `${prefix}${stack.join('/')}`
}

function getYamlString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(label)
  return value
}

function readYamlMap(text: string, label: string): Record<string, unknown> {
  const data = YAML.parse(text)
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${label} did not contain a YAML mapping`)
  }
  return data as Record<string, unknown>
}

function formatCoord(coords: Record<string, unknown> | null | undefined): string | undefined {
  if (!coords) return undefined
  const chrom = typeof coords.chrom === 'string' ? coords.chrom : undefined
  if (!chrom) return undefined
  const pos = typeof coords.pos === 'number' ? coords.pos : undefined
  const start = typeof coords.start === 'number' ? coords.start : undefined
  const end = typeof coords.end === 'number' ? coords.end : undefined
  if (pos !== undefined) return `${chrom}:${pos}-${pos}`
  if (start !== undefined && end !== undefined) return `${chrom}:${start}-${end}`
  if (start !== undefined) return `${chrom}:${start}-${start}`
  return undefined
}

function compiledVariantToDefinition(path: string, data: Record<string, unknown>): VariantDefinition {
  const fields = (data.fields as Record<string, unknown> | undefined) ?? {}
  const rsids = Array.isArray(data.rsids) ? data.rsids.filter((item): item is string => typeof item === 'string') : []
  const alts = Array.isArray(data.alts) ? data.alts.filter((item): item is string => typeof item === 'string') : []
  const grch37 = formatCoord(data.grch37 as Record<string, unknown> | undefined) ?? (typeof fields.grch37 === 'string' ? fields.grch37 : undefined)
  const grch38 = formatCoord(data.grch38 as Record<string, unknown> | undefined) ?? (typeof fields.grch38 === 'string' ? fields.grch38 : undefined)
  const ref = typeof data.ref === 'string' ? data.ref : typeof fields.ref === 'string' ? fields.ref : undefined
  const deletionLength =
    typeof data.deletion_length === 'number'
      ? data.deletion_length
      : typeof fields.deletion_length === 'number'
        ? fields.deletion_length
        : undefined
  const rawKind = typeof fields.kind === 'string' ? fields.kind : typeof data.kind === 'string' ? data.kind : 'snv'
  const kindMap: Record<string, string> = { snv: 'snp', deletion: 'deletion', insertion: 'insertion', indel: 'indel' }
  const kind = kindMap[String(rawKind).toLowerCase()] ?? String(rawKind).toLowerCase()
  const alt = typeof fields.alt === 'string' ? fields.alt : alts[0]
  const note = typeof data.note === 'string' ? data.note : typeof data.summary === 'string' ? data.summary : undefined
  const gene = typeof data.gene === 'string' ? data.gene : undefined
  const variantNameSource = typeof data.name === 'string' && data.name ? data.name : path.split('/').pop() ?? 'variant'
  const name = variantNameSource.replace(/[^A-Za-z0-9_]/g, '_')
  const location = grch37
    ? `GRCh37 chr${grch37.split(':')[0]}:${grch37.split(':')[1]?.replace(/-.+$/, '') ?? ''}`
    : grch38
      ? `GRCh38 chr${grch38.split(':')[0]}:${grch38.split(':')[1]?.replace(/-.+$/, '') ?? ''}`
      : undefined

  return {
    gene,
    label: rsids[0] ?? name,
    location,
    note,
    alts: alts.length ? alts : undefined,
    name,
    fields: {
      rsid: rsids.length === 1 ? rsids[0] : rsids.length ? rsids : undefined,
      grch37,
      grch38,
      ref,
      alt,
      kind,
      deletion_length: deletionLength,
    },
  }
}

function formatVariantTarget(variant: VariantDefinition): string {
  const rsid = Array.isArray(variant.fields.rsid) ? variant.fields.rsid.join('/') : String(variant.fields.rsid ?? '')
  const ref = String(variant.fields.ref ?? '')
  const alt = String(variant.fields.alt ?? '')
  const kind = String(variant.fields.kind ?? '')
  if (ref || alt) return `${rsid} ${ref}>${alt}${kind && kind !== 'snp' ? ` (${kind})` : ''}`.trim()
  return rsid || variant.name
}

function bioscriptLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'None'
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => bioscriptLiteral(item)).join(', ')}]`
  throw new Error(`unsupported bioscript literal: ${String(value)}`)
}

function buildProbeScript(variants: VariantDefinition[], progressFile?: string): string {
  const lookupBatchSize = 512
  const blocks = variants
    .map((variant) => {
      const args = Object.entries(variant.fields)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `    ${key === 'deletion_length' ? 'deletion_length' : key}=${bioscriptLiteral(value)}`)
        .join(',\n')
      return `${variant.name} = bioscript.variant(\n${args}\n)\n`
    })
    .join('\n')

  const totalVariants = variants.length
  const chunkBlocks: string[] = []
  for (let chunkStart = 0; chunkStart < variants.length; chunkStart += lookupBatchSize) {
    const chunk = variants.slice(chunkStart, chunkStart + lookupBatchSize)
    const chunkEnd = chunkStart + chunk.length
    const planName = `QUERY_PLAN_${chunkStart}`
    const resultsName = `observations_${chunkStart}`
    const variantRefs = chunk.map((variant) => variant.name).join(', ')
    const rowBlocks = chunk
      .map((variant, index) => {
        const observationExpr = `${resultsName}[${index}]`
        return `    row_status_${variant.name} = row_status(${observationExpr}, ${variant.name})\n    rows.append({\n        "participant_id": participant_id,\n        "gene": ${bioscriptLiteral(variant.gene ?? 'Unknown')},\n        "label": ${bioscriptLiteral(variant.label)},\n        "rsid": ${bioscriptLiteral(variant.fields.rsid ?? null)},\n        "location": ${bioscriptLiteral(variant.location ?? null)},\n        "kind": ${bioscriptLiteral(String(variant.fields.kind ?? 'snp').toUpperCase())},\n        "ref": ${bioscriptLiteral(variant.fields.ref ?? null)},\n        "alts": ${bioscriptLiteral(variant.alts ?? [])},\n        "observed": ${observationExpr},\n        "row_status": row_status_${variant.name},\n        "summary": ${bioscriptLiteral(variant.note ?? '')},\n    })`
      })
      .join('\n')
    chunkBlocks.push(
      `    ${planName} = bioscript.query_plan([${variantRefs}])\n` +
        `    ${resultsName} = genotypes.lookup_variants(${planName})\n` +
        `${rowBlocks}\n` +
        `    write_progress("running_variants", ${chunkEnd}, ${bioscriptLiteral(`Processed ${chunkEnd} of ${totalVariants} variants`)})`,
    )
  }
  const rows = chunkBlocks.join('\n')

  return `${blocks}\n\nPROGRESS_FILE = ${bioscriptLiteral(progressFile ?? null)}\nTOTAL_VARIANTS = ${totalVariants}\n\n\ndef write_progress(phase, completed=None, detail=None):\n    if PROGRESS_FILE is None:\n        return\n    completed_value = "" if completed is None else str(completed)\n    detail_value = "" if detail is None else detail\n    bioscript.write_text(PROGRESS_FILE, phase + "\\t" + completed_value + "\\t" + str(TOTAL_VARIANTS) + "\\t" + detail_value)\n\n\ndef row_status(observed, variant):\n    if observed is None or observed == "--":\n        return "missing"\n    kind = variant.kind\n    ref = variant.reference\n    alt = variant.alternate\n    if kind == "deletion":\n        if "D" in observed:\n            return "matched"\n        return "normal"\n    if alt is not None and alt in observed:\n        return "matched"\n    if ref is not None and len(observed) == 2 and observed[0] == ref and observed[1] == ref:\n        return "normal"\n    return "normal"\n\n\ndef assay_outcome(rows):\n    if len(rows) == 0:\n        return "missing"\n    statuses = []\n    for row in rows:\n        statuses.append(row["row_status"])\n    all_missing = True\n    has_missing = False\n    has_matched = False\n    for status in statuses:\n        if status != "missing":\n            all_missing = False\n        if status == "missing":\n            has_missing = True\n        if status == "matched":\n            has_matched = True\n    if all_missing:\n        return "missing"\n    if has_missing:\n        return "partial"\n    if has_matched:\n        return "matched"\n    return "normal"\n\n\ndef main():\n    write_progress("loading_genotypes", 0, "Loading genotypes from input file")\n    genotypes = bioscript.load_genotypes(input_file)\n    write_progress("running_variants", 0, "Genotypes loaded; starting variant checks")\n    rows = []\n${rows}\n    outcome = assay_outcome(rows)\n    for row in rows:\n        row[${bioscriptLiteral(ASSAY_OUTCOME_FIELD)}] = outcome\n    write_progress("writing_output", TOTAL_VARIANTS, "Variant checks complete; writing output")\n    bioscript.write_tsv(output_file, rows)\n    write_progress("complete", TOTAL_VARIANTS, "Output written")\n\n\nif __name__ == "__main__":\n    main()\n`
}

async function loadAssayPackage(request: RunAssayRequest): Promise<LoadedAssayPackage> {
  const assayContents = request.assayContents ?? request.fileContents?.[request.assayPath] ?? (await readTextSource(request.assayPath))
  const manifest = readYamlMap(assayContents, request.assayPath)
  if (manifest.schema !== 'bioscript:assay') throw new Error(`${request.assayPath} must declare schema: bioscript:assay`)

  const implementation = (manifest.implementation as Record<string, unknown> | undefined) ?? {}
  const implementationKind = implementation.kind
  if (implementationKind !== 'panel' && implementationKind !== 'script') {
    throw new Error(`${request.assayPath} implementation.kind must be 'panel' or 'script'`)
  }

  const outputFile = getYamlString(
    request.outputFileOverride ?? (manifest.outputs as Record<string, unknown> | undefined)?.file ?? request.outputFile ?? 'assay-output.tsv',
    'assay output file is required',
  )
  const assayDir = dirname(request.assayPath)
  const bundledFiles: Record<string, string> = { ...(request.fileContents ?? {}) }
  bundledFiles[request.assayPath] = assayContents
  const unsupportedVariants: UnsupportedAssayVariant[] = []

  if (implementationKind === 'script') {
    const scriptRef = getYamlString(implementation.path, `${request.assayPath} missing implementation.path for script assay`)
    const scriptPath = joinPath(assayDir, scriptRef)
    const scriptContents = bundledFiles[scriptPath] ?? (await readTextSource(scriptPath))
    bundledFiles[scriptPath] = scriptContents
    return { implementationKind, outputFile, scriptPath, scriptContents, bundledFiles, unsupportedVariants }
  }

  const compiledPath = request.compiledPath ?? joinPath(assayDir, 'assay.compiled.yaml')
  const compiledContents = request.compiledContents ?? bundledFiles[compiledPath] ?? (await readTextSource(compiledPath))
  bundledFiles[compiledPath] = compiledContents
  const compiled = readYamlMap(compiledContents, compiledPath)
  if (compiled.schema !== 'bioscript:assay-compiled') {
    throw new Error(`${compiledPath} must declare schema: bioscript:assay-compiled for panel assays`)
  }
  const runnableEntries = Array.isArray(compiled.runnable_variants) ? compiled.runnable_variants : []
  const unsupportedEntries = Array.isArray(compiled.unsupported_variants) ? compiled.unsupported_variants : []
  const variants: VariantDefinition[] = []
  for (const [index, rawVariant] of runnableEntries.entries()) {
    if (!rawVariant || typeof rawVariant !== 'object' || Array.isArray(rawVariant)) {
      throw new Error(`${compiledPath} runnable_variants[${index}] must be a mapping`)
    }
    variants.push(compiledVariantToDefinition(`${compiledPath}#runnable_variants[${index}]`, rawVariant as Record<string, unknown>))
  }
  for (const [index, rawVariant] of unsupportedEntries.entries()) {
    if (!rawVariant || typeof rawVariant !== 'object' || Array.isArray(rawVariant)) {
      throw new Error(`${compiledPath} unsupported_variants[${index}] must be a mapping`)
    }
    const variant = compiledVariantToDefinition(`${compiledPath}#unsupported_variants[${index}]`, rawVariant as Record<string, unknown>)
    unsupportedVariants.push({
      variantName: variant.name,
      target: formatVariantTarget(variant),
      reason: typeof (rawVariant as Record<string, unknown>).reason === 'string' ? String((rawVariant as Record<string, unknown>).reason) : 'unsupported variant',
    })
  }

  const scriptPath = joinPath(assayDir, '.generated/probe.py')
  const scriptContents = buildProbeScript(variants, request.progressFile)
  bundledFiles[scriptPath] = scriptContents
  return { implementationKind, outputFile, scriptPath, scriptContents, bundledFiles, unsupportedVariants }
}

export async function runAssay(request: RunAssayRequest): Promise<RunFileResult> {
  const loaded = await loadAssayPackage(request)
  const fileContents: Record<string, string> = {
    ...loaded.bundledFiles,
    ...(request.fileContents ?? {}),
  }
  const result = await runFile({
    scriptPath: loaded.scriptPath,
    scriptContents: loaded.scriptContents,
    root: request.root,
    inputFile: request.inputFile,
    inputContents: request.inputContents,
    outputFile: loaded.outputFile,
    fileContents,
    participantId: request.participantId,
    traceReportPath: request.traceReportPath,
    timingReportPath: request.timingReportPath,
    inputFormat: request.inputFormat,
    inputIndex: request.inputIndex,
    referenceFile: request.referenceFile,
    referenceIndex: request.referenceIndex,
    autoIndex: request.autoIndex,
    cacheDir: request.cacheDir,
    maxDurationMs: request.maxDurationMs,
    maxMemoryBytes: request.maxMemoryBytes,
    maxAllocations: request.maxAllocations,
    maxRecursionDepth: request.maxRecursionDepth,
    genomes: request.genomes,
  })
  return {
    ...result,
    assay: {
      implementationKind: loaded.implementationKind,
      unsupportedVariants: loaded.unsupportedVariants,
    },
  }
}

async function generateIndexFile(command: string, action: string, file: File): Promise<Uint8Array> {
  const path = desktopPathForFile(file)
  const bytes = await invokeOrBridge<number[]>(command, action, path
    ? { path }
    : { name: file.name, bytes: Array.from(new Uint8Array(await file.arrayBuffer())) })
  return Uint8Array.from(bytes)
}

async function lookupFileVariants<T>(
  command: string,
  action: string,
  input: Record<string, unknown>,
  primaryKey: string,
  referenceKey?: string,
): Promise<T> {
  const primary = input[primaryKey]
  if (!(primary instanceof File)) throw new Error(`${primaryKey} is not a File`)
  const request: Record<string, unknown> = {
    ...input,
    [primaryKey]: undefined,
    path: desktopPathForFile(primary),
  }
  if ('tbiBytes' in request) {
    request.indexBytes = Array.from(request.tbiBytes as Uint8Array)
    request.tbiBytes = undefined
  }
  if ('baiBytes' in request) {
    request.indexBytes = Array.from(request.baiBytes as Uint8Array)
    request.baiBytes = undefined
  }
  if ('craiBytes' in request) {
    request.indexBytes = Array.from(request.craiBytes as Uint8Array)
    request.craiBytes = undefined
  }
  if ('faiBytes' in request) {
    request.referenceIndexBytes = Array.from(request.faiBytes as Uint8Array)
    request.faiBytes = undefined
  }
  if (referenceKey) {
    const reference = input[referenceKey]
    if (!(reference instanceof File)) throw new Error(`${referenceKey} is not a File`)
    request.referencePath = desktopPathForFile(reference)
    request[referenceKey] = undefined
  }
  if (!request.path) {
    request.name = primary.name
    request.bytes = Array.from(new Uint8Array(await primary.arrayBuffer()))
  }
  return invokeOrBridge<T>(command, action, { request })
}

async function fileBytes(file: File): Promise<Uint8Array> {
  const path = desktopPathForFile(file)
  if (path) {
    const bytes = await invokeOrBridge<number[]>('lab_read_file_bytes', 'read_file_bytes', { path })
    return Uint8Array.from(bytes)
  }
  return new Uint8Array(await file.arrayBuffer())
}
