import { OMIcon } from '@/components/ui/OMIcon'
import { OMText } from '@/components/ui/OMText'
import { useAnalytics } from '@/hooks/useAnalytics'
import { useColorScheme } from '@/lib/color-theme'
import {
	appendAssay,
	classifyLabFile,
	createAssayFromFile,
	createGenomeFromPrimaryFile,
	createUnknownEntry,
	genomeBytesTotal,
	genomeDisplayName,
	genomeKindLabel,
	humanLabSize,
	isGenomeComplete,
	missingGenomeSlots,
	pairCompanionFile,
	sortFilesForIngestion,
} from '@/lib/lab/file-model'
import {
	getRemoteAssaySourceHost,
	loadRemoteAssayFile,
	normalizeLabSearchParam,
} from '@/lib/lab/assay-loader'
import {
	getLabSamplePresetById,
	LAB_SAMPLE_PRESETS,
	loadLabSamplePresetAssayOnly,
	loadLabSamplePresetFiles,
	type LabSamplePreset,
} from '@/lib/lab/sample-data'
import { getLabRunDisabledReason, runLabAssay } from '@/lib/lab/runner'
import type { Assay, Genome, RunResult, UnknownEntry } from '@/lib/lab/types'
import type { VariantObservation } from '@/modules/expo-bioscript'
import { omRadius, omSpacing } from '@/styles/brand'
import { labPalettes, type LabPalette } from '@/styles/lab-theme'
import { useLocalSearchParams } from 'expo-router'
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react'
import {
	ActivityIndicator,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

// === Theme context =========================================================

type Styles = ReturnType<typeof makeStyles>
type ThemeValue = { palette: LabPalette; styles: Styles; mutedIconTone: 'muted' | 'inverse' }

const ThemeCtx = createContext<ThemeValue | null>(null)

function useTheme(): ThemeValue {
	const v = useContext(ThemeCtx)
	if (!v) throw new Error('Lab theme context missing')
	return v
}

// === Page ===================================================================

export default function LabScreen() {
	const scheme = useColorScheme()
	const palette = labPalettes[scheme]
	const styles = useMemo(() => makeStyles(palette), [palette])
	const themeValue = useMemo<ThemeValue>(
		() => ({ palette, styles, mutedIconTone: scheme === 'dark' ? 'inverse' : 'muted' }),
		[palette, styles, scheme],
	)

	const params = useLocalSearchParams<{ assay?: string | string[]; example?: string | string[] }>()
	const { trackEvent } = useAnalytics({ includeRouteParams: false })

	const [genomes, setGenomes] = useState<Genome[]>([])
	const [assays, setAssays] = useState<Assay[]>([])
	const [unknowns, setUnknowns] = useState<UnknownEntry[]>([])
	const [selectedGenomeId, setSelectedGenomeId] = useState<string | null>(null)
	const [selectedAssayId, setSelectedAssayId] = useState<string | null>(null)
	const [run, setRun] = useState<RunResult>({ status: 'idle' })
	const [dragActive, setDragActive] = useState(false)
	const [dismissedAssayUrl, setDismissedAssayUrl] = useState<string | null>(null)
	const [remoteAssayLoadError, setRemoteAssayLoadError] = useState<string | null>(null)
	const [remoteAssayLoading, setRemoteAssayLoading] = useState(false)
	const [samplePresetLoadingId, setSamplePresetLoadingId] = useState<string | null>(null)
	const [samplePresetAssayLoadingId, setSamplePresetAssayLoadingId] = useState<string | null>(null)
	const [samplePresetError, setSamplePresetError] = useState<string | null>(null)
	const [dismissedExampleId, setDismissedExampleId] = useState<string | null>(null)

	const requestedAssayUrl = normalizeLabSearchParam(params.assay)
	const requestedExampleId = normalizeLabSearchParam(params.example)
	const requestedExample = useMemo(
		() => getLabSamplePresetById(requestedExampleId),
		[requestedExampleId],
	)

	const activeGenome = useMemo(
		() => genomes.find((g) => g.id === selectedGenomeId) ?? genomes[genomes.length - 1] ?? null,
		[genomes, selectedGenomeId],
	)
	const activeAssay = useMemo(
		() => assays.find((a) => a.id === selectedAssayId) ?? assays[assays.length - 1] ?? null,
		[assays, selectedAssayId],
	)

	const hasRequestedAssayLoaded = useMemo(
		() => assays.some((assay) => assay.source === requestedAssayUrl),
		[assays, requestedAssayUrl],
	)
	const hasRequestedExampleLoaded = useMemo(() => {
		if (!requestedExample) return false
		return (
			assays.some((assay) => assay.name === requestedExample.assayLabel) &&
			genomes.some((genome) => genome.primary.name === requestedExample.genomeLabel)
		)
	}, [assays, genomes, requestedExample])

	const showRemoteAssayPrompt =
		Boolean(requestedAssayUrl) &&
		requestedAssayUrl !== dismissedAssayUrl &&
		!hasRequestedAssayLoaded
	const showExamplePrompt =
		Boolean(requestedExample) &&
		requestedExample?.id !== dismissedExampleId &&
		!hasRequestedExampleLoaded

	const addAssay = useCallback((file: File, language: Assay['language'], source?: string) => {
		const assay = createAssayFromFile(file, language, source)
		setAssays((prev) => appendAssay(prev, assay))
		setSelectedAssayId(assay.id)
		return assay
	}, [])

	const ingest = useCallback(
		(file: File) => {
			const kind = classifyLabFile(file.name)
			if (kind === 'unknown') {
				setUnknowns((prev) => [...prev, createUnknownEntry(file)])
				return
			}
			if (kind === 'assay_python' || kind === 'assay_yaml') {
				addAssay(file, kind === 'assay_python' ? 'python' : 'yaml')
				return
			}
			if (kind === 'cram' || kind === 'vcf_gz' || kind === 'genotype_text' || kind === 'zip') {
				const genome = createGenomeFromPrimaryFile(file, kind)
				setGenomes((prev) => [...prev, genome])
				setSelectedGenomeId(genome.id)
				return
			}
			setGenomes((prev) => pairCompanionFile(prev, file, kind))
		},
		[addAssay],
	)

	const ingestMany = useCallback(
		(files: File[]) => {
			const ordered = sortFilesForIngestion(files)
			trackEvent('lab_files_added', {
				fileKinds: ordered.map((file) => classifyLabFile(file.name)),
				totalFiles: ordered.length,
			})
			for (const file of ordered) ingest(file)
		},
		[ingest, trackEvent],
	)

	const loadRequestedAssay = useCallback(async () => {
		if (!requestedAssayUrl) return
		setRemoteAssayLoading(true)
		setRemoteAssayLoadError(null)
		trackEvent('lab_remote_assay_load_requested', {
			sourceHost: getRemoteAssaySourceHost(requestedAssayUrl),
		})
		try {
			const remote = await loadRemoteAssayFile(requestedAssayUrl)
			addAssay(remote.file, remote.language, remote.source)
			trackEvent('lab_remote_assay_loaded', {
				language: remote.language,
				sourceHost: getRemoteAssaySourceHost(remote.source),
			})
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			setRemoteAssayLoadError(message)
			trackEvent('lab_remote_assay_load_failed', { error: message })
		} finally {
			setRemoteAssayLoading(false)
		}
	}, [addAssay, requestedAssayUrl, trackEvent])

	const loadSamplePreset = useCallback(
		async (preset: LabSamplePreset) => {
			setSamplePresetLoadingId(preset.id)
			setSamplePresetError(null)
			trackEvent('lab_sample_preset_requested', { presetId: preset.id })
			try {
				const files = await loadLabSamplePresetFiles(preset)
				ingestMany(files)
				trackEvent('lab_sample_preset_loaded', {
					presetId: preset.id,
					totalFiles: files.length,
				})
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error)
				setSamplePresetError(message)
				trackEvent('lab_sample_preset_failed', { presetId: preset.id, error: message })
			} finally {
				setSamplePresetLoadingId(null)
			}
		},
		[ingestMany, trackEvent],
	)

	const loadAssayFromPreset = useCallback(
		async (preset: LabSamplePreset) => {
			setSamplePresetAssayLoadingId(preset.id)
			setSamplePresetError(null)
			trackEvent('lab_preset_assay_only_requested', { presetId: preset.id })
			try {
				const files = await loadLabSamplePresetAssayOnly(preset)
				ingestMany(files)
				trackEvent('lab_preset_assay_only_loaded', {
					presetId: preset.id,
					totalFiles: files.length,
				})
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error)
				setSamplePresetError(message)
				trackEvent('lab_preset_assay_only_failed', { presetId: preset.id, error: message })
			} finally {
				setSamplePresetAssayLoadingId(null)
			}
		},
		[ingestMany, trackEvent],
	)

	useEffect(() => {
		if (Platform.OS !== 'web') return
		let depth = 0
		const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
		const stop = (e: Event) => {
			e.preventDefault()
			e.stopPropagation()
		}
		const onEnter = (e: DragEvent) => {
			if (!hasFiles(e)) return
			stop(e)
			depth += 1
			setDragActive(true)
		}
		const onOver = (e: DragEvent) => {
			if (!hasFiles(e)) return
			stop(e)
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
		}
		const onLeave = (e: DragEvent) => {
			if (!hasFiles(e)) return
			stop(e)
			depth = Math.max(0, depth - 1)
			if (depth === 0) setDragActive(false)
		}
		const onDrop = (e: DragEvent) => {
			stop(e)
			depth = 0
			setDragActive(false)
			ingestMany(Array.from(e.dataTransfer?.files ?? []))
		}
		window.addEventListener('dragenter', onEnter)
		window.addEventListener('dragover', onOver)
		window.addEventListener('dragleave', onLeave)
		window.addEventListener('drop', onDrop)
		return () => {
			window.removeEventListener('dragenter', onEnter)
			window.removeEventListener('dragover', onOver)
			window.removeEventListener('dragleave', onLeave)
			window.removeEventListener('drop', onDrop)
		}
	}, [ingestMany])

	const openPicker = useCallback(
		(accept?: string) => {
			if (Platform.OS !== 'web') return
			const input = document.createElement('input')
			input.type = 'file'
			input.multiple = true
			if (accept) input.accept = accept
			input.style.display = 'none'
			input.onchange = () => {
				const files = Array.from(input.files ?? [])
				ingestMany(files)
				document.body.removeChild(input)
			}
			document.body.appendChild(input)
			input.click()
		},
		[ingestMany],
	)

	const clearAssay = useCallback(() => {
		setAssays([])
		setSelectedAssayId(null)
		setRun({ status: 'idle' })
	}, [])

	const clearGenome = useCallback(() => {
		setGenomes([])
		setSelectedGenomeId(null)
		setUnknowns([])
		setRun({ status: 'idle' })
	}, [])

	const removeUnknown = useCallback((id: string) => {
		setUnknowns((prev) => prev.filter((u) => u.id !== id))
	}, [])

	const runDisabledReason = useMemo(
		() => getLabRunDisabledReason(activeGenome, activeAssay),
		[activeGenome, activeAssay],
	)

	const executeRun = useCallback(async () => {
		if (!activeGenome || !activeAssay) return
		setRun({ status: 'running' })
		trackEvent('lab_run_started', {
			assayLanguage: activeAssay.language,
			assaySource: activeAssay.source ? 'remote' : 'local',
			genomeKind: activeGenome.kind,
		})
		try {
			const success = await runLabAssay(activeGenome, activeAssay)
			setRun(success.result)
			trackEvent('lab_run_completed', {
				assayLanguage: activeAssay.language,
				genomeKind: activeGenome.kind,
				resultKind: success.kind,
			})
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err)
			setRun({ status: 'error', error: message })
			trackEvent('lab_run_failed', {
				assayLanguage: activeAssay.language,
				genomeKind: activeGenome.kind,
				error: message,
			})
		}
	}, [activeAssay, activeGenome, trackEvent])

	const lastRunKeyRef = useRef<string>('')
	useEffect(() => {
		const key = `${activeGenome?.id ?? ''}::${activeAssay?.id ?? ''}`
		if (key !== lastRunKeyRef.current) {
			lastRunKeyRef.current = key
			setRun((prev) => (prev.status === 'running' ? prev : { status: 'idle' }))
		}
	}, [activeGenome, activeAssay])

	useEffect(() => {
		if (run.status !== 'idle') return
		if (!activeGenome || !activeAssay) return
		if (runDisabledReason) return
		void executeRun()
	}, [activeGenome, activeAssay, run.status, runDisabledReason, executeRun])

	const hasAnyFiles = Boolean(activeAssay || activeGenome || unknowns.length > 0)

	return (
		<ThemeCtx.Provider value={themeValue}>
			<SafeAreaView style={styles.safe} edges={['top']}>
				{dragActive ? <DragOverlay /> : null}

				<ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
					<Hero />

					{showRemoteAssayPrompt && requestedAssayUrl ? (
						<SharedPrompt
							kicker="ASSAY SHARED WITH YOU"
							title="Load this assay?"
							meta={tryGetHostPath(requestedAssayUrl)}
							loading={remoteAssayLoading}
							error={remoteAssayLoadError}
							primaryLabel="Load assay"
							onPrimary={() => void loadRequestedAssay()}
							onDismiss={() =>
								requestedAssayUrl && setDismissedAssayUrl(requestedAssayUrl)
							}
						/>
					) : null}

					{showExamplePrompt && requestedExample ? (
						<SharedPrompt
							kicker="SAMPLE SHARED WITH YOU"
							title={`Load ${requestedExample.title}?`}
							meta={`${requestedExample.inputKindLabel} · ${requestedExample.assayLabel}`}
							loading={samplePresetLoadingId === requestedExample.id}
							error={samplePresetError}
							primaryLabel="Load & run"
							onPrimary={() => void loadSamplePreset(requestedExample)}
							onDismiss={() =>
								requestedExample && setDismissedExampleId(requestedExample.id)
							}
						/>
					) : null}

					<DropZone
						compact={hasAnyFiles}
						dragActive={dragActive}
						onChoose={() => openPicker()}
					/>

					{activeAssay ? (
						<AssayRow assay={activeAssay} onClear={clearAssay} />
					) : null}

					{activeGenome ? (
						<GenomeRow genome={activeGenome} onClear={clearGenome} />
					) : null}

					{unknowns.length > 0 ? (
						<UnknownFilesNote unknowns={unknowns} onRemove={removeUnknown} />
					) : null}

					{run.status === 'running' ? (
						<RunningIndicator assayName={activeAssay?.name ?? 'assay'} />
					) : null}

					{run.status === 'done' && run.observations ? (
						<ResultPanel
							assayName={activeAssay?.name ?? 'assay'}
							durationMs={run.durationMs ?? 0}
							observations={run.observations}
						/>
					) : null}

					{run.status === 'done' && run.textOutput !== undefined ? (
						<TextResultPanel durationMs={run.durationMs ?? 0} text={run.textOutput} />
					) : null}

					{run.status === 'error' && run.error ? <ErrorPanel error={run.error} /> : null}

					<PresetList
						pendingGenome={activeGenome}
						samplePresetLoadingId={samplePresetLoadingId}
						samplePresetAssayLoadingId={samplePresetAssayLoadingId}
						samplePresetError={samplePresetError}
						onActivate={(preset) =>
							activeGenome ? void loadAssayFromPreset(preset) : void loadSamplePreset(preset)
						}
						onDropOwn={() => openPicker('.py,.yaml,.yml')}
					/>

					<PrivacyFootnote />
				</ScrollView>
			</SafeAreaView>
		</ThemeCtx.Provider>
	)
}

