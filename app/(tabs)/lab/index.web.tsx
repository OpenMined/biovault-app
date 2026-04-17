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
	type ReactNode,
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
	useWindowDimensions,
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
	const { width } = useWindowDimensions()

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

	const isWide = width >= 720

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
				trackEvent('lab_sample_preset_failed', {
					presetId: preset.id,
					error: message,
				})
			} finally {
				setSamplePresetLoadingId(null)
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
		setDismissedAssayUrl(null)
		setDismissedExampleId(null)
	}, [])

	const clearGenome = useCallback(() => {
		setGenomes([])
		setSelectedGenomeId(null)
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

	// Reset run to idle whenever the active inputs change identity, so a fresh
	// set of files can auto-run even if a previous run finished.
	const lastRunKeyRef = useRef<string>('')
	useEffect(() => {
		const key = `${activeGenome?.id ?? ''}::${activeAssay?.id ?? ''}`
		if (key !== lastRunKeyRef.current) {
			lastRunKeyRef.current = key
			setRun((prev) => (prev.status === 'running' ? prev : { status: 'idle' }))
		}
	}, [activeGenome, activeAssay])

	// Auto-run as soon as a complete assay + genome pair is ready. This is the
	// core "drop and get a result" flow Madhava described.
	useEffect(() => {
		if (run.status !== 'idle') return
		if (!activeGenome || !activeAssay) return
		if (runDisabledReason) return
		void executeRun()
	}, [activeGenome, activeAssay, run.status, runDisabledReason, executeRun])

	return (
		<ThemeCtx.Provider value={themeValue}>
			<SafeAreaView style={styles.safe} edges={['top']}>
				{dragActive ? (
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
				) : null}

				<ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
					<Hero />

					<AssayCard
						assay={activeAssay}
						deepLinkUrl={showRemoteAssayPrompt ? requestedAssayUrl : null}
						deepLinkLoading={remoteAssayLoading}
						deepLinkError={remoteAssayLoadError}
						onLoadDeepLink={() => void loadRequestedAssay()}
						onDismissDeepLink={() =>
							requestedAssayUrl && setDismissedAssayUrl(requestedAssayUrl)
						}
						onChoose={() => openPicker('.py,.yaml,.yml')}
						onClear={clearAssay}
					/>

					<GenomeSurface
						genome={activeGenome}
						assay={activeAssay}
						run={run}
						dragActive={dragActive}
						onChoose={() => openPicker()}
						onClear={clearGenome}
					/>

					{run.status === 'error' && run.error ? <ErrorBlock error={run.error} /> : null}

					{run.status === 'done' && run.observations ? (
						<ResultsBlock
							durationMs={run.durationMs ?? 0}
							observations={run.observations}
							assayName={activeAssay?.name ?? 'assay'}
						/>
					) : null}

					{run.status === 'done' && run.textOutput !== undefined ? (
						<TextResultsBlock durationMs={run.durationMs ?? 0} text={run.textOutput} />
					) : null}

					{unknowns.length > 0 ? (
						<UnknownFilesNote unknowns={unknowns} onRemove={removeUnknown} />
					) : null}

					{!activeAssay ? (
						<AssayPicker
							loadingId={samplePresetLoadingId}
							error={samplePresetError}
							onLoad={(preset) => void loadSamplePreset(preset)}
							onChooseOwn={() => openPicker('.py,.yaml,.yml')}
							requestedExample={showExamplePrompt ? requestedExample : null}
							requestedExampleLoading={
								requestedExample ? samplePresetLoadingId === requestedExample.id : false
							}
							requestedExampleError={samplePresetError}
							onLoadRequestedExample={() =>
								requestedExample && void loadSamplePreset(requestedExample)
							}
							onDismissRequestedExample={() =>
								requestedExample && setDismissedExampleId(requestedExample.id)
							}
							isWide={isWide}
						/>
					) : null}

					{!activeAssay && !activeGenome ? <FooterNote /> : null}
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

// === Assay card ============================================================

function AssayCard({
	assay,
	deepLinkError,
	deepLinkLoading,
	deepLinkUrl,
	onChoose,
	onClear,
	onDismissDeepLink,
	onLoadDeepLink,
}: {
	assay: Assay | null
	deepLinkError: string | null
	deepLinkLoading: boolean
	deepLinkUrl: string | null
	onChoose: () => void
	onClear: () => void
	onDismissDeepLink: () => void
	onLoadDeepLink: () => void
}) {
	const { styles } = useTheme()

	if (deepLinkUrl) {
		return (
			<View style={[styles.surface, styles.surfaceHighlight]}>
				<SurfaceHeader
					kicker="STEP 1 · ASSAY"
					title="Someone shared an assay with you"
				/>
				<OMText variant="body" style={styles.surfaceBody}>
					Load this script into the lab, then drop your genome to run it.
				</OMText>
				<View style={styles.deepLinkPath}>
					<OMIcon name="link-outline" tone="accent" size={14} />
					<OMText variant="caption" style={styles.deepLinkPathText}>
						{tryGetHostPath(deepLinkUrl)}
					</OMText>
				</View>
				{deepLinkError ? (
					<OMText variant="caption" style={styles.errorInline}>
						{deepLinkError}
					</OMText>
				) : null}
				<View style={styles.actionRow}>
					<Pressable onPress={onDismissDeepLink} style={styles.secondaryButton}>
						<OMText variant="subtitle" style={styles.secondaryButtonText}>
							Not now
						</OMText>
					</Pressable>
					<Pressable
						onPress={onLoadDeepLink}
						disabled={deepLinkLoading}
						style={[styles.primaryButton, deepLinkLoading ? styles.primaryButtonDisabled : null]}
					>
						<OMText variant="subtitle" style={styles.primaryButtonText}>
							{deepLinkLoading ? 'Loading…' : 'Load assay'}
						</OMText>
					</Pressable>
				</View>
			</View>
		)
	}

	if (!assay) {
		return (
			<Pressable onPress={onChoose} style={[styles.surface, styles.surfaceEmpty]}>
				<SurfaceHeader kicker="STEP 1 · ASSAY" title="Choose an assay" muted />
				<OMText variant="body" style={styles.surfaceBody}>
					Pick one of the assays below, drop a .py or .yaml file, or open a shared link.
				</OMText>
			</Pressable>
		)
	}

	return (
		<View style={[styles.surface, styles.surfaceLoaded]}>
			<SurfaceHeader kicker="STEP 1 · ASSAY" title={assay.name} />
			<OMText variant="caption" style={styles.surfaceMeta}>
				{assay.language === 'python' ? 'Python assay' : 'YAML assay'} ·{' '}
				{humanLabSize(assay.file.size)} ·{' '}
				{assay.source ? `from ${tryGetHostPath(assay.source)}` : 'local file'}
			</OMText>
			<View style={styles.actionRow}>
				<Pressable onPress={onClear} style={styles.secondaryButton}>
					<OMText variant="subtitle" style={styles.secondaryButtonText}>
						Change assay
					</OMText>
				</Pressable>
			</View>
		</View>
	)
}

// === Genome surface ========================================================

function GenomeSurface({
	assay,
	dragActive,
	genome,
	onChoose,
	onClear,
	run,
}: {
	assay: Assay | null
	dragActive: boolean
	genome: Genome | null
	onChoose: () => void
	onClear: () => void
	run: RunResult
}) {
	const { styles, palette } = useTheme()

	const isRunning = run.status === 'running'

	if (!genome) {
		return (
			<Pressable
				onPress={onChoose}
				style={[
					styles.surface,
					styles.surfaceDrop,
					dragActive ? styles.surfaceDropActive : null,
				]}
			>
				<SurfaceHeader kicker="STEP 2 · GENOME" title="Drop your genome here" />
				<OMText variant="body" style={styles.surfaceBody}>
					.cram · .vcf.gz · .zip · 23andMe-style .txt — plus any index files (.crai, .fa, .fa.fai, .tbi).
				</OMText>
				<View style={styles.dropCue}>
					<OMIcon name="cloud-upload-outline" tone="accent" size={32} />
					<OMText variant="caption" style={styles.dropCueHint}>
						Drag anywhere on the page, or click to browse.
					</OMText>
				</View>
				{assay ? null : (
					<OMText variant="caption" style={styles.surfaceHint}>
						Tip: you can drop files before picking an assay — we’ll auto-run as soon as both are ready.
					</OMText>
				)}
			</Pressable>
		)
	}

	const complete = isGenomeComplete(genome)
	const missing = missingGenomeSlots(genome)

	return (
		<View style={[styles.surface, complete ? styles.surfaceLoaded : styles.surfacePartial]}>
			<SurfaceHeader
				kicker="STEP 2 · GENOME"
				title={genomeDisplayName(genome)}
				trailing={
					<Pressable onPress={onClear} style={styles.iconButton}>
						<OMIcon name="close-outline" tone="muted" size={16} />
					</Pressable>
				}
			/>
			<OMText variant="caption" style={styles.surfaceMeta}>
				{genomeKindLabel(genome)} · {humanLabSize(genomeBytesTotal(genome))}
			</OMText>

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
				<View style={styles.missingBar}>
					<OMIcon name="alert-circle-outline" tone="muted" size={14} />
					<OMText variant="caption" style={styles.missingText}>
						Drop these next: {missing.join(' · ')}
					</OMText>
				</View>
			) : null}

			{complete && !isRunning && run.status === 'idle' ? (
				<OMText variant="caption" style={styles.surfaceHint}>
					{assay ? 'Ready to run.' : 'Genome ready — pick an assay below to run it.'}
				</OMText>
			) : null}

			{isRunning ? (
				<View style={styles.runningRow}>
					<ActivityIndicator size="small" color={palette.accent} />
					<OMText variant="body" style={styles.runningText}>
						Running {assay?.name ?? 'assay'} in your browser…
					</OMText>
				</View>
			) : null}
		</View>
	)
}

// === Surface helpers =======================================================

function SurfaceHeader({
	kicker,
	muted,
	title,
	trailing,
}: {
	kicker: string
	muted?: boolean
	title: string
	trailing?: ReactNode
}) {
	const { styles } = useTheme()
	return (
		<View style={styles.surfaceHeader}>
			<View style={{ flex: 1, gap: 4 }}>
				<OMText variant="caption" style={styles.surfaceKicker}>
					{kicker}
				</OMText>
				<OMText
					variant="headline"
					style={muted ? styles.surfaceTitleMuted : styles.surfaceTitle}
				>
					{title}
				</OMText>
			</View>
			{trailing}
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

// === Results ===============================================================

function ResultsBlock({
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
		<View style={[styles.surface, styles.surfaceResult]}>
			<SurfaceHeader
				kicker="RESULT"
				title={`${assayName} · ${observations.length} variant${observations.length === 1 ? '' : 's'} · ${durationMs} ms`}
			/>
			<View style={styles.stack}>
				{observations.map((obs) => (
					<ObservationCard key={obs.name} obs={obs} />
				))}
			</View>
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

function TextResultsBlock({ durationMs, text }: { durationMs: number; text: string }) {
	const { styles } = useTheme()
	return (
		<View style={[styles.surface, styles.surfaceResult]}>
			<SurfaceHeader kicker="OUTPUT" title={`${durationMs} ms`} />
			{text ? (
				<View style={styles.preBlock}>
					<OMText variant="body" style={styles.preText}>
						{text}
					</OMText>
				</View>
			) : (
				<OMText variant="body" style={styles.surfaceBody}>
					(no output produced)
				</OMText>
			)}
		</View>
	)
}

function ErrorBlock({ error }: { error: string }) {
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

// === Assay picker ==========================================================

function AssayPicker({
	error,
	isWide,
	loadingId,
	onChooseOwn,
	onDismissRequestedExample,
	onLoad,
	onLoadRequestedExample,
	requestedExample,
	requestedExampleError,
	requestedExampleLoading,
}: {
	error: string | null
	isWide: boolean
	loadingId: string | null
	onChooseOwn: () => void
	onDismissRequestedExample: () => void
	onLoad: (preset: LabSamplePreset) => void
	onLoadRequestedExample: () => void
	requestedExample: LabSamplePreset | null
	requestedExampleError: string | null
	requestedExampleLoading: boolean
}) {
	const { styles } = useTheme()
	return (
		<View style={styles.pickerSection}>
			<View style={styles.pickerHead}>
				<OMText variant="headline" style={styles.pickerTitle}>
					Try an assay
				</OMText>
				<OMText variant="body" style={styles.pickerSubtitle}>
					Don’t have files? Each of these comes with sample data — one click runs the whole flow.
				</OMText>
			</View>

			{requestedExample ? (
				<View style={[styles.surface, styles.surfaceHighlight]}>
					<SurfaceHeader
						kicker="SHARED WITH YOU"
						title={`Load ${requestedExample.title}?`}
					/>
					<OMText variant="body" style={styles.surfaceBody}>
						{requestedExample.description}
					</OMText>
					{requestedExampleError ? (
						<OMText variant="caption" style={styles.errorInline}>
							{requestedExampleError}
						</OMText>
					) : null}
					<View style={styles.actionRow}>
						<Pressable onPress={onDismissRequestedExample} style={styles.secondaryButton}>
							<OMText variant="subtitle" style={styles.secondaryButtonText}>
								Not now
							</OMText>
						</Pressable>
						<Pressable
							onPress={onLoadRequestedExample}
							disabled={requestedExampleLoading}
							style={[
								styles.primaryButton,
								requestedExampleLoading ? styles.primaryButtonDisabled : null,
							]}
						>
							<OMText variant="subtitle" style={styles.primaryButtonText}>
								{requestedExampleLoading ? 'Loading…' : 'Load & run'}
							</OMText>
						</Pressable>
					</View>
				</View>
			) : null}

			<View style={[styles.sampleGrid, isWide ? styles.sampleGridWide : null]}>
				{LAB_SAMPLE_PRESETS.map((preset) => (
					<SampleCard
						key={preset.id}
						preset={preset}
						loading={loadingId === preset.id}
						onLoad={() => onLoad(preset)}
					/>
				))}
			</View>

			{error ? (
				<OMText variant="caption" style={styles.errorInline}>
					{error}
				</OMText>
			) : null}

			<Pressable onPress={onChooseOwn} style={styles.ghostButton}>
				<OMIcon name="add-outline" tone="accent" size={16} />
				<OMText variant="subtitle" style={styles.ghostButtonText}>
					Use your own .py or .yaml assay
				</OMText>
			</Pressable>
		</View>
	)
}

function SampleCard({
	loading,
	onLoad,
	preset,
}: {
	loading: boolean
	onLoad: () => void
	preset: LabSamplePreset
}) {
	const { styles } = useTheme()
	return (
		<Pressable onPress={onLoad} style={styles.sampleCard} disabled={loading}>
			<View style={styles.sampleIcon}>
				<OMIcon name="flask-outline" tone="accent" size={20} />
			</View>
			<OMText variant="headline" style={styles.sampleTitle}>
				{preset.title}
			</OMText>
			<OMText variant="body" style={styles.sampleBody}>
				{preset.description}
			</OMText>
			<View style={styles.sampleMetaRow}>
				<MetaChip label={preset.inputKindLabel} />
				<MetaChip label={preset.assayLabel} />
			</View>
			<View style={styles.sampleCta}>
				<OMText variant="subtitle" style={styles.sampleCtaText}>
					{loading ? 'Loading…' : 'Load & run →'}
				</OMText>
			</View>
		</Pressable>
	)
}

// === Unknown files + footer ================================================

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
			<View style={styles.stack}>
				{unknowns.map((u) => (
					<View key={u.id} style={styles.unknownRow}>
						<OMText variant="caption" style={styles.unknownRowName}>
							{u.file.name}
						</OMText>
						<Pressable onPress={() => onRemove(u.id)} style={styles.iconButton}>
							<OMIcon name="close-outline" tone={mutedIconTone} size={14} />
						</Pressable>
					</View>
				))}
			</View>
		</View>
	)
}

function FooterNote() {
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
			gap: omSpacing.l,
			maxWidth: 760,
			width: '100%',
			alignSelf: 'center',
		},

		// hero
		hero: {
			gap: omSpacing.s,
			paddingBottom: omSpacing.s,
		},
		heroKicker: { color: p.accentStrong, letterSpacing: 1.4 },
		heroTitle: { color: p.text, lineHeight: 42, maxWidth: 640 },
		heroBody: { color: p.textMuted, maxWidth: 620 },

		// generic surface
		surface: {
			padding: omSpacing.xl,
			borderRadius: omRadius.l,
			backgroundColor: p.surface,
			borderWidth: 1,
			borderColor: p.border,
			gap: omSpacing.m,
		},
		surfaceEmpty: {
			borderStyle: 'dashed',
			borderColor: p.borderStrong,
			backgroundColor: p.pageBg,
		},
		surfaceDrop: {
			borderStyle: 'dashed',
			borderColor: p.accentBorder,
			backgroundColor: p.accentTint,
			paddingVertical: omSpacing.xxxl,
			alignItems: 'flex-start',
		},
		surfaceDropActive: {
			borderColor: p.accent,
			backgroundColor: p.accentSoft,
		},
		surfaceLoaded: {
			borderColor: p.accentBorder,
			backgroundColor: p.accentTint,
		},
		surfacePartial: {
			borderColor: p.warningBorder,
			backgroundColor: p.warningBg,
		},
		surfaceHighlight: {
			borderColor: p.accentBorder,
			backgroundColor: p.accentSoft,
		},
		surfaceResult: {
			borderColor: p.accentBorder,
			backgroundColor: p.surface,
		},

		surfaceHeader: {
			flexDirection: 'row',
			alignItems: 'flex-start',
			gap: omSpacing.m,
		},
		surfaceKicker: { color: p.accentStrong, letterSpacing: 1.4 },
		surfaceTitle: { color: p.text },
		surfaceTitleMuted: { color: p.textMuted },
		surfaceBody: { color: p.textMuted },
		surfaceMeta: { color: p.textMuted },
		surfaceHint: { color: p.textFaint },

		dropCue: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: omSpacing.m,
			paddingVertical: omSpacing.s,
		},
		dropCueHint: { color: p.textMuted },

		deepLinkPath: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: omSpacing.xs,
			paddingHorizontal: omSpacing.m,
			paddingVertical: omSpacing.s,
			borderRadius: omRadius.m,
			backgroundColor: p.surfaceSunken,
			alignSelf: 'flex-start',
		},
		deepLinkPathText: { color: p.accentStrong },

		actionRow: {
			flexDirection: 'row',
			flexWrap: 'wrap',
			gap: omSpacing.s,
			marginTop: omSpacing.xs,
		},

		primaryButton: {
			paddingHorizontal: omSpacing.xl,
			paddingVertical: omSpacing.m,
			borderRadius: omRadius.full,
			backgroundColor: p.accent,
		},
		primaryButtonDisabled: { opacity: 0.4 },
		primaryButtonText: { color: p.invertText },
		secondaryButton: {
			paddingHorizontal: omSpacing.l,
			paddingVertical: omSpacing.m,
			borderRadius: omRadius.full,
			backgroundColor: p.surfaceRaised,
			borderWidth: 1,
			borderColor: p.borderStrong,
		},
		secondaryButtonText: { color: p.textMuted },
		ghostButton: {
			flexDirection: 'row',
			alignItems: 'center',
			justifyContent: 'center',
			gap: omSpacing.xs,
			alignSelf: 'flex-start',
			paddingHorizontal: omSpacing.l,
			paddingVertical: omSpacing.m,
			borderRadius: omRadius.full,
			borderWidth: 1,
			borderStyle: 'dashed',
			borderColor: p.accentBorder,
		},
		ghostButtonText: { color: p.accentStrong },
		iconButton: {
			width: 28,
			height: 28,
			borderRadius: 14,
			alignItems: 'center',
			justifyContent: 'center',
			backgroundColor: p.surfaceSunken,
		},

		// slot chips
		slotGrid: {
			flexDirection: 'row',
			flexWrap: 'wrap',
			gap: omSpacing.xs,
		},
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

		missingBar: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: omSpacing.xs,
			paddingHorizontal: omSpacing.m,
			paddingVertical: omSpacing.s,
			borderRadius: omRadius.m,
			backgroundColor: p.warningBg,
			borderWidth: 1,
			borderColor: p.warningBorder,
		},
		missingText: { color: p.warningText, flex: 1 },

		runningRow: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: omSpacing.m,
			paddingTop: omSpacing.xs,
		},
		runningText: { color: p.text },

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

		// results
		stack: { gap: omSpacing.s },
		obsCard: {
			padding: omSpacing.l,
			borderRadius: omRadius.l,
			backgroundColor: p.surfaceRaised,
			borderWidth: 1,
			borderColor: p.border,
			gap: omSpacing.m,
		},
		obsHeader: {
			gap: omSpacing.xs,
		},
		obsTitle: { color: p.text },
		obsBadgeRow: {
			flexDirection: 'row',
			flexWrap: 'wrap',
			gap: omSpacing.xs,
		},
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

		// picker
		pickerSection: {
			gap: omSpacing.m,
			marginTop: omSpacing.l,
		},
		pickerHead: { gap: omSpacing.xs / 2 },
		pickerTitle: { color: p.text },
		pickerSubtitle: { color: p.textMuted },
		sampleGrid: { gap: omSpacing.m },
		sampleGridWide: {
			flexDirection: 'row',
			flexWrap: 'wrap',
		},
		sampleCard: {
			flex: 1,
			minWidth: 260,
			padding: omSpacing.l,
			borderRadius: omRadius.l,
			backgroundColor: p.surface,
			borderWidth: 1,
			borderColor: p.border,
			gap: omSpacing.s,
		},
		sampleIcon: {
			width: 36,
			height: 36,
			borderRadius: 10,
			alignItems: 'center',
			justifyContent: 'center',
			backgroundColor: p.accentSoft,
		},
		sampleTitle: { color: p.text },
		sampleBody: { color: p.textMuted },
		sampleMetaRow: {
			flexDirection: 'row',
			flexWrap: 'wrap',
			gap: omSpacing.xs,
			marginTop: omSpacing.xs,
		},
		sampleCta: { marginTop: omSpacing.s },
		sampleCtaText: { color: p.accentStrong },

		// unknown
		unknownNote: {
			padding: omSpacing.m,
			borderRadius: omRadius.m,
			backgroundColor: p.warningBg,
			borderWidth: 1,
			borderColor: p.warningBorder,
			gap: omSpacing.s,
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
