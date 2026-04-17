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
	useState,
} from 'react'
import {
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	View,
	useWindowDimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

// === Theme plumbing =========================================================

type Styles = ReturnType<typeof makeStyles>
type ThemeValue = { palette: LabPalette; styles: Styles; mutedIconTone: 'muted' | 'inverse' }

const ThemeCtx = createContext<ThemeValue | null>(null)

function useTheme(): ThemeValue {
	const value = useContext(ThemeCtx)
	if (!value) throw new Error('Lab theme context missing')
	return value
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

	const hasWorkspace = genomes.length > 0 || assays.length > 0 || unknowns.length > 0
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
				setSelectedGenomeId((current) => current ?? genome.id)
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

	const openPicker = useCallback(() => {
		if (Platform.OS !== 'web') return
		const input = document.createElement('input')
		input.type = 'file'
		input.multiple = true
		input.style.display = 'none'
		input.onchange = () => {
			const files = Array.from(input.files ?? [])
			ingestMany(files)
			document.body.removeChild(input)
		}
		document.body.appendChild(input)
		input.click()
	}, [ingestMany])

	const reset = useCallback(() => {
		setGenomes([])
		setAssays([])
		setUnknowns([])
		setSelectedGenomeId(null)
		setSelectedAssayId(null)
		setRun({ status: 'idle' })
	}, [])

	const removeGenome = useCallback((id: string) => {
		setGenomes((prev) => prev.filter((g) => g.id !== id))
		setSelectedGenomeId((curr) => (curr === id ? null : curr))
	}, [])

	const removeAssay = useCallback((id: string) => {
		setAssays((prev) => prev.filter((a) => a.id !== id))
		setSelectedAssayId((curr) => (curr === id ? null : curr))
	}, [])

	const removeUnknown = useCallback((id: string) => {
		setUnknowns((prev) => prev.filter((u) => u.id !== id))
	}, [])

	const selectedGenome = useMemo(
		() => genomes.find((g) => g.id === selectedGenomeId) ?? null,
		[genomes, selectedGenomeId],
	)
	const selectedAssay = useMemo(
		() => assays.find((a) => a.id === selectedAssayId) ?? null,
		[assays, selectedAssayId],
	)

	const runDisabledReason = useMemo(
		() => getLabRunDisabledReason(selectedGenome, selectedAssay),
		[selectedGenome, selectedAssay],
	)
	const runBlocked = runDisabledReason !== null || run.status === 'running'

	const executeRun = useCallback(async () => {
		if (!selectedGenome || !selectedAssay) return
		setRun({ status: 'running' })
		trackEvent('lab_run_started', {
			assayLanguage: selectedAssay.language,
			assaySource: selectedAssay.source ? 'remote' : 'local',
			genomeKind: selectedGenome.kind,
		})
		try {
			const success = await runLabAssay(selectedGenome, selectedAssay)
			setRun(success.result)
			trackEvent('lab_run_completed', {
				assayLanguage: selectedAssay.language,
				genomeKind: selectedGenome.kind,
				resultKind: success.kind,
			})
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err)
			setRun({ status: 'error', error: message })
			trackEvent('lab_run_failed', {
				assayLanguage: selectedAssay.language,
				genomeKind: selectedGenome.kind,
				error: message,
			})
		}
	}, [selectedAssay, selectedGenome, trackEvent])

	return (
		<ThemeCtx.Provider value={themeValue}>
			<SafeAreaView style={styles.safe} edges={['top']}>
				{dragActive ? (
					<View style={styles.dragOverlay} pointerEvents="none">
						<View style={styles.dragOverlayCard}>
							<OMIcon name="cloud-upload-outline" tone="accent" size={48} />
							<OMText variant="h3" style={styles.dragOverlayTitle}>
								Drop files to add
							</OMText>
							<OMText variant="body" style={styles.dragOverlayBody}>
								Genomes, indexes, and assay scripts are sorted automatically.
							</OMText>
						</View>
					</View>
				) : null}

				<ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
					<PageHeader
						showActions={hasWorkspace}
						onAdd={openPicker}
						onReset={reset}
					/>

					{showRemoteAssayPrompt && requestedAssayUrl ? (
						<LinkBanner
							kicker="Assay shared with you"
							title="Load this assay into the lab?"
							body="We’ll fetch the script so you can run it against your own files — nothing leaves your browser."
							meta={tryGetHostPath(requestedAssayUrl)}
							loading={remoteAssayLoading}
							error={remoteAssayLoadError}
							primaryLabel="Load assay"
							onPrimary={() => void loadRequestedAssay()}
							onDismiss={() => setDismissedAssayUrl(requestedAssayUrl)}
						/>
					) : null}

					{showExamplePrompt && requestedExample ? (
						<LinkBanner
							kicker="Sample shared with you"
							title={`Load ${requestedExample.title}?`}
							body={requestedExample.description}
							meta={`${requestedExample.inputKindLabel} · ${requestedExample.assayLabel}`}
							loading={samplePresetLoadingId === requestedExample.id}
							error={samplePresetError}
							primaryLabel="Load sample"
							onPrimary={() => void loadSamplePreset(requestedExample)}
							onDismiss={() => setDismissedExampleId(requestedExample.id)}
						/>
					) : null}

					{!hasWorkspace ? (
						<>
							<EmptyIntro />
							<Hero onChoose={openPicker} active={dragActive} />
							<SamplesRow
								loadingId={samplePresetLoadingId}
								error={samplePresetError}
								onLoad={(preset) => void loadSamplePreset(preset)}
								isWide={isWide}
							/>
							<HowItWorks />
							<PrivacyNote />
						</>
					) : (
						<>
							<CompactDropBar onChoose={openPicker} active={dragActive} />

							{genomes.length > 0 ? (
								<WorkspaceGroup
									title="Source files"
									subtitle={
										genomes.length > 1
											? 'Tap a source to select which one to run.'
											: 'Drop companion files (.crai, .fa, .fa.fai, .tbi) if anything is missing.'
									}
								>
									<View style={styles.stack}>
										{genomes.map((g) => (
											<GenomeRow
												key={g.id}
												genome={g}
												selected={g.id === selectedGenomeId}
												onSelect={() => setSelectedGenomeId(g.id)}
												onRemove={() => removeGenome(g.id)}
											/>
										))}
									</View>
								</WorkspaceGroup>
							) : null}

							{assays.length > 0 ? (
								<WorkspaceGroup
									title="Assays"
									subtitle={
										assays.length > 1
											? 'Tap an assay to select which one to run.'
											: 'The loaded plan. Drop another .py or .yaml to swap.'
									}
								>
									<View style={styles.stack}>
										{assays.map((a) => (
											<AssayRow
												key={a.id}
												assay={a}
												selected={a.id === selectedAssayId}
												onSelect={() => setSelectedAssayId(a.id)}
												onRemove={() => removeAssay(a.id)}
											/>
										))}
									</View>
								</WorkspaceGroup>
							) : null}

							{unknowns.length > 0 ? (
								<WorkspaceGroup
									title="Unrecognised"
									subtitle="These files couldn’t be sorted — remove them or drop something supported."
								>
									<View style={styles.stack}>
										{unknowns.map((u) => (
											<UnknownRow
												key={u.id}
												entry={u}
												onRemove={() => removeUnknown(u.id)}
											/>
										))}
									</View>
								</WorkspaceGroup>
							) : null}

							<RunBar
								disabled={runBlocked}
								running={run.status === 'running'}
								reason={runDisabledReason}
								assayName={selectedAssay?.name ?? null}
								onRun={() => void executeRun()}
							/>

							{run.status === 'error' && run.error ? (
								<ErrorBlock error={run.error} />
							) : null}

							{run.status === 'done' && run.observations ? (
								<ResultsBlock
									durationMs={run.durationMs ?? 0}
									observations={run.observations}
								/>
							) : null}

							{run.status === 'done' && run.textOutput !== undefined ? (
								<TextResultsBlock
									durationMs={run.durationMs ?? 0}
									text={run.textOutput}
								/>
							) : null}
						</>
					)}
				</ScrollView>
			</SafeAreaView>
		</ThemeCtx.Provider>
	)
}