// === Hero ==================================================================

function Hero() {
	const { styles } = useTheme()
	return (
		<View style={styles.hero}>
			<OMText variant="caption" style={styles.heroKicker}>
				BIOVAULT LAB
			</OMText>
			<OMText variant="h3" style={styles.heroTitle}>
				Run genetic assays on your own files — right in your browser.
			</OMText>
			<OMText variant="body" style={styles.heroBody}>
				Nothing uploaded. An mpileup on a 17 GB CRAM takes about 1.3 seconds.
			</OMText>
		</View>
	)
}

// === Drop zone =============================================================

function DropZone({
	compact,
	dragActive,
	onChoose,
}: {
	compact: boolean
	dragActive: boolean
	onChoose: () => void
}) {
	const { styles } = useTheme()
	if (compact) {
		return (
			<Pressable
				onPress={onChoose}
				style={[styles.dropBar, dragActive ? styles.dropBarActive : null]}
			>
				<OMIcon name="add-outline" tone="accent" size={18} />
				<OMText variant="body" style={styles.dropBarText}>
					Drop more files or click to add
				</OMText>
				<OMText variant="caption" style={styles.dropBarHint}>
					.cram · .vcf.gz · .txt · .py · .yaml
				</OMText>
			</Pressable>
		)
	}
	return (
		<Pressable
			onPress={onChoose}
			style={[styles.dropZone, dragActive ? styles.dropZoneActive : null]}
		>
			<OMIcon name="cloud-upload-outline" tone="accent" size={40} />
			<OMText variant="h3" style={styles.dropZoneTitle}>
				Drop files here
			</OMText>
			<OMText variant="body" style={styles.dropZoneBody}>
				A genome (.cram, .vcf.gz, .zip, 23andMe .txt) and an assay (.py, .yaml).
			</OMText>
			<View style={styles.dropZoneButton}>
				<OMText variant="subtitle" style={styles.primaryButtonText}>
					Choose files
				</OMText>
			</View>
			<OMText variant="caption" style={styles.dropZoneHint}>
				Or try a preset below — no files of your own required.
			</OMText>
		</Pressable>
	)
}

