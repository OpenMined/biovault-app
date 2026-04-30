import { useEffect, useMemo, useState } from 'react'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import {
  Button,
  Card,
  Checkbox,
  LabEmptyState,
  LabFileIngress,
  LabItemCard,
  LabResultPanel,
  LabUrlInput,
  omColors,
  omSpacing,
  omTheme,
  Screen,
  Text,
} from '@biovault/ui-core'
import type { LabFileRef } from '@/lib/lab/core/files'
import {
  sortLabFileRefsForIngestion,
} from '@/lib/lab/core/file-groups'
import {
  isLabGenomeComplete,
  labGenomeBytesTotal,
  labGenomeDisplayName,
  labGenomeKindLabel,
  missingLabGenomeSlots,
} from '@/lib/lab/core/genomes'
import {
  createLabAssayRef,
  createLabGenomeRefFromPrimary,
  pairLabGenomeCompanionRef,
  type LabAssayRef,
  type LabGenomeRef,
} from '@/lib/lab/core/refs'
import { humanLabSize } from '@/lib/lab/core/file-utils'
import { DesktopLabFileAdapter } from './lab/desktop-file-adapter'
import { runDesktopAssay } from './lab/desktop-runtime'
import { send, useAppState } from './store'

type LabIngestState = {
  assays: LabAssayRef[]
  genomes: LabGenomeRef[]
  unknowns: LabFileRef[]
}

const initialLabState: LabIngestState = {
  assays: [],
  genomes: [],
  unknowns: [],
}

function assayLanguageFor(ref: LabFileRef): LabAssayRef['language'] | null {
  if (ref.kind === 'assay_python') return 'python'
  if (ref.kind === 'assay_yaml') return 'yaml'
  return null
}

function ingestLabRefs(state: LabIngestState, refs: LabFileRef[]): LabIngestState {
  let next = {
    assays: [...state.assays],
    genomes: [...state.genomes],
    unknowns: [...state.unknowns],
  }

  for (const ref of sortLabFileRefsForIngestion(refs)) {
    const assayLanguage = assayLanguageFor(ref)
    if (assayLanguage) {
      next.assays = [...next.assays, createLabAssayRef(ref, assayLanguage)]
      continue
    }

    const genome = createLabGenomeRefFromPrimary(ref)
    if (genome) {
      next.genomes = [...next.genomes, genome]
      continue
    }

    if (ref.kind === 'crai' || ref.kind === 'tbi' || ref.kind === 'fasta' || ref.kind === 'fai') {
      const companionCount = next.genomes.reduce((count, genome) => count + genomeCompanions(genome).length, 0)
      const paired = pairLabGenomeCompanionRef(next.genomes, ref)
      const nextCompanionCount = paired.reduce((count, genome) => count + genomeCompanions(genome).length, 0)
      if (nextCompanionCount > companionCount) {
        next.genomes = paired
        continue
      }
    }

    next.unknowns = [...next.unknowns, ref]
  }

  return next
}

function refList(refs: LabFileRef[]) {
  if (refs.length === 0) return 'No companion files'
  return refs.map((ref) => ref.name).join(' · ')
}

function genomeCompanions(genome: LabGenomeRef): LabFileRef[] {
  if (genome.kind === 'cram') {
    return [genome.crai, genome.fasta, genome.fai].filter((ref): ref is LabFileRef => Boolean(ref))
  }
  if (genome.kind === 'vcf') {
    return genome.tbi ? [genome.tbi] : []
  }
  return []
}