// === Page chrome ===========================================================

function PageHeader({
	onAdd,
	onReset,
	showActions,
}: {
	onAdd: () => void
	onReset: () => void
	showActions: boolean
}) {
	const { styles } = useTheme()
	return (
		<View style={styles.pageHeader}>
			<View style={styles.brand}>
				<View style={styles.brandDot} />
				<OMText variant="subtitle" style={styles.brandText}>
					BIOVAULT LAB
				</OMText>
			</View>
			{showActions ? (
				<View style={styles.headerActions}>
					<HeaderButton icon="add-outline" label="Add files" onPress={onAdd} />
					<HeaderButton icon="refresh-outline" label="Start over" onPress={onReset} />
				</View>
			) : null}
		</View>
	)
}

function HeaderButton({
	icon,
	label,
	onPress,
}: {
	icon: React.ComponentProps<typeof OMIcon>['name']
	label: string
	onPress: () => void
}) {
	const { styles, mutedIconTone } = useTheme()
	return (
		<Pressable onPress={onPress} style={styles.headerButton}>
			<OMIcon name={icon} tone={mutedIconTone} size={16} />
			<OMText variant="subtitle" style={styles.headerButtonText}>
				{label}
			</OMText>
		</Pressable>
	)
}

function EmptyIntro() {
	const { styles } = useTheme()
	return (
		<View style={styles.introBlock}>
			<OMText variant="h3" style={styles.introTitle}>
				Run genetic assays on your files.
			</OMText>
			<OMText variant="body" style={styles.introBody}>
				Drop a VCF, CRAM, or 23andMe-style text export. Pick an assay. Get results in
				seconds — all in your browser, nothing uploaded.
			</OMText>
		</View>
	)
}