// === Loaded rows ===========================================================

function AssayRow({ assay, onClear }: { assay: Assay; onClear: () => void }) {
	const { styles, mutedIconTone } = useTheme()
	return (
		<View style={[styles.loadedRow, styles.loadedRowOk]}>
			<View style={styles.loadedRowIcon}>
				<OMIcon name="flask-outline" tone="accent" size={18} />
			</View>
			<View style={styles.loadedRowText}>
				<OMText variant="headline" style={styles.loadedRowTitle}>
					{assay.name}
				</OMText>
				<OMText variant="caption" style={styles.loadedRowMeta}>
					{assay.language === 'python' ? 'Python assay' : 'YAML assay'} ·{' '}
					{humanLabSize(assay.file.size)} ·{' '}
					{assay.source ? `from ${tryGetHostPath(assay.source)}` : 'local'}
				</OMText>
			</View>
			<Pressable onPress={onClear} style={styles.removeButton}>
				<OMIcon name="close-outline" tone={mutedIconTone} size={14} />
				<OMText variant="subtitle" style={styles.removeButtonText}>
					Remove
				</OMText>
			</Pressable>
		</View>
	)
}

function GenomeRow({ genome, onClear }: { genome: Genome; onClear: () => void }) {
	const { styles, mutedIconTone } = useTheme()
	const complete = isGenomeComplete(genome)
	const missing = missingGenomeSlots(genome)
	return (
		<View style={[styles.loadedRow, complete ? styles.loadedRowOk : styles.loadedRowWarn]}>
			<View style={styles.loadedRowHead}>
				<View style={styles.loadedRowIcon}>
					<OMIcon name="document-text-outline" tone="accent" size={18} />
				</View>
				<View style={styles.loadedRowText}>
					<OMText variant="headline" style={styles.loadedRowTitle}>
						{genomeDisplayName(genome)}
					</OMText>
					<OMText variant="caption" style={styles.loadedRowMeta}>
						{genomeKindLabel(genome)} · {humanLabSize(genomeBytesTotal(genome))}
					</OMText>
				</View>
				<Pressable onPress={onClear} style={styles.removeButton}>
					<OMIcon name="close-outline" tone={mutedIconTone} size={14} />
					<OMText variant="subtitle" style={styles.removeButtonText}>
						Remove
					</OMText>
				</Pressable>
			</View>

			{genome.kind === 'cram' || genome.kind === 'vcf' ? (
				<View style={styles.slotGrid}>
					{genome.kind === 'cram' ? (
						<>
							<SlotChip label=".cram" file={genome.primary} />
							<SlotChip label=".cram.crai" file={genome.crai} />
							<SlotChip label=".fa" file={genome.fasta} />
							<SlotChip label=".fa.fai" file={genome.fai} />
						</>
					) : (
						<>
							<SlotChip label=".vcf.gz" file={genome.primary} />
							<SlotChip label=".vcf.gz.tbi" file={genome.tbi} />
						</>
					)}
				</View>
			) : null}

			{!complete && missing.length > 0 ? (
				<OMText variant="caption" style={styles.missingText}>
					Drop to complete: {missing.join(' · ')}
				</OMText>
			) : null}
		</View>
	)
}