export function App() {
  const state = useAppState()
  const fileAdapter = useMemo(() => new DesktopLabFileAdapter(), [])
  const [labState, setLabState] = useState<LabIngestState>(initialLabState)
  const [error, setError] = useState<string | null>(null)
  const [isPicking, setIsPicking] = useState(false)
  const [isDragActive, setIsDragActive] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [fileUrl, setFileUrl] = useState('')
  const [assayUrl, setAssayUrl] = useState('')
  const [selectedGenomeId, setSelectedGenomeId] = useState<string | null>(null)
  const [selectedAssayId, setSelectedAssayId] = useState<string | null>(null)
  const [runOutput, setRunOutput] = useState<string | null>(null)

  const completeGenomes = labState.genomes.filter(isLabGenomeComplete)
  const selectedGenome =
    labState.genomes.find((genome) => genome.id === selectedGenomeId) ??
    completeGenomes[0] ??
    labState.genomes[0] ??
    null
  const selectedAssay =
    labState.assays.find((assay) => assay.id === selectedAssayId) ??
    labState.assays[0] ??
    null

  const ingestRefs = (refs: LabFileRef[]) => {
    setLabState((current) => {
      const next = ingestLabRefs(current, refs)
      const newGenome = next.genomes.find((genome) => !current.genomes.some((existing) => existing.id === genome.id))
      const newAssay = next.assays.find((assay) => !current.assays.some((existing) => existing.id === assay.id))
      if (!selectedGenomeId && newGenome) setSelectedGenomeId(newGenome.id)
      if (!selectedAssayId && newAssay) setSelectedAssayId(newAssay.id)
      return next
    })
  }

  const pickFiles = async () => {
    setError(null)
    setIsPicking(true)
    try {
      const refs = await fileAdapter.pickLocalFiles()
      ingestRefs(refs)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setIsPicking(false)
    }
  }

  const downloadUrl = async (url: string, kind: 'file' | 'assay') => {
    const trimmed = url.trim()
    if (!trimmed) return
    setError(null)
    setIsDownloading(true)
    try {
      const ref = await fileAdapter.downloadUrlFile(trimmed)
      ingestRefs([ref])
      if (kind === 'file') setFileUrl('')
      else setAssayUrl('')
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setIsDownloading(false)
    }
  }

  const runAssay = async () => {
    if (!selectedGenome || !selectedAssay) return
    setError(null)
    setRunOutput(null)
    setIsRunning(true)
    try {
      const result = await runDesktopAssay(selectedGenome, selectedAssay, fileAdapter)
      setRunOutput(result.outputText || 'Assay completed without text output.')
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setIsRunning(false)
    }
  }

  useEffect(() => {
    let unlisten: (() => void) | null = null
    try {
      getCurrentWebviewWindow()
        .onDragDropEvent((event) => {
          if (event.payload.type === 'enter' || event.payload.type === 'over') {
            setIsDragActive(true)
            return
          }
          if (event.payload.type === 'leave') {
            setIsDragActive(false)
            return
          }
          setIsDragActive(false)
          fileAdapter
            .statPaths(event.payload.paths)
            .then(ingestRefs)
            .catch((nextError) => setError(nextError instanceof Error ? nextError.message : String(nextError)))
        })
        .then((nextUnlisten) => {
          unlisten = nextUnlisten
        })
        .catch(() => {})
    } catch {
      // Browser-based smoke tests are not running inside a Tauri webview.
    }
    return () => unlisten?.()
  }, [fileAdapter])

  if (!state) {
    return (
      <Screen>
        <Text variant="body" tone="muted">
          Starting local BioVault runtime…
        </Text>
      </Screen>
    )
  }

  if (state.screen === 'warning') {
    return (
      <Screen>
        <div style={{ display: 'flex', flexDirection: 'column', gap: omSpacing.m }}>
          <div style={{ maxWidth: 360 }}>
            <Text
              variant="h3"
              tone="heading"
              as="h1"
              style={{ fontSize: 42, lineHeight: '45px', letterSpacing: -1 }}
            >
              Private genomic analysis on your device.
            </Text>
          </div>
          <Text variant="body" tone="muted" style={{ maxWidth: 360 }}>
            Review the privacy and research notes below before continuing.
          </Text>
        </div>

        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: omSpacing.l }}>
            <Text variant="body">Your files are never uploaded.</Text>
            <Text variant="body">Analysis runs locally.</Text>
            <Text variant="body">Results are visible only to you.</Text>
          </div>
        </Card>

        <Card tone="deep">
          <Text variant="body" style={{ fontSize: 17, lineHeight: '24px' }}>
            BioVault is a research tool, not a medical product. Do not use it for
            diagnosis or treatment.
          </Text>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: omSpacing.m }}>
          <Checkbox
            checked={state.agreed}
            onChange={(next) => send({ type: 'set_agreed', agreed: next })}
          >
            I understand and want to continue.
          </Checkbox>

          <Button
            disabled={!state.agreed}
            onClick={() => send({ type: 'continue' })}
          >
            Continue
          </Button>

          <Text
            variant="caption"
            tone="muted"
            style={{ textAlign: 'center', marginTop: omSpacing.xs }}
          >
            Built by{' '}
            <span style={{ color: omTheme.accent, textDecoration: 'underline' }}>
              OpenMined
            </span>
          </Text>
        </div>
      </Screen>
    )
  }

  return (
    <Screen maxWidth={920} style={{ justifyContent: 'flex-start' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: omSpacing.l }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: omSpacing.s }}>
          <Text variant="h3" tone="heading" as="h1">
            Lab
          </Text>
          <Text variant="body" tone="muted" style={{ maxWidth: 620 }}>
            Add local genomes, indexes, references, and assay files from the desktop file dialog.
          </Text>
        </div>
        <Button onClick={() => send({ type: 'reset' })} style={{ minHeight: 44 }}>
          Reset
        </Button>
      </div>

      <LabFileIngress
        title={isDragActive ? 'Drop files to add them' : 'Local files'}
        description="CRAM/CRAI, FASTA/FAI, VCF/TBI, 23andMe text or zip, and Python/YAML assays."
        actionLabel={isPicking ? 'Choosing…' : 'Choose Files'}
        disabled={isPicking}
        onAction={pickFiles}
        active={isDragActive}
      />

      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: omSpacing.m }}>
        <LabUrlInput
          buttonLabel={isDownloading ? 'Adding…' : 'Add File URL'}
          disabled={isDownloading}
          onSubmit={() => downloadUrl(fileUrl, 'file')}
          placeholder="Genome/index/reference URL"
          value={fileUrl}
          onChange={setFileUrl}
        />
        <LabUrlInput
          buttonLabel={isDownloading ? 'Adding…' : 'Add Assay URL'}
          disabled={isDownloading}
          onSubmit={() => downloadUrl(assayUrl, 'assay')}
          placeholder="Python/YAML assay URL"
          value={assayUrl}
          onChange={setAssayUrl}
        />
      </section>

      {error ? (
        <Card tone="deep" style={{ borderColor: 'rgba(255,120,120,0.45)' }}>
          <Text variant="body" style={{ color: '#ffb8b8' }}>
            {error}
          </Text>
        </Card>
      ) : null}

      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(280px, 1fr)', gap: omSpacing.l }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: omSpacing.m }}>
          <Text variant="body" tone="heading">
            Genomes
          </Text>
          {labState.genomes.length === 0 ? (
            <LabEmptyState>No genome files added yet.</LabEmptyState>
          ) : (
            labState.genomes.map((genome) => {
              const missing = missingLabGenomeSlots(genome)
              return (
                <LabItemCard
                  key={genome.id}
                  title={labGenomeDisplayName(genome)}
                  status={isLabGenomeComplete(genome) ? 'Ready' : 'Needs files'}
                  meta={`${labGenomeKindLabel(genome)} · ${humanLabSize(labGenomeBytesTotal(genome))}`}
                  detail={refList(genomeCompanions(genome))}
                  selected={selectedGenome?.id === genome.id}
                  onClick={() => setSelectedGenomeId(genome.id)}
                >
                    {missing.length > 0 ? (
                      <Text variant="caption" tone="muted">
                        Missing {missing.join(', ')}
                      </Text>
                    ) : null}
                </LabItemCard>
              )
            })
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: omSpacing.m }}>
          <Text variant="body" tone="heading">
            Assays
          </Text>
          {labState.assays.length === 0 ? (
            <LabEmptyState>No assay files added yet.</LabEmptyState>
          ) : (
            labState.assays.map((assay) => (
              <LabItemCard
                key={assay.id}
                title={assay.name}
                meta={`${assay.language} · ${humanLabSize(assay.file.size)}`}
                selected={selectedAssay?.id === assay.id}
                onClick={() => setSelectedAssayId(assay.id)}
              />
            ))
          )}

          {labState.unknowns.length > 0 ? (
            <>
              <Text variant="body" tone="heading">
                Other Files
              </Text>
              {labState.unknowns.map((ref) => (
                <LabItemCard key={ref.id} title={ref.name} meta={humanLabSize(ref.size)} />
              ))}
            </>
          ) : null}

          <Button
            disabled={!selectedGenome || !selectedAssay || !isLabGenomeComplete(selectedGenome) || isRunning}
            onClick={runAssay}
            style={{ minHeight: 44 }}
          >
            {isRunning ? 'Running…' : 'Run Assay'}
          </Button>
          {runOutput ? (
            <LabResultPanel>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: omColors.grayscale00 }}>
                {runOutput}
              </pre>
            </LabResultPanel>
          ) : null}
        </div>
      </section>
    </Screen>
  )
}