// === Drop zones ============================================================

function Hero({ active, onChoose }: { active: boolean; onChoose: () => void }) {
	const { styles } = useTheme()
	return (
		<Pressable onPress={onChoose} style={[styles.hero, active ? styles.heroActive : null]}>
			<View style={styles.heroIconWrap}>
				<OMIcon name="cloud-upload-outline" tone="accent" size={40} />
			</View>
			<OMText variant="headline" style={styles.heroTitle}>
				Drop files here or click to choose
			</OMText>
			<OMText variant="body" style={styles.heroBody}>
				.vcf.gz · .cram · .zip · 23andMe-style .txt · .py / .yaml assays
			</OMText>
			<View style={styles.heroButton}>
				<OMText variant="subtitle" style={styles.heroButtonText}>
					Choose files
				</OMText>
			</View>
			<OMText variant="caption" style={styles.heroFooter}>
				Companion files like .crai, .fa, .fa.fai, and .tbi are paired automatically.
			</OMText>
		</Pressable>
	)
}

function CompactDropBar({ active, onChoose }: { active: boolean; onChoose: () => void }) {
	const { styles } = useTheme()
	return (
		<Pressable
			onPress={onChoose}
			style={[styles.compactDrop, active ? styles.compactDropActive : null]}
		>
			<OMIcon name="add-outline" tone="accent" size={20} />
			<OMText variant="body" style={styles.compactDropText}>
				Drop more files or click to add
			</OMText>
			<OMText variant="caption" style={styles.compactDropHint}>
				.cram · .vcf.gz · .txt · .py · .yaml
			</OMText>
		</Pressable>
	)
}

// === Deep-link banner ======================================================

function LinkBanner({
	body,
	error,
	kicker,
	loading,
	meta,
	onDismiss,
	onPrimary,
	primaryLabel,
	title,
}: {
	body: string
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
		<View style={styles.banner}>
			<View style={styles.bannerCopy}>
				<OMText variant="caption" style={styles.bannerKicker}>
					{kicker.toUpperCase()}
				</OMText>
				<OMText variant="headline" style={styles.bannerTitle}>
					{title}
				</OMText>
				<OMText variant="body" style={styles.bannerBody}>
					{body}
				</OMText>
				<OMText variant="caption" style={styles.bannerMeta}>
					{meta}
				</OMText>
				{error ? (
					<OMText variant="caption" style={styles.bannerError}>
						{error}
					</OMText>
				) : null}
			</View>
			<View style={styles.bannerActions}>
				<Pressable onPress={onDismiss} style={styles.secondaryButton}>
					<OMText variant="subtitle" style={styles.secondaryText}>
						Not now
					</OMText>
				</Pressable>
				<Pressable
					onPress={onPrimary}
					disabled={loading}
					style={[styles.primaryButton, loading ? styles.primaryButtonDisabled : null]}
				>
					<OMText variant="subtitle" style={styles.primaryButtonText}>
						{loading ? 'Loading…' : primaryLabel}
					</OMText>
				</Pressable>
			</View>
		</View>
	)
}

// === Samples ===============================================================