function SlotChip({ file, label }: { file?: File; label: string }) {
	const { styles, mutedIconTone } = useTheme()
	const filled = Boolean(file)
	return (
		<View style={[styles.slotChip, filled ? styles.slotChipOk : styles.slotChipMissing]}>
			<OMIcon
				name={filled ? 'checkmark-circle' : 'ellipse-outline'}
				tone={filled ? 'accent' : mutedIconTone}
				size={14}
			/>
			<OMText variant="caption" style={filled ? styles.slotChipTextOk : styles.slotChipText}>
				{label}
			</OMText>
		</View>
	)
}

// === Run status ============================================================

function RunningIndicator({ assayName }: { assayName: string }) {
	const { palette, styles } = useTheme()
	return (
		<View style={styles.runningRow}>
			<ActivityIndicator size="small" color={palette.accent} />
			<OMText variant="body" style={styles.runningText}>
				Running {assayName} in your browser…
			</OMText>
		</View>
	)
}

function ResultPanel({
	assayName,
	durationMs,
	observations,
}: {
	assayName: string
	durationMs: number
	observations: VariantObservation[]
}) {
	const { styles } = useTheme()
	return (
		<View style={styles.resultPanel}>
			<OMText variant="caption" style={styles.resultKicker}>
				{assayName.toUpperCase()} · {observations.length} variant
				{observations.length === 1 ? '' : 's'} · {durationMs} ms
			</OMText>
			{observations.map((obs) => (
				<ObservationCard key={obs.name} obs={obs} />
			))}
		</View>
	)
}

