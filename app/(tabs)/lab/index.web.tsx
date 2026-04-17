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

	const startOver = useCallback(() => {
		setAssays([])
		setGenomes([])
		setUnknowns([])
		setSelectedAssayId(null)
		setSelectedGenomeId(null)
		setRun({ status: 'idle' })
		setDismissedAssayUrl(null)
		setDismissedExampleId(null)
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

	const stage: Stage =
		run.status !== 'idle' ? 'result' : activeAssay ? 'drop' : 'choose'

	return (
		<ThemeCtx.Provider value={themeValue}>
			<SafeAreaView style={styles.safe} edges={['top']}>
				{dragActive ? <DragOverlay /> : null}

				<ScrollView
					style={styles.scroll}
					contentContainerStyle={styles.content}
					key={stage}
				>
					{stage === 'choose' ? (
						<ChooseStage
							deepLinkUrl={showRemoteAssayPrompt ? requestedAssayUrl : null}
							deepLinkLoading={remoteAssayLoading}
							deepLinkError={remoteAssayLoadError}
							onLoadDeepLink={() => void loadRequestedAssay()}
							onDismissDeepLink={() =>
								requestedAssayUrl && setDismissedAssayUrl(requestedAssayUrl)
							}
							sharedExample={showExamplePrompt ? requestedExample : null}
							sharedExampleLoading={
								requestedExample ? samplePresetLoadingId === requestedExample.id : false
							}
							sharedExampleError={samplePresetError}
							onLoadSharedExample={() =>
								requestedExample && void loadSamplePreset(requestedExample)
							}
							onDismissSharedExample={() =>
								requestedExample && setDismissedExampleId(requestedExample.id)
							}
							samplePresetLoadingId={samplePresetLoadingId}
							samplePresetAssayLoadingId={samplePresetAssayLoadingId}
							samplePresetError={samplePresetError}
							onUseWithMyFiles={(preset) => void loadAssayFromPreset(preset)}
							onTryWithDemoData={(preset) => void loadSamplePreset(preset)}
							onDropOwnAssay={() => openPicker('.py,.yaml,.yml')}
							pendingGenome={activeGenome}
							onClearPendingGenome={clearGenome}
							isWide={isWide}
						/>
					) : null}

					{stage === 'drop' && activeAssay ? (
						<DropStage
							assay={activeAssay}
							genome={activeGenome}
							dragActive={dragActive}
							onChooseFile={() => openPicker()}
							onBack={clearAssay}
							onRemoveGenome={clearGenome}
							unknowns={unknowns}
							onRemoveUnknown={removeUnknown}
						/>
					) : null}

					{stage === 'result' && activeAssay ? (
						<ResultStage
							run={run}
							assay={activeAssay}
							genome={activeGenome}
							onTryAnotherFile={clearGenome}
							onChangeAssay={clearAssay}
							onStartOver={startOver}
						/>
					) : null}
				</ScrollView>
			</SafeAreaView>
		</ThemeCtx.Provider>
	)
}

// === Stage: Choose =========================================================

function ChooseStage({
	deepLinkError,
	deepLinkLoading,
	deepLinkUrl,
	isWide,
	onClearPendingGenome,
	onDismissDeepLink,
	onDismissSharedExample,
	onDropOwnAssay,
	onLoadDeepLink,
	onLoadSharedExample,
	onTryWithDemoData,
	onUseWithMyFiles,
	pendingGenome,
	samplePresetAssayLoadingId,
	samplePresetError,
	samplePresetLoadingId,
	sharedExample,
	sharedExampleError,
	sharedExampleLoading,
}: {
	deepLinkError: string | null
	deepLinkLoading: boolean
	deepLinkUrl: string | null
	isWide: boolean
	onClearPendingGenome: () => void
	onDismissDeepLink: () => void
	onDismissSharedExample: () => void
	onDropOwnAssay: () => void
	onLoadDeepLink: () => void
	onLoadSharedExample: () => void
	onTryWithDemoData: (preset: LabSamplePreset) => void
	onUseWithMyFiles: (preset: LabSamplePreset) => void
	pendingGenome: Genome | null
	samplePresetAssayLoadingId: string | null
	samplePresetError: string | null
	samplePresetLoadingId: string | null
	sharedExample: LabSamplePreset | null
	sharedExampleError: string | null
	sharedExampleLoading: boolean
}) {
	const { styles } = useTheme()
	return (
		<View style={styles.stack}>
			<Hero />

			{deepLinkUrl ? (
				<SharedAssayPrompt
					url={deepLinkUrl}
					loading={deepLinkLoading}
					error={deepLinkError}
					onLoad={onLoadDeepLink}
					onDismiss={onDismissDeepLink}
				/>
			) : null}

			{sharedExample ? (
				<SharedExamplePrompt
					preset={sharedExample}
					loading={sharedExampleLoading}
					error={sharedExampleError}
					onLoad={onLoadSharedExample}
					onDismiss={onDismissSharedExample}
				/>
			) : null}

			{pendingGenome ? (
				<PendingGenomeNotice genome={pendingGenome} onClear={onClearPendingGenome} />
			) : null}

			<View style={styles.pickerHead}>
				<OMText variant="h3" style={styles.pickerTitle}>
					What do you want to check?
				</OMText>
				<OMText variant="body" style={styles.pickerSubtitle}>
					Pick an assay. Run it with your own files, or try it with demo data first.
				</OMText>
			</View>

			<View style={[styles.sampleGrid, isWide ? styles.sampleGridWide : null]}>
				{LAB_SAMPLE_PRESETS.map((preset) => (
					<AssayChoiceCard
						key={preset.id}
						preset={preset}
						demoLoading={samplePresetLoadingId === preset.id}
						useLoading={samplePresetAssayLoadingId === preset.id}
						onUseWithMyFiles={() => onUseWithMyFiles(preset)}
						onTryWithDemoData={() => onTryWithDemoData(preset)}
					/>
				))}
			</View>

			{samplePresetError ? (
				<OMText variant="caption" style={styles.errorInline}>
					{samplePresetError}
				</OMText>
			) : null}

			<Pressable onPress={onDropOwnAssay} style={styles.ghostButton}>
				<OMIcon name="add-outline" tone="accent" size={16} />
				<OMText variant="subtitle" style={styles.ghostButtonText}>
					Use your own assay (.py or .yaml)
				</OMText>
			</Pressable>

			<PrivacyFootnote />
		</View>
	)
}

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

function AssayChoiceCard({
	demoLoading,
	onTryWithDemoData,
	onUseWithMyFiles,
	preset,
	useLoading,
}: {
	demoLoading: boolean
	onTryWithDemoData: () => void
	onUseWithMyFiles: () => void
	preset: LabSamplePreset
	useLoading: boolean
}) {
	const { styles } = useTheme()
	return (
		<View style={styles.assayCard}>
			<View style={styles.assayCardHead}>
				<View style={styles.sampleIcon}>
					<OMIcon name="flask-outline" tone="accent" size={22} />
				</View>
				<View style={{ flex: 1, gap: 4 }}>
					<OMText variant="headline" style={styles.assayCardTitle}>
						{preset.title}
					</OMText>
					<OMText variant="caption" style={styles.assayCardMeta}>
						{preset.assayLabel} · expects {preset.inputKindLabel}
					</OMText>
				</View>
			</View>

			<OMText variant="body" style={styles.assayCardBody}>
				{preset.description}
			</OMText>

			<View style={styles.assayCardActions}>
				<Pressable
					onPress={onUseWithMyFiles}
					disabled={useLoading || demoLoading}
					style={[
						styles.primaryButton,
						useLoading || demoLoading ? styles.primaryButtonDisabled : null,
					]}
				>
					<OMText variant="subtitle" style={styles.primaryButtonText}>
						{useLoading ? 'Loading…' : 'Use with my files'}
					</OMText>
				</Pressable>
				<Pressable
					onPress={onTryWithDemoData}
					disabled={useLoading || demoLoading}
					style={[
						styles.secondaryButton,
						useLoading || demoLoading ? styles.primaryButtonDisabled : null,
					]}
				>
					<OMText variant="subtitle" style={styles.secondaryButtonText}>
						{demoLoading ? 'Loading…' : 'Try with demo data'}
					</OMText>
				</Pressable>
			</View>
		</View>
	)
}

function SharedAssayPrompt({
	error,
	loading,
	onDismiss,
	onLoad,
	url,
}: {
	error: string | null
	loading: boolean
	onDismiss: () => void
	onLoad: () => void
	url: string
}) {
	const { styles } = useTheme()
	return (
		<View style={styles.sharedPrompt}>
			<View style={styles.sharedPromptHead}>
				<OMIcon name="link-outline" tone="accent" size={16} />
				<OMText variant="caption" style={styles.sharedPromptKicker}>
					SHARED WITH YOU
				</OMText>
			</View>
			<OMText variant="headline" style={styles.sharedPromptTitle}>
				Someone shared an assay with you
			</OMText>
			<OMText variant="body" style={styles.sharedPromptBody}>
				Load the script into the lab, then drop your genome to run it.
			</OMText>
			<OMText variant="caption" style={styles.sharedPromptMeta}>
				{tryGetHostPath(url)}
			</OMText>
			{error ? (
				<OMText variant="caption" style={styles.errorInline}>
					{error}
				</OMText>
			) : null}
			<View style={styles.sharedPromptActions}>
				<Pressable
					onPress={onLoad}
					disabled={loading}
					style={[styles.primaryButton, loading ? styles.primaryButtonDisabled : null]}
				>
					<OMText variant="subtitle" style={styles.primaryButtonText}>
						{loading ? 'Loading…' : 'Load assay'}
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

function SharedExamplePrompt({
	error,
	loading,
	onDismiss,
	onLoad,
	preset,
}: {
	error: string | null
	loading: boolean
	onDismiss: () => void
	onLoad: () => void
	preset: LabSamplePreset
}) {
	const { styles } = useTheme()
	return (
		<View style={styles.sharedPrompt}>
			<View style={styles.sharedPromptHead}>
				<OMIcon name="link-outline" tone="accent" size={16} />
				<OMText variant="caption" style={styles.sharedPromptKicker}>
					SHARED WITH YOU
				</OMText>
			</View>
			<OMText variant="headline" style={styles.sharedPromptTitle}>
				Load {preset.title}?
			</OMText>
			<OMText variant="body" style={styles.sharedPromptBody}>
				{preset.description}
			</OMText>
			{error ? (
				<OMText variant="caption" style={styles.errorInline}>
					{error}
				</OMText>
			) : null}
			<View style={styles.sharedPromptActions}>
				<Pressable
					onPress={onLoad}
					disabled={loading}
					style={[styles.primaryButton, loading ? styles.primaryButtonDisabled : null]}
				>
					<OMText variant="subtitle" style={styles.primaryButtonText}>
						{loading ? 'Loading…' : 'Load & run'}
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

function PendingGenomeNotice({
	genome,
	onClear,
}: {
	genome: Genome
	onClear: () => void
}) {
	const { styles } = useTheme()
	return (
		<View style={styles.pendingNotice}>
			<OMIcon name="checkmark-circle" tone="accent" size={16} />
			<OMText variant="body" style={styles.pendingNoticeText}>
				Genome ready: {genomeDisplayName(genome)} · pick an assay below to run it.
			</OMText>
			<Pressable onPress={onClear} style={styles.textButton}>
				<OMText variant="subtitle" style={styles.textButtonText}>
					Remove file
				</OMText>
			</Pressable>
		</View>
	)
}

// === Stage: Drop ===========================================================

function DropStage({
	assay,
	dragActive,
	genome,
	onBack,
	onChooseFile,
	onRemoveGenome,
	onRemoveUnknown,
	unknowns,
}: {
	assay: Assay
	dragActive: boolean
	genome: Genome | null
	onBack: () => void
	onChooseFile: () => void
	onRemoveGenome: () => void
	onRemoveUnknown: (id: string) => void
	unknowns: UnknownEntry[]
}) {
	const { styles } = useTheme()
	return (
		<View style={styles.stack}>
			<BackBar label="Change assay" onBack={onBack} />

			<View style={styles.contextHeader}>
				<View style={styles.sampleIcon}>
					<OMIcon name="flask-outline" tone="accent" size={20} />
				</View>
				<View style={{ flex: 1, gap: 2 }}>
					<OMText variant="caption" style={styles.contextKicker}>
						RUNNING
					</OMText>
					<OMText variant="headline" style={styles.contextTitle}>
						{assay.name}
					</OMText>
					<OMText variant="caption" style={styles.contextMeta}>
						{assay.language === 'python' ? 'Python assay' : 'YAML assay'}
						{assay.source ? ` · from ${tryGetHostPath(assay.source)}` : ' · local file'}
					</OMText>
				</View>
			</View>

			{!genome ? (
				<Pressable
					onPress={onChooseFile}
					style={[styles.dropZone, dragActive ? styles.dropZoneActive : null]}
				>
					<OMIcon name="cloud-upload-outline" tone="accent" size={40} />
					<OMText variant="h3" style={styles.dropZoneTitle}>
						Drop your genome
					</OMText>
					<OMText variant="body" style={styles.dropZoneBody}>
						.cram · .vcf.gz · .zip · 23andMe-style .txt
					</OMText>
					<View style={styles.dropZoneButton}>
						<OMText variant="subtitle" style={styles.primaryButtonText}>
							Choose file
						</OMText>
					</View>
					<OMText variant="caption" style={styles.dropZoneHint}>
						Drag anywhere on the page, or click to browse. Companion files (.crai, .fa, .fa.fai, .tbi) are paired automatically.
					</OMText>
				</Pressable>
			) : (
				<GenomePanel genome={genome} onRemove={onRemoveGenome} />
			)}

			{unknowns.length > 0 ? (
				<UnknownFilesNote unknowns={unknowns} onRemove={onRemoveUnknown} />
			) : null}

			<PrivacyFootnote />
		</View>
	)
}

function GenomePanel({ genome, onRemove }: { genome: Genome; onRemove: () => void }) {
	const { styles, mutedIconTone } = useTheme()
	const complete = isGenomeComplete(genome)
	const missing = missingGenomeSlots(genome)
	return (
		<View style={[styles.panel, complete ? styles.panelOk : styles.panelWarn]}>
			<View style={styles.panelHead}>
				<View style={{ flex: 1, gap: 2 }}>
					<OMText variant="caption" style={styles.panelKicker}>
						{complete ? 'READY' : 'NEEDS FILES'}
					</OMText>
					<OMText variant="headline" style={styles.panelTitle}>
						{genomeDisplayName(genome)}
					</OMText>
					<OMText variant="caption" style={styles.panelMeta}>
						{genomeKindLabel(genome)} · {humanLabSize(genomeBytesTotal(genome))}
					</OMText>
				</View>
				<Pressable onPress={onRemove} style={styles.labeledIconButton}>
					<OMIcon name="close-outline" tone={mutedIconTone} size={14} />
					<OMText variant="subtitle" style={styles.labeledIconButtonText}>
						Remove file
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
					Drop these to continue: {missing.join(' · ')}
				</OMText>
			) : (
				<OMText variant="caption" style={styles.panelHint}>
					About to run…
				</OMText>
			)}
		</View>
	)
}

// === Stage: Result =========================================================

function ResultStage({
	assay,
	genome,
	onChangeAssay,
	onStartOver,
	onTryAnotherFile,
	run,
}: {
	assay: Assay
	genome: Genome | null
	onChangeAssay: () => void
	onStartOver: () => void
	onTryAnotherFile: () => void
	run: RunResult
}) {
	const { palette, styles } = useTheme()
	return (
		<View style={styles.stack}>
			<BackBar label="Try another file" onBack={onTryAnotherFile} />

			<View style={styles.contextHeader}>
				<View style={styles.sampleIcon}>
					<OMIcon name="flask-outline" tone="accent" size={20} />
				</View>
				<View style={{ flex: 1, gap: 2 }}>
					<OMText variant="caption" style={styles.contextKicker}>
						RESULT FOR
					</OMText>
					<OMText variant="headline" style={styles.contextTitle}>
						{assay.name}
						{genome ? ` · ${genomeDisplayName(genome)}` : ''}
					</OMText>
				</View>
			</View>

			{run.status === 'running' ? (
				<View style={styles.runningPanel}>
					<ActivityIndicator size="large" color={palette.accent} />
					<OMText variant="headline" style={styles.runningTitle}>
						Running {assay.name} in your browser…
					</OMText>
					<OMText variant="caption" style={styles.runningBody}>
						Nothing is uploaded. Large files still finish in seconds.
					</OMText>
				</View>
			) : null}

			{run.status === 'done' && run.observations ? (
				<ResultPanel
					durationMs={run.durationMs ?? 0}
					observations={run.observations}
				/>
			) : null}

			{run.status === 'done' && run.textOutput !== undefined ? (
				<TextResultsPanel durationMs={run.durationMs ?? 0} text={run.textOutput} />
			) : null}

			{run.status === 'error' && run.error ? <ErrorPanel error={run.error} /> : null}

			{run.status !== 'running' ? (
				<View style={styles.resultActionRow}>
					<Pressable onPress={onTryAnotherFile} style={styles.primaryButton}>
						<OMText variant="subtitle" style={styles.primaryButtonText}>
							Try another file
						</OMText>
					</Pressable>
					<Pressable onPress={onChangeAssay} style={styles.secondaryButton}>
						<OMText variant="subtitle" style={styles.secondaryButtonText}>
							Change assay
						</OMText>
					</Pressable>
					<Pressable onPress={onStartOver} style={styles.textButton}>
						<OMText variant="subtitle" style={styles.textButtonText}>
							Start over
						</OMText>
					</Pressable>
				</View>
			) : null}

			<PrivacyFootnote />
		</View>
	)
}

function ResultPanel({
	durationMs,
	observations,
}: {
	durationMs: number
	observations: VariantObservation[]
}) {
	const { styles } = useTheme()
	return (
		<View style={styles.resultPanel}>
			<OMText variant="caption" style={styles.resultKicker}>
				{observations.length} variant{observations.length === 1 ? '' : 's'} · {durationMs} ms
			</OMText>
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

function TextResultsPanel({ durationMs, text }: { durationMs: number; text: string }) {
	const { styles } = useTheme()
	return (
		<View style={styles.resultPanel}>
			<OMText variant="caption" style={styles.resultKicker}>
				{durationMs} ms
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

// === Shared widgets ========================================================

function BackBar({ label, onBack }: { label: string; onBack: () => void }) {
	const { styles } = useTheme()
	return (
		<Pressable onPress={onBack} style={styles.backBar}>
			<OMIcon name="arrow-back-outline" tone="accent" size={18} />
			<OMText variant="subtitle" style={styles.backBarText}>
				{label}
			</OMText>
		</Pressable>
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
			<View style={styles.stackTight}>
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
			maxWidth: 760,
			width: '100%',
			alignSelf: 'center',
		},

		stack: { gap: omSpacing.l },
		stackTight: { gap: omSpacing.xs },

		// hero
		hero: {
			gap: omSpacing.s,
			paddingBottom: omSpacing.s,
		},
		heroKicker: { color: p.accentStrong, letterSpacing: 1.4 },
		heroTitle: { color: p.text, lineHeight: 42, maxWidth: 640 },
		heroBody: { color: p.textMuted, maxWidth: 620 },

		// back bar — prominent, labeled, obvious
		backBar: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: omSpacing.s,
			paddingHorizontal: omSpacing.m,
			paddingVertical: omSpacing.s,
			borderRadius: omRadius.full,
			backgroundColor: p.surface,
			borderWidth: 1,
			borderColor: p.borderStrong,
			alignSelf: 'flex-start',
		},
		backBarText: { color: p.accentStrong },

		// context header (shown above drop / result)
		contextHeader: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: omSpacing.m,
			padding: omSpacing.l,
			borderRadius: omRadius.l,
			backgroundColor: p.accentSoft,
			borderWidth: 1,
			borderColor: p.accentBorder,
		},
		contextKicker: { color: p.accentStrong, letterSpacing: 1.4 },
		contextTitle: { color: p.text },
		contextMeta: { color: p.textMuted },

		// picker
		pickerHead: { gap: omSpacing.xs },
		pickerTitle: { color: p.text, lineHeight: 40 },
		pickerSubtitle: { color: p.textMuted },

		sampleGrid: { gap: omSpacing.m },
		sampleGridWide: {
			flexDirection: 'row',
			flexWrap: 'wrap',
		},

		// assay choice card
		assayCard: {
			flex: 1,
			minWidth: 280,
			padding: omSpacing.l,
			borderRadius: omRadius.l,
			backgroundColor: p.surface,
			borderWidth: 1,
			borderColor: p.border,
			gap: omSpacing.m,
		},
		assayCardHead: {
			flexDirection: 'row',
			alignItems: 'flex-start',
			gap: omSpacing.m,
		},
		assayCardTitle: { color: p.text },
		assayCardMeta: { color: p.textFaint },
		assayCardBody: { color: p.textMuted },
		assayCardActions: {
			flexDirection: 'row',
			flexWrap: 'wrap',
			gap: omSpacing.s,
			marginTop: omSpacing.xs,
		},
		sampleIcon: {
			width: 40,
			height: 40,
			borderRadius: 12,
			alignItems: 'center',
			justifyContent: 'center',
			backgroundColor: p.accentSoft,
		},

		// shared prompt (deep link / shared example)
		sharedPrompt: {
			padding: omSpacing.xl,
			borderRadius: omRadius.l,
			backgroundColor: p.accentSoft,
			borderWidth: 1,
			borderColor: p.accentBorder,
			gap: omSpacing.s,
		},
		sharedPromptHead: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: omSpacing.xs,
		},
		sharedPromptKicker: { color: p.accentStrong, letterSpacing: 1.4 },
		sharedPromptTitle: { color: p.text },
		sharedPromptBody: { color: p.textMuted },
		sharedPromptMeta: { color: p.accentStrong, marginTop: omSpacing.xs },
		sharedPromptActions: {
			flexDirection: 'row',
			flexWrap: 'wrap',
			gap: omSpacing.s,
			marginTop: omSpacing.s,
		},

		// pending genome notice (shown on choose when a genome is already dropped)
		pendingNotice: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: omSpacing.s,
			padding: omSpacing.m,
			borderRadius: omRadius.m,
			backgroundColor: p.accentSoft,
			borderWidth: 1,
			borderColor: p.accentBorder,
		},
		pendingNoticeText: { color: p.text, flex: 1 },

		// drop zone
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
		dropZoneActive: {
			borderColor: p.accent,
			backgroundColor: p.accentSoft,
		},
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

		// genome panel
		panel: {
			padding: omSpacing.l,
			borderRadius: omRadius.l,
			backgroundColor: p.surface,
			borderWidth: 1,
			borderColor: p.border,
			gap: omSpacing.m,
		},
		panelOk: {
			borderColor: p.accentBorder,
			backgroundColor: p.accentTint,
		},
		panelWarn: {
			borderColor: p.warningBorder,
			backgroundColor: p.warningBg,
		},
		panelHead: {
			flexDirection: 'row',
			alignItems: 'flex-start',
			gap: omSpacing.m,
		},
		panelKicker: { color: p.accentStrong, letterSpacing: 1.4 },
		panelTitle: { color: p.text },
		panelMeta: { color: p.textMuted },
		panelHint: { color: p.textFaint },

		// labeled remove button
		labeledIconButton: {
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
		labeledIconButtonText: { color: p.textMuted },

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

		missingText: { color: p.warningText },

		// running panel
		runningPanel: {
			padding: omSpacing.xxxl,
			borderRadius: omRadius.l,
			backgroundColor: p.surface,
			borderWidth: 1,
			borderColor: p.border,
			alignItems: 'center',
			gap: omSpacing.m,
		},
		runningTitle: { color: p.text, textAlign: 'center' },
		runningBody: { color: p.textMuted, textAlign: 'center' },

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

		// result action row
		resultActionRow: {
			flexDirection: 'row',
			flexWrap: 'wrap',
			gap: omSpacing.s,
		},

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

		// buttons
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
		secondaryButtonText: { color: p.text },
		textButton: {
			paddingHorizontal: omSpacing.m,
			paddingVertical: omSpacing.s,
			borderRadius: omRadius.full,
		},
		textButtonText: { color: p.accentStrong },
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

		// unknown files note
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