function SamplesRow({
	error,
	isWide,
	loadingId,
	onLoad,
}: {
	error: string | null
	isWide: boolean
	loadingId: string | null
	onLoad: (preset: LabSamplePreset) => void
}) {
	const { styles } = useTheme()
	return (
		<View style={styles.section}>
			<View style={styles.sectionHead}>
				<OMText variant="headline" style={styles.sectionTitle}>
					Or try a sample
				</OMText>
				<OMText variant="body" style={styles.sectionSubtitle}>
					No files? Load a demo genome + assay to see the whole flow.
				</OMText>
			</View>
			<View style={[styles.samplesGrid, isWide ? styles.samplesGridWide : null]}>
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
				<OMText variant="caption" style={styles.sectionError}>
					{error}
				</OMText>
			) : null}
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
					{loading ? 'Loading…' : 'Load sample →'}
				</OMText>
			</View>
		</Pressable>
	)
}

// === Workspace =============================================================

function WorkspaceGroup({
	children,
	subtitle,
	title,
}: {
	children: ReactNode
	subtitle: string
	title: string
}) {
	const { styles } = useTheme()
	return (
		<View style={styles.section}>
			<View style={styles.sectionHead}>
				<OMText variant="headline" style={styles.sectionTitle}>
					{title}
				</OMText>
				<OMText variant="body" style={styles.sectionSubtitle}>
					{subtitle}
				</OMText>
			</View>
			{children}
		</View>
	)
}

function GenomeRow({
	genome,
	onRemove,
	onSelect,
	selected,
}: {
	genome: Genome
	onRemove: () => void
	onSelect: () => void
	selected: boolean
}) {
	const { styles, mutedIconTone } = useTheme()
	const complete = isGenomeComplete(genome)
	const missing = missingGenomeSlots(genome)

	return (
		<Pressable onPress={onSelect} style={[styles.assetRow, selected ? styles.assetRowSelected : null]}>
			<View style={styles.assetRowHeader}>
				<View style={styles.assetIcon}>
					<OMIcon name="document-text-outline" tone="accent" size={18} />
				</View>
				<View style={styles.assetText}>
					<OMText variant="headline" style={styles.assetTitle}>
						{genomeDisplayName(genome)}
					</OMText>
					<OMText variant="caption" style={styles.assetMeta}>
						{genomeKindLabel(genome)} · {humanLabSize(genomeBytesTotal(genome))}
					</OMText>
				</View>
				<StatusBadge ok={complete} label={complete ? 'Ready' : 'Needs files'} />
				<IconButton onPress={onRemove} icon="close-outline" />
			</View>

			{genome.kind === 'cram' ? (
				<View style={styles.slotGrid}>
					<SlotChip label=".cram" file={genome.primary} />
					<SlotChip label=".cram.crai" file={genome.crai} />
					<SlotChip label=".fa" file={genome.fasta} />
					<SlotChip label=".fa.fai" file={genome.fai} />
				</View>
			) : null}

			{genome.kind === 'vcf' ? (
				<View style={styles.slotGrid}>
					<SlotChip label=".vcf.gz" file={genome.primary} />
					<SlotChip label=".vcf.gz.tbi" file={genome.tbi} />
				</View>
			) : null}

			{missing.length > 0 ? (
				<View style={styles.missingBar}>
					<OMIcon name="alert-circle-outline" tone={mutedIconTone} size={14} />
					<OMText variant="caption" style={styles.missingText}>
						Drop to complete: {missing.join(' · ')}
					</OMText>
				</View>
			) : null}
		</Pressable>
	)
}

function AssayRow({
	assay,
	onRemove,
	onSelect,
	selected,
}: {
	assay: Assay
	onRemove: () => void
	onSelect: () => void
	selected: boolean
}) {
	const { styles } = useTheme()
	return (
		<Pressable onPress={onSelect} style={[styles.assetRow, selected ? styles.assetRowSelected : null]}>
			<View style={styles.assetRowHeader}>
				<View style={styles.assetIcon}>
					<OMIcon name="flask-outline" tone="accent" size={18} />
				</View>
				<View style={styles.assetText}>
					<OMText variant="headline" style={styles.assetTitle}>
						{assay.name}
					</OMText>
					<OMText variant="caption" style={styles.assetMeta}>
						{assay.language === 'python' ? 'Python assay' : 'YAML assay'} ·{' '}
						{humanLabSize(assay.file.size)} · {assay.source ? 'remote' : 'local'}
					</OMText>
				</View>
				<IconButton onPress={onRemove} icon="close-outline" />
			</View>
		</Pressable>
	)
}