function TextResultPanel({ durationMs, text }: { durationMs: number; text: string }) {
	const { styles } = useTheme()
	return (
		<View style={styles.resultPanel}>
			<OMText variant="caption" style={styles.resultKicker}>
				OUTPUT · {durationMs} ms
			</OMText>
			{text ? (
				<View style={styles.preBlock}>
					<OMText variant="body" style={styles.preText}>
						{text}
					</OMText>
				</View>
			) : (
				<OMText variant="body" style={styles.mutedBody}>
					(no output produced)
				</OMText>
			)}
		</View>
	)
}

function ObservationCard({ obs }: { obs: VariantObservation }) {
	const { styles } = useTheme()
	return (
		<View style={styles.obsCard}>
			<View style={styles.obsHeader}>
				<OMText variant="headline" style={styles.obsTitle}>
					{obs.name}
				</OMText>
				<View style={styles.obsBadgeRow}>
					<MetaChip label={obs.backend} />
					{obs.assembly ? <MetaChip label={obs.assembly.toUpperCase()} /> : null}
					{obs.matchedRsid ? <MetaChip label={obs.matchedRsid} /> : null}
				</View>
			</View>
			{obs.genotype ? (
				<View style={styles.obsGenotype}>
					<OMText variant="caption" style={styles.obsGenotypeLabel}>
						GENOTYPE
					</OMText>
					<OMText variant="h3" style={styles.obsGenotypeValue}>
						{obs.genotype}
					</OMText>
					<OMText variant="caption" style={styles.obsGenotypeMeta}>
						{obs.depth !== undefined ? `depth ${obs.depth}` : null}
						{obs.refCount !== undefined ? ` · ref ${obs.refCount}` : null}
						{obs.altCount !== undefined ? ` · alt ${obs.altCount}` : null}
					</OMText>
				</View>
			) : null}
			{obs.evidence.length > 0 ? (
				<OMText variant="caption" style={styles.obsEvidence}>
					{obs.evidence.join(' · ')}
				</OMText>
			) : null}
		</View>
	)
}

function ErrorPanel({ error }: { error: string }) {
	const { styles } = useTheme()
	return (
		<View style={styles.errorBlock}>
			<OMIcon name="alert-circle-outline" tone="danger" size={18} />
			<View style={{ flex: 1, gap: omSpacing.xs }}>
				<OMText variant="headline" style={styles.errorTitle}>
					Run failed
				</OMText>
				<OMText variant="body" style={styles.errorBody}>
					{error}
				</OMText>
			</View>
		</View>
	)
}

// === Preset list ===========================================================

function PresetList({
	onActivate,
	onDropOwn,
	pendingGenome,
	samplePresetAssayLoadingId,
	samplePresetError,
	samplePresetLoadingId,
}: {
	onActivate: (preset: LabSamplePreset) => void
	onDropOwn: () => void
	pendingGenome: Genome | null
	samplePresetAssayLoadingId: string | null
	samplePresetError: string | null
	samplePresetLoadingId: string | null
}) {
	const { styles } = useTheme()
	const cta = pendingGenome ? 'Run →' : 'Try demo →'
	return (
		<View style={styles.presetSection}>
			<OMText variant="caption" style={styles.presetSectionKicker}>
				{pendingGenome ? 'RUN AN ASSAY ON YOUR FILE' : 'OR TRY A PRESET'}
			</OMText>
			<View style={styles.presetList}>
				{LAB_SAMPLE_PRESETS.map((preset) => {
					const loading =
						samplePresetLoadingId === preset.id ||
						samplePresetAssayLoadingId === preset.id
					return (
						<Pressable
							key={preset.id}
							onPress={() => onActivate(preset)}
							disabled={loading}
							style={[styles.presetRow, loading ? styles.presetRowDisabled : null]}
						>
							<View style={styles.presetIcon}>
								<OMIcon name="flask-outline" tone="accent" size={16} />
							</View>
							<View style={styles.presetText}>
								<OMText variant="body" style={styles.presetTitle}>
									{preset.title}
								</OMText>
								<OMText variant="caption" style={styles.presetMeta}>
									{preset.inputKindLabel} · {preset.assayLabel}
								</OMText>
							</View>
							<OMText variant="subtitle" style={styles.presetCta}>
								{loading ? 'Loading…' : cta}
							</OMText>
						</Pressable>
					)
				})}

				<Pressable onPress={onDropOwn} style={[styles.presetRow, styles.presetRowAdd]}>
					<View style={styles.presetIconAdd}>
						<OMIcon name="add-outline" tone="accent" size={16} />
					</View>
					<View style={styles.presetText}>
						<OMText variant="body" style={styles.presetTitle}>
							Use your own assay
						</OMText>
						<OMText variant="caption" style={styles.presetMeta}>
							Drop a .py or .yaml
						</OMText>
					</View>
					<OMText variant="subtitle" style={styles.presetCtaGhost}>
						Choose →
					</OMText>
				</Pressable>
			</View>
			{samplePresetError ? (
				<OMText variant="caption" style={styles.errorInline}>
					{samplePresetError}
				</OMText>
			) : null}
		</View>
	)
}

// === Shared prompt (deep link) =============================================

function SharedPrompt({
	error,
	kicker,
	loading,
	meta,
	onDismiss,
	onPrimary,
	primaryLabel,
	title,
}: {
	error: string | null
	kicker: string
	loading: boolean
	meta: string
	onDismiss: () => void
	onPrimary: () => void
	primaryLabel: string
	title: string
}) {
	const { styles } = useTheme()
	return (
		<View style={styles.sharedPrompt}>
			<OMText variant="caption" style={styles.sharedPromptKicker}>
				{kicker}
			</OMText>
			<OMText variant="headline" style={styles.sharedPromptTitle}>
				{title}
			</OMText>
			<OMText variant="caption" style={styles.sharedPromptMeta}>
				{meta}
			</OMText>
			{error ? (
				<OMText variant="caption" style={styles.errorInline}>
					{error}
				</OMText>
			) : null}
			<View style={styles.sharedPromptActions}>
				<Pressable
					onPress={onPrimary}
					disabled={loading}
					style={[styles.primaryButton, loading ? styles.primaryButtonDisabled : null]}
				>
					<OMText variant="subtitle" style={styles.primaryButtonText}>
						{loading ? 'Loading…' : primaryLabel}
					</OMText>
				</Pressable>
				<Pressable onPress={onDismiss} style={styles.textButton}>
					<OMText variant="subtitle" style={styles.textButtonText}>
						Dismiss
					</OMText>
				</Pressable>
			</View>
		</View>
	)
}

// === Misc ==================================================================

function MetaChip({ label }: { label: string }) {
	const { styles } = useTheme()
	return (
		<View style={styles.metaChip}>
			<OMText variant="caption" style={styles.metaChipText}>
				{label}
			</OMText>
		</View>
	)
}

function UnknownFilesNote({
	onRemove,
	unknowns,
}: {
	onRemove: (id: string) => void
	unknowns: UnknownEntry[]
}) {
	const { styles, mutedIconTone } = useTheme()
	return (
		<View style={styles.unknownNote}>
			<View style={styles.unknownNoteHead}>
				<OMIcon name="alert-circle-outline" tone={mutedIconTone} size={14} />
				<OMText variant="caption" style={styles.unknownNoteTitle}>
					Couldn’t recognise {unknowns.length} file{unknowns.length === 1 ? '' : 's'}
				</OMText>
			</View>
			{unknowns.map((u) => (
				<View key={u.id} style={styles.unknownRow}>
					<OMText variant="caption" style={styles.unknownRowName}>
						{u.file.name}
					</OMText>
					<Pressable onPress={() => onRemove(u.id)} style={styles.textButton}>
						<OMText variant="subtitle" style={styles.textButtonText}>
							Remove
						</OMText>
					</Pressable>
				</View>
			))}
		</View>
	)
}

function PrivacyFootnote() {
	const { styles, mutedIconTone } = useTheme()
	return (
		<View style={styles.footerNote}>
			<OMIcon name="lock-closed-outline" tone={mutedIconTone} size={14} />
			<OMText variant="caption" style={styles.footerNoteText}>
				Everything runs locally via WebAssembly. Your files never leave this tab.
			</OMText>
		</View>
	)
}

function DragOverlay() {
	const { styles } = useTheme()
	return (
		<View style={styles.dragOverlay} pointerEvents="none">
			<View style={styles.dragOverlayCard}>
				<OMIcon name="cloud-upload-outline" tone="accent" size={48} />
				<OMText variant="h3" style={styles.dragOverlayTitle}>
					Drop to add
				</OMText>
				<OMText variant="body" style={styles.dragOverlayBody}>
					Genomes, indexes, and assay scripts are sorted automatically.
				</OMText>
			</View>
		</View>
	)
}

// === Helpers ===============================================================

function tryGetHostPath(url: string): string {
	try {
		const parsed = new URL(url)
		return `${parsed.hostname}${parsed.pathname}`
	} catch {
		return url
	}
}

// === Styles ================================================================