function UnknownRow({ entry, onRemove }: { entry: UnknownEntry; onRemove: () => void }) {
	const { styles, mutedIconTone } = useTheme()
	return (
		<View style={styles.unknownRow}>
			<View style={styles.assetIcon}>
				<OMIcon name="help-circle-outline" tone={mutedIconTone} size={18} />
			</View>
			<View style={styles.assetText}>
				<OMText variant="body" style={styles.assetTitle}>
					{entry.file.name}
				</OMText>
				<OMText variant="caption" style={styles.assetMeta}>
					Unsupported format
				</OMText>
			</View>
			<IconButton onPress={onRemove} icon="close-outline" />
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

function StatusBadge({ label, ok }: { label: string; ok: boolean }) {
	const { styles } = useTheme()
	return (
		<View style={[styles.statusBadge, ok ? styles.statusBadgeOk : styles.statusBadgeBad]}>
			<OMText
				variant="caption"
				style={ok ? styles.statusBadgeTextOk : styles.statusBadgeTextBad}
			>
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

function IconButton({
	icon,
	onPress,
}: {
	icon: React.ComponentProps<typeof OMIcon>['name']
	onPress: () => void
}) {
	const { styles, mutedIconTone } = useTheme()
	return (
		<Pressable onPress={onPress} style={styles.iconButton}>
			<OMIcon name={icon} tone={mutedIconTone} size={16} />
		</Pressable>
	)
}

// === Run + results =========================================================

function RunBar({
	assayName,
	disabled,
	onRun,
	reason,
	running,
}: {
	assayName: string | null
	disabled: boolean
	onRun: () => void
	reason: string | null
	running: boolean
}) {
	const { styles, mutedIconTone } = useTheme()
	return (
		<View style={styles.runBlock}>
			<Pressable
				onPress={onRun}
				disabled={disabled}
				style={[styles.runButton, disabled ? styles.runButtonDisabled : null]}
			>
				{running ? null : <OMIcon name="play" tone="inverse" size={18} />}
				<OMText variant="headline" style={styles.runButtonText}>
					{running ? 'Running…' : assayName ? `Run ${assayName}` : 'Run assay'}
				</OMText>
			</Pressable>
			{reason ? (
				<View style={styles.runHint}>
					<OMIcon name="information-circle-outline" tone={mutedIconTone} size={14} />
					<OMText variant="caption" style={styles.runHintText}>
						{reason}
					</OMText>
				</View>
			) : null}
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

function ResultsBlock({
	durationMs,
	observations,
}: {
	durationMs: number
	observations: VariantObservation[]
}) {
	const { styles } = useTheme()
	return (
		<View style={styles.section}>
			<View style={styles.sectionHead}>
				<OMText variant="headline" style={styles.sectionTitle}>
					Results
				</OMText>
				<OMText variant="body" style={styles.sectionSubtitle}>
					{observations.length} variant{observations.length === 1 ? '' : 's'} · {durationMs} ms
				</OMText>
			</View>
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
					<OMText variant="headline" style={styles.obsGenotypeValue}>
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
		<View style={styles.section}>
			<View style={styles.sectionHead}>
				<OMText variant="headline" style={styles.sectionTitle}>
					Output
				</OMText>
				<OMText variant="body" style={styles.sectionSubtitle}>
					{durationMs} ms
				</OMText>
			</View>
			{text ? (
				<View style={styles.preBlock}>
					<OMText variant="body" style={styles.preText}>
						{text}
					</OMText>
				</View>
			) : (
				<OMText variant="body" style={styles.sectionSubtitle}>
					(no output produced)
				</OMText>
			)}
		</View>
	)
}

// === Explainers ============================================================

function HowItWorks() {
	const { styles } = useTheme()
	return (
		<View style={styles.section}>
			<View style={styles.sectionHead}>
				<OMText variant="headline" style={styles.sectionTitle}>
					How it works
				</OMText>
			</View>
			<View style={styles.steps}>
				<Step
					number="1"
					title="Drop your files"
					body="Your genome (.cram, .vcf.gz, or 23andMe text) plus an assay (.py or .yaml)."
				/>
				<Step
					number="2"
					title="Run locally"
					body="Bioscript runs in the browser via WebAssembly — no server, no uploads."
				/>
				<Step
					number="3"
					title="Read results"
					body="See called variants, genotypes, and assay output inline."
				/>
			</View>
		</View>
	)
}

function Step({ body, number, title }: { body: string; number: string; title: string }) {
	const { styles } = useTheme()
	return (
		<View style={styles.step}>
			<View style={styles.stepNumber}>
				<OMText variant="subtitle" style={styles.stepNumberText}>
					{number}
				</OMText>
			</View>
			<OMText variant="headline" style={styles.stepTitle}>
				{title}
			</OMText>
			<OMText variant="body" style={styles.stepBody}>
				{body}
			</OMText>
		</View>
	)
}

function PrivacyNote() {
	const { styles, mutedIconTone } = useTheme()
	return (
		<View style={styles.privacyNote}>
			<OMIcon name="lock-closed-outline" tone={mutedIconTone} size={16} />
			<OMText variant="caption" style={styles.privacyText}>
				All processing happens locally in your browser. Files never leave your device.
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
			gap: omSpacing.xxl,
			maxWidth: 880,
			width: '100%',
			alignSelf: 'center',
		},

		pageHeader: {
			flexDirection: 'row',
			alignItems: 'center',
			justifyContent: 'space-between',
			gap: omSpacing.m,
			flexWrap: 'wrap',
		},
		brand: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: omSpacing.s,
		},
		brandDot: {
			width: 10,
			height: 10,
			borderRadius: 5,
			backgroundColor: p.accent,
		},
		brandText: { color: p.textFaint, letterSpacing: 1.2 },
		headerActions: {
			flexDirection: 'row',
			gap: omSpacing.s,
		},
		headerButton: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: omSpacing.xs,
			paddingHorizontal: omSpacing.m,
			paddingVertical: omSpacing.s,
			borderRadius: omRadius.full,
			backgroundColor: p.surface,
			borderWidth: 1,
			borderColor: p.border,
		},
		headerButtonText: { color: p.textMuted },

		introBlock: {
			gap: omSpacing.s,
			paddingTop: omSpacing.l,
		},
		introTitle: { color: p.text, maxWidth: 640, lineHeight: 44 },
		introBody: { color: p.textMuted, maxWidth: 620 },

		hero: {
			paddingVertical: omSpacing.xxxl,
			paddingHorizontal: omSpacing.xl,
			borderRadius: omRadius.l,
			borderWidth: 2,
			borderStyle: 'dashed',
			borderColor: p.accentBorder,
			backgroundColor: p.accentTint,
			alignItems: 'center',
			gap: omSpacing.m,
		},
		heroActive: {
			borderColor: p.accent,
			backgroundColor: p.accentSoft,
		},
		heroIconWrap: {
			width: 72,
			height: 72,
			borderRadius: 36,
			alignItems: 'center',
			justifyContent: 'center',
			backgroundColor: p.accentSoft,
			marginBottom: omSpacing.xs,
		},
		heroTitle: { color: p.text, textAlign: 'center' },
		heroBody: { color: p.textMuted, textAlign: 'center' },
		heroButton: {
			marginTop: omSpacing.s,
			paddingHorizontal: omSpacing.xl,
			paddingVertical: omSpacing.m,
			borderRadius: omRadius.full,
			backgroundColor: p.accent,
		},
		heroButtonText: { color: p.invertText },
		heroFooter: { color: p.textFaint, marginTop: omSpacing.s, textAlign: 'center' },

		compactDrop: {
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
		compactDropActive: {
			borderColor: p.accent,
			backgroundColor: p.accentSoft,
		},
		compactDropText: { color: p.text, flex: 1 },
		compactDropHint: { color: p.textFaint },

		banner: {
			padding: omSpacing.xl,
			borderRadius: omRadius.l,
			backgroundColor: p.accentSoft,
			borderWidth: 1,
			borderColor: p.accentBorder,
			gap: omSpacing.l,
		},
		bannerCopy: { gap: omSpacing.xs },
		bannerKicker: { color: p.accentStrong, letterSpacing: 1.2 },
		bannerTitle: { color: p.text },
		bannerBody: { color: p.textMuted },
		bannerMeta: { color: p.accentStrong, marginTop: omSpacing.xs },
		bannerError: { color: p.dangerText, marginTop: omSpacing.xs },
		bannerActions: {
			flexDirection: 'row',
			flexWrap: 'wrap',
			gap: omSpacing.s,
		},

		section: { gap: omSpacing.m },
		sectionHead: { gap: omSpacing.xs / 2 },
		sectionTitle: { color: p.text },
		sectionSubtitle: { color: p.textMuted },
		sectionError: { color: p.dangerText },

		samplesGrid: {
			gap: omSpacing.m,
		},
		samplesGridWide: {
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
		sampleCta: {
			marginTop: omSpacing.s,
		},
		sampleCtaText: { color: p.accentStrong },

		stack: { gap: omSpacing.s },

		assetRow: {
			padding: omSpacing.l,
			borderRadius: omRadius.l,
			backgroundColor: p.surface,
			borderWidth: 1,
			borderColor: p.border,
			gap: omSpacing.m,
		},
		assetRowSelected: {
			borderColor: p.accentBorder,
			backgroundColor: p.accentSoft,
		},
		assetRowHeader: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: omSpacing.m,
		},
		assetIcon: {
			width: 36,
			height: 36,
			borderRadius: 10,
			alignItems: 'center',
			justifyContent: 'center',
			backgroundColor: p.accentSoft,
		},
		assetText: { flex: 1, gap: 2 },
		assetTitle: { color: p.text },
		assetMeta: { color: p.textMuted },

		unknownRow: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: omSpacing.m,
			padding: omSpacing.l,
			borderRadius: omRadius.l,
			backgroundColor: p.warningBg,
			borderWidth: 1,
			borderColor: p.warningBorder,
		},

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

		statusBadge: {
			paddingHorizontal: omSpacing.m,
			paddingVertical: 4,
			borderRadius: omRadius.full,
		},
		statusBadgeOk: { backgroundColor: p.accentSoft },
		statusBadgeBad: { backgroundColor: p.warningBg },
		statusBadgeTextOk: { color: p.accentStrong },
		statusBadgeTextBad: { color: p.warningText },

		metaChip: {
			paddingHorizontal: omSpacing.m,
			paddingVertical: 4,
			borderRadius: omRadius.full,
			backgroundColor: p.surfaceSunken,
		},
		metaChipText: { color: p.textMuted },

		iconButton: {
			width: 32,
			height: 32,
			borderRadius: 16,
			alignItems: 'center',
			justifyContent: 'center',
			backgroundColor: p.surfaceSunken,
		},

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

		runBlock: {
			alignItems: 'center',
			gap: omSpacing.s,
			paddingVertical: omSpacing.s,
		},
		runButton: {
			flexDirection: 'row',
			alignItems: 'center',
			justifyContent: 'center',
			gap: omSpacing.s,
			paddingHorizontal: omSpacing.xxxl,
			paddingVertical: omSpacing.l,
			borderRadius: omRadius.full,
			backgroundColor: p.accent,
			minWidth: 240,
		},
		runButtonDisabled: { opacity: 0.4 },
		runButtonText: { color: p.invertText },
		runHint: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: omSpacing.xs,
		},
		runHintText: { color: p.textMuted },

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

		obsCard: {
			padding: omSpacing.l,
			borderRadius: omRadius.l,
			backgroundColor: p.surface,
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

		steps: {
			flexDirection: 'row',
			flexWrap: 'wrap',
			gap: omSpacing.m,
		},
		step: {
			flex: 1,
			minWidth: 220,
			padding: omSpacing.l,
			borderRadius: omRadius.l,
			backgroundColor: p.surface,
			borderWidth: 1,
			borderColor: p.border,
			gap: omSpacing.xs,
		},
		stepNumber: {
			width: 28,
			height: 28,
			borderRadius: 14,
			alignItems: 'center',
			justifyContent: 'center',
			backgroundColor: p.accentSoft,
			marginBottom: omSpacing.xs,
		},
		stepNumberText: { color: p.accentStrong },
		stepTitle: { color: p.text },
		stepBody: { color: p.textMuted },

		privacyNote: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: omSpacing.s,
			padding: omSpacing.m,
			borderRadius: omRadius.m,
			backgroundColor: p.surface,
			borderWidth: 1,
			borderColor: p.border,
		},
		privacyText: { color: p.textMuted, flex: 1 },

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
			backgroundColor: p.surface,
			borderWidth: 1,
			borderColor: p.borderStrong,
		},
		secondaryText: { color: p.textMuted },

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