function makeStyles(p: LabPalette) {
	return StyleSheet.create({
		safe: { flex: 1, backgroundColor: p.pageBg },
		scroll: { flex: 1 },
		content: {
			paddingHorizontal: omSpacing.xl,
			paddingTop: 88,
			paddingBottom: omSpacing.xxxxl,
			maxWidth: 720,
			width: '100%',
			alignSelf: 'center',
			gap: omSpacing.m,
		},

		// hero
		hero: { gap: omSpacing.s, paddingBottom: omSpacing.s },
		heroKicker: { color: p.accentStrong, letterSpacing: 1.4 },
		heroTitle: { color: p.text, lineHeight: 42, maxWidth: 640 },
		heroBody: { color: p.textMuted, maxWidth: 620 },

		// primary drop zone (when nothing loaded)
		dropZone: {
			alignItems: 'center',
			gap: omSpacing.m,
			paddingVertical: omSpacing.xxxxl,
			paddingHorizontal: omSpacing.xl,
			borderRadius: omRadius.l,
			borderWidth: 2,
			borderStyle: 'dashed',
			borderColor: p.accentBorder,
			backgroundColor: p.accentTint,
		},
		dropZoneActive: { borderColor: p.accent, backgroundColor: p.accentSoft },
		dropZoneTitle: { color: p.text, textAlign: 'center' },
		dropZoneBody: { color: p.textMuted, textAlign: 'center' },
		dropZoneButton: {
			marginTop: omSpacing.s,
			paddingHorizontal: omSpacing.xl,
			paddingVertical: omSpacing.m,
			borderRadius: omRadius.full,
			backgroundColor: p.accent,
		},
		dropZoneHint: {
			color: p.textFaint,
			textAlign: 'center',
			marginTop: omSpacing.s,
			maxWidth: 420,
		},

		// compact drop bar (when something is loaded)
		dropBar: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: omSpacing.m,
			paddingHorizontal: omSpacing.l,
			paddingVertical: omSpacing.m,
			borderRadius: omRadius.l,
			borderWidth: 1,
			borderStyle: 'dashed',
			borderColor: p.borderStrong,
			backgroundColor: p.surface,
		},
		dropBarActive: { borderColor: p.accent, backgroundColor: p.accentSoft },
		dropBarText: { color: p.text, flex: 1 },
		dropBarHint: { color: p.textFaint },

		// loaded rows
		loadedRow: {
			padding: omSpacing.l,
			borderRadius: omRadius.l,
			backgroundColor: p.surface,
			borderWidth: 1,
			borderColor: p.border,
			gap: omSpacing.m,
		},
		loadedRowOk: {
			borderColor: p.accentBorder,
			backgroundColor: p.accentTint,
		},
		loadedRowWarn: {
			borderColor: p.warningBorder,
			backgroundColor: p.warningBg,
		},
		loadedRowHead: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: omSpacing.m,
		},
		loadedRowIcon: {
			width: 36,
			height: 36,
			borderRadius: 10,
			alignItems: 'center',
			justifyContent: 'center',
			backgroundColor: p.accentSoft,
		},
		loadedRowText: { flex: 1, gap: 2 },
		loadedRowTitle: { color: p.text },
		loadedRowMeta: { color: p.textMuted },

		// remove button (labeled, clear)
		removeButton: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: omSpacing.xs,
			paddingHorizontal: omSpacing.m,
			paddingVertical: omSpacing.s,
			borderRadius: omRadius.full,
			backgroundColor: p.surfaceRaised,
			borderWidth: 1,
			borderColor: p.borderStrong,
		},
		removeButtonText: { color: p.textMuted },

		// slot chips (for loaded genome)
		slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: omSpacing.xs },
		slotChip: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: omSpacing.xs,
			paddingHorizontal: omSpacing.m,
			paddingVertical: 6,
			borderRadius: omRadius.full,
			borderWidth: 1,
		},
		slotChipOk: {
			backgroundColor: p.accentSoft,
			borderColor: p.accentBorder,
		},
		slotChipMissing: {
			backgroundColor: p.surface,
			borderColor: p.border,
			borderStyle: 'dashed',
		},
		slotChipText: { color: p.textMuted },
		slotChipTextOk: { color: p.accentStrong },
		missingText: { color: p.warningText },

		// running indicator
		runningRow: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: omSpacing.m,
			paddingHorizontal: omSpacing.l,
			paddingVertical: omSpacing.m,
			borderRadius: omRadius.l,
			backgroundColor: p.surface,
			borderWidth: 1,
			borderColor: p.border,
		},
		runningText: { color: p.text },

		// result panel
		resultPanel: {
			padding: omSpacing.l,
			borderRadius: omRadius.l,
			backgroundColor: p.surface,
			borderWidth: 1,
			borderColor: p.accentBorder,
			gap: omSpacing.m,
		},
		resultKicker: { color: p.accentStrong, letterSpacing: 1.4 },
		mutedBody: { color: p.textMuted },

		obsCard: {
			padding: omSpacing.l,
			borderRadius: omRadius.l,
			backgroundColor: p.surfaceRaised,
			borderWidth: 1,
			borderColor: p.border,
			gap: omSpacing.m,
		},
		obsHeader: { gap: omSpacing.xs },
		obsTitle: { color: p.text },
		obsBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: omSpacing.xs },
		obsGenotype: {
			padding: omSpacing.m,
			borderRadius: omRadius.m,
			backgroundColor: p.accentSoft,
			gap: 2,
		},
		obsGenotypeLabel: { color: p.textMuted, letterSpacing: 1 },
		obsGenotypeValue: { color: p.accentStrong },
		obsGenotypeMeta: { color: p.textMuted },
		obsEvidence: { color: p.textMuted },

		preBlock: {
			padding: omSpacing.l,
			borderRadius: omRadius.m,
			backgroundColor: p.surfaceSunken,
			borderWidth: 1,
			borderColor: p.border,
		},
		preText: {
			color: p.text,
			fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
			fontSize: 12,
			lineHeight: 18,
		},

		metaChip: {
			paddingHorizontal: omSpacing.m,
			paddingVertical: 4,
			borderRadius: omRadius.full,
			backgroundColor: p.surfaceSunken,
		},
		metaChipText: { color: p.textMuted },

		// error
		errorBlock: {
			flexDirection: 'row',
			gap: omSpacing.m,
			padding: omSpacing.l,
			borderRadius: omRadius.l,
			backgroundColor: p.dangerBg,
			borderWidth: 1,
			borderColor: p.dangerBorder,
		},
		errorTitle: { color: p.dangerText },
		errorBody: { color: p.dangerText },
		errorInline: { color: p.dangerText },

		// preset list
		presetSection: {
			gap: omSpacing.s,
			marginTop: omSpacing.l,
		},
		presetSectionKicker: { color: p.textFaint, letterSpacing: 1.4 },
		presetList: { gap: omSpacing.xs },
		presetRow: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: omSpacing.m,
			paddingHorizontal: omSpacing.l,
			paddingVertical: omSpacing.m,
			borderRadius: omRadius.l,
			backgroundColor: p.surface,
			borderWidth: 1,
			borderColor: p.border,
		},
		presetRowDisabled: { opacity: 0.5 },
		presetRowAdd: {
			borderStyle: 'dashed',
			borderColor: p.accentBorder,
			backgroundColor: 'transparent',
		},
		presetIcon: {
			width: 32,
			height: 32,
			borderRadius: 8,
			alignItems: 'center',
			justifyContent: 'center',
			backgroundColor: p.accentSoft,
		},
		presetIconAdd: {
			width: 32,
			height: 32,
			borderRadius: 8,
			alignItems: 'center',
			justifyContent: 'center',
			backgroundColor: p.accentTint,
			borderWidth: 1,
			borderStyle: 'dashed',
			borderColor: p.accentBorder,
		},
		presetText: { flex: 1, gap: 2 },
		presetTitle: { color: p.text },
		presetMeta: { color: p.textMuted },
		presetCta: { color: p.accentStrong },
		presetCtaGhost: { color: p.accentStrong },

		// shared prompt (deep link)
		sharedPrompt: {
			padding: omSpacing.l,
			borderRadius: omRadius.l,
			backgroundColor: p.accentSoft,
			borderWidth: 1,
			borderColor: p.accentBorder,
			gap: omSpacing.xs,
		},
		sharedPromptKicker: { color: p.accentStrong, letterSpacing: 1.4 },
		sharedPromptTitle: { color: p.text },
		sharedPromptMeta: { color: p.accentStrong, marginTop: omSpacing.xs },
		sharedPromptActions: {
			flexDirection: 'row',
			flexWrap: 'wrap',
			gap: omSpacing.s,
			marginTop: omSpacing.s,
		},

		// buttons
		primaryButton: {
			paddingHorizontal: omSpacing.xl,
			paddingVertical: omSpacing.m,
			borderRadius: omRadius.full,
			backgroundColor: p.accent,
		},
		primaryButtonDisabled: { opacity: 0.4 },
		primaryButtonText: { color: p.invertText },
		textButton: {
			paddingHorizontal: omSpacing.m,
			paddingVertical: omSpacing.s,
			borderRadius: omRadius.full,
		},
		textButtonText: { color: p.accentStrong },

		// unknown files note
		unknownNote: {
			padding: omSpacing.m,
			borderRadius: omRadius.m,
			backgroundColor: p.warningBg,
			borderWidth: 1,
			borderColor: p.warningBorder,
			gap: omSpacing.xs,
		},
		unknownNoteHead: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: omSpacing.xs,
		},
		unknownNoteTitle: { color: p.warningText },
		unknownRow: {
			flexDirection: 'row',
			alignItems: 'center',
			justifyContent: 'space-between',
			gap: omSpacing.m,
		},
		unknownRowName: { color: p.textMuted, flex: 1 },

		// footer
		footerNote: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: omSpacing.xs,
			marginTop: omSpacing.l,
		},
		footerNoteText: { color: p.textFaint },

		// drag overlay
		dragOverlay: {
			position: 'fixed',
			top: 0,
			left: 0,
			right: 0,
			bottom: 0,
			backgroundColor: p.overlayBg,
			alignItems: 'center',
			justifyContent: 'center',
			zIndex: 9999,
			padding: omSpacing.xl,
		},
		dragOverlayCard: {
			alignItems: 'center',
			gap: omSpacing.s,
			padding: omSpacing.xxxl,
			borderRadius: omRadius.l,
			borderWidth: 2,
			borderStyle: 'dashed',
			borderColor: p.accent,
			backgroundColor: p.overlayCardBg,
			maxWidth: 480,
		},
		dragOverlayTitle: { color: p.accentStrong, textAlign: 'center' },
		dragOverlayBody: { color: p.text, textAlign: 'center' },
	})
}
