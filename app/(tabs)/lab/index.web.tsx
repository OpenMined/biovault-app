import { OMIcon } from '@/components/ui/OMIcon'
import { OMText } from '@/components/ui/OMText'
import { PlatformSvgUri } from '@/components/ui/PlatformSvgUri'
import { useAnalytics } from '@/hooks/useAnalytics'
import { toggleColorSchemePreferenceSync, useColorScheme } from '@/lib/color-theme'
import { isBioscriptAvailable, warmupBioscriptRuntime } from '@/modules/expo-bioscript'
import {
	ASSAY_CATEGORY_LABELS,
	ASSAY_INPUT_FORMAT_LABELS,
	type AssayCategory,
	type AssayInputFormat,
	getAssayById,
	type LabAssay,
	LAB_TEST_FILES,
	type LabTestFileBundle,
	listAssayCategories,
	loadAssayFile,
	loadTestFileBundle,
	searchAssays,
} from '@/lib/lab/assay-catalog'
import { normalizeLabSearchParam } from '@/lib/lab/assay-loader'
import {
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
	getLabRunDisabledReasonFor,
	runLabAssay,
} from '@/lib/lab/runner'
import type { Genome, RunResult, UnknownEntry } from '@/lib/lab/types'
import { BrandFonts } from '@/lib/brand-typography'
import type { VariantObservation } from '@/modules/expo-bioscript'
import { omRadius, omSpacing } from '@/styles/brand'
import { labPalettes, type LabPalette } from '@/styles/lab-theme'
import { Asset } from 'expo-asset'
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
	TextInput,
	View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

// === Theme context =========================================================

type Styles = ReturnType<typeof makeStyles>
type ThemeValue = { palette: LabPalette; styles: Styles; mutedIconTone: 'muted' | 'inverse' }

const ThemeCtx = createContext<ThemeValue | null>(null)
const microscopeIconUri = Asset.fromModule(require('../../../assets/images/microscope.svg')).uri

function useTheme(): ThemeValue {
	const v = useContext(ThemeCtx)
	if (!v) throw new Error('Lab theme context missing')
	return v
}

// === Domain types ==========================================================

type RunRecord = {
	id: string
	assay: LabAssay
	startedAt: number
	result: RunResult
}

function genomeKindToFormat(genome: Genome): AssayInputFormat {
	switch (genome.kind) {
		case 'cram':
			return 'cram'
		case 'vcf':
			return 'vcf_gz'
		case 'text':
			return 'genotype_text'
		case 'zip':
			return 'zip'
	}
}

function isAssayCompatible(assay: LabAssay, genome: Genome): boolean {
	return assay.inputFormats.includes(genomeKindToFormat(genome))
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

	const params = useLocalSearchParams<{ run?: string | string[] }>()
	const { trackEvent } = useAnalytics({ includeRouteParams: false })

	const [genomes, setGenomes] = useState<Genome[]>([])
	const [unknowns, setUnknowns] = useState<UnknownEntry[]>([])
	const [selectedGenomeId, setSelectedGenomeId] = useState<string | null>(null)
	const [runs, setRuns] = useState<RunRecord[]>([])
	const [runningAssayId, setRunningAssayId] = useState<string | null>(null)
	const [dragActive, setDragActive] = useState(false)
	const [query, setQuery] = useState('')
	const [category, setCategory] = useState<AssayCategory | null>(null)
	const [sampleLoadingId, setSampleLoadingId] = useState<string | null>(null)
	const [sampleLoadError, setSampleLoadError] = useState<string | null>(null)

	const activeGenome = useMemo(
		() => genomes.find((g) => g.id === selectedGenomeId) ?? genomes[genomes.length - 1] ?? null,
		[genomes, selectedGenomeId],
	)

	const ingest = useCallback((file: File) => {
		const kind = classifyLabFile(file.name)
		if (kind === 'unknown') {
			setUnknowns((prev) => [...prev, createUnknownEntry(file)])
			return
		}
		// .py/.yaml dropped without a catalog context — ignore or note. For now,
		// classify as unknown so the user sees we didn't use it. Future: accept
		// as an ad-hoc assay to run once.
		if (kind === 'assay_python' || kind === 'assay_yaml') {
			setUnknowns((prev) => [...prev, createUnknownEntry(file)])
			return
		}
		if (kind === 'cram' || kind === 'vcf_gz' || kind === 'genotype_text' || kind === 'zip') {
			const genome = createGenomeFromPrimaryFile(file, kind)
			setGenomes((prev) => [...prev, genome])
			setSelectedGenomeId(genome.id)
			return
		}
		setGenomes((prev) => pairCompanionFile(prev, file, kind))
	}, [])

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

	useEffect(() => {
		if (Platform.OS !== 'web') return
		if (!isBioscriptAvailable()) return

		let cancelled = false
		const warm = () => {
			void warmupBioscriptRuntime().catch(() => {
				// Ignore warmup failures and fall back to on-demand startup during the first run.
			})
		}

		if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
			const idleId = window.requestIdleCallback(() => {
				if (!cancelled) warm()
			})
			return () => {
				cancelled = true
				window.cancelIdleCallback(idleId)
			}
		}

		const timeoutId = window.setTimeout(() => {
			if (!cancelled) warm()
		}, 0)
		return () => {
			cancelled = true
			window.clearTimeout(timeoutId)
		}
	}, [])

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

	const clearGenome = useCallback(() => {
		setGenomes([])
		setSelectedGenomeId(null)
		setUnknowns([])
		setRuns([])
	}, [])

	const removeUnknown = useCallback((id: string) => {
		setUnknowns((prev) => prev.filter((u) => u.id !== id))
	}, [])

	const pickSample = useCallback(
		async (bundle: LabTestFileBundle) => {
			setSampleLoadingId(bundle.id)
			setSampleLoadError(null)
			trackEvent('lab_sample_genome_requested', { bundleId: bundle.id })
			try {
				const files = await loadTestFileBundle(bundle)
				ingestMany(files)
				trackEvent('lab_sample_genome_loaded', { bundleId: bundle.id, totalFiles: files.length })
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err)
				setSampleLoadError(msg)
				trackEvent('lab_sample_genome_failed', { bundleId: bundle.id, error: msg })
			} finally {
				setSampleLoadingId(null)
			}
		},
		[ingestMany, trackEvent],
	)

	const runAssay = useCallback(
		async (catalogAssay: LabAssay) => {
			if (!activeGenome || !isGenomeComplete(activeGenome)) return
			if (runningAssayId) return
			if (!isAssayCompatible(catalogAssay, activeGenome)) return

			try {
				const file = await loadAssayFile(catalogAssay)
				const loaded = createAssayFromFile(file, catalogAssay.language, catalogAssay.url)

				setRunningAssayId(catalogAssay.id)
				const runId = `run-${Date.now()}-${Math.floor(Math.random() * 1000)}`
				setRuns((prev) => [
					{ id: runId, assay: catalogAssay, startedAt: Date.now(), result: { status: 'running' } },
					...prev,
				])
				trackEvent('lab_run_started', {
					assayId: catalogAssay.id,
					assayLanguage: catalogAssay.language,
					genomeKind: activeGenome.kind,
				})

				const success = await runLabAssay(activeGenome, loaded)
				setRuns((prev) =>
					prev.map((r) => (r.id === runId ? { ...r, result: success.result } : r)),
				)
				trackEvent('lab_run_completed', {
					assayId: catalogAssay.id,
					genomeKind: activeGenome.kind,
					resultKind: success.kind,
				})
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err)
				setRuns((prev) => {
					const existingRunning = prev.find((r) => r.assay.id === catalogAssay.id && r.result.status === 'running')
					if (!existingRunning) return prev
					return prev.map((r) =>
						r.id === existingRunning.id ? { ...r, result: { status: 'error', error: msg } } : r,
					)
				})
				trackEvent('lab_run_failed', {
					assayId: catalogAssay.id,
					genomeKind: activeGenome.kind,
					error: msg,
				})
			} finally {
				setRunningAssayId(null)
			}
		},
		[activeGenome, runningAssayId, trackEvent],
	)

	// Auto-run from `?run=<assayId>` once genome is ready — consumed only once.
	const pendingAutoRunRef = useRef<string | null>(normalizeLabSearchParam(params.run))
	useEffect(() => {
		const id = pendingAutoRunRef.current
		if (!id) return
		if (!activeGenome || !isGenomeComplete(activeGenome)) return
		if (runningAssayId) return
		const assay = getAssayById(id)
		if (!assay) {
			pendingAutoRunRef.current = null
			return
		}
		if (!isAssayCompatible(assay, activeGenome)) return
		pendingAutoRunRef.current = null
		void runAssay(assay)
	}, [activeGenome, runningAssayId, runAssay])

	// Auto-scroll to latest run when it starts / completes
	const scrollRef = useRef<ScrollView>(null)
	const runsYRef = useRef<number>(0)
	const prevRunsCountRef = useRef<number>(0)
	useEffect(() => {
		if (runs.length > prevRunsCountRef.current) {
			prevRunsCountRef.current = runs.length
			requestAnimationFrame(() => {
				scrollRef.current?.scrollTo({
					y: Math.max(0, runsYRef.current - 24),
					animated: true,
				})
			})
		} else {
			prevRunsCountRef.current = runs.length
		}
	}, [runs.length])

	const categories = useMemo(() => listAssayCategories(), [])
	const searchResults = useMemo(() => searchAssays(query, category), [query, category])
	const latestRun = runs[0] ?? null
	const previousRuns = runs.slice(1)

	return (
		<ThemeCtx.Provider value={themeValue}>
			<SafeAreaView style={styles.safe} edges={['top']}>
				{dragActive ? <DragOverlay /> : null}

				<ScrollView
					ref={scrollRef}
					style={styles.scroll}
					contentContainerStyle={styles.content}
				>
					<View style={styles.headerRow}>
						<OMText variant="caption" style={styles.brandMark}>
							BIOVAULT LAB
						</OMText>
						<WebThemeToggle scheme={scheme} />
					</View>

					<DropZone
						compact={Boolean(activeGenome)}
						dragActive={dragActive}
						onChoose={openPicker}
					/>

					{activeGenome ? (
						<GenomeCard genome={activeGenome} onClear={clearGenome} />
					) : (
						<SampleGenomeList
							bundles={LAB_TEST_FILES}
							loadingId={sampleLoadingId}
							error={sampleLoadError}
							onPick={pickSample}
						/>
					)}

					{unknowns.length > 0 ? (
						<UnknownFilesNote unknowns={unknowns} onRemove={removeUnknown} />
					) : null}

					{activeGenome ? (
						<AssayPicker
							genome={activeGenome}
							query={query}
							onQueryChange={setQuery}
							category={category}
							onCategoryChange={setCategory}
							categories={categories}
							results={searchResults}
							runningAssayId={runningAssayId}
							onRun={runAssay}
						/>
					) : null}

					<View
						style={styles.runsAnchor}
						onLayout={(e) => {
							runsYRef.current = e.nativeEvent.layout.y
						}}
					>
						{latestRun ? (
							<View style={styles.resultSection}>
								<OMText variant="caption" style={styles.sectionKicker}>
									LATEST RESULT
								</OMText>
								<RunCard record={latestRun} />
							</View>
						) : null}
						{previousRuns.length > 0 ? (
							<View style={styles.resultSection}>
								<OMText variant="caption" style={styles.sectionKicker}>
									RECENT RUNS
								</OMText>
								<View style={styles.stack}>
									{previousRuns.map((r) => (
										<RunCard key={r.id} record={r} />
									))}
								</View>
							</View>
						) : null}
					</View>

					<PrivacyFootnote />
				</ScrollView>
			</SafeAreaView>
		</ThemeCtx.Provider>
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
	const { styles, palette } = useTheme()
	if (compact) {
		return (
			<Pressable
				onPress={onChoose}
				style={[styles.dropBar, dragActive ? styles.dropBarActive : null]}
			>
				<OMIcon name="add-outline" tone="accent" size={18} />
				<OMText variant="body" style={styles.dropBarText}>
					Drop a different genome
				</OMText>
				<OMText variant="caption" style={styles.dropBarHint}>
					.cram · .vcf.gz · .txt · .zip
				</OMText>
			</Pressable>
		)
	}
	return (
		<Pressable
			onPress={onChoose}
			style={[styles.dropZone, dragActive ? styles.dropZoneActive : null]}
		>
			<PlatformSvgUri uri={microscopeIconUri} width={40} height={40} color={palette.accentStrong} />
			<OMText variant="h3" style={styles.dropZoneTitle}>
				Drop a genome
			</OMText>
			<OMText variant="body" style={styles.dropZoneBody}>
				Runs locally. Nothing is uploaded.
			</OMText>
			<OMText variant="caption" style={styles.dropZoneStat}>
				An mpileup on a 17 GB CRAM takes about 1.3 seconds.
			</OMText>
			<View style={styles.dropZoneButton}>
				<OMText variant="subtitle" style={styles.primaryButtonText}>
					Choose files
				</OMText>
			</View>
			<OMText variant="caption" style={styles.dropZoneHint}>
				.cram · .vcf.gz · .zip · 23andMe-style .txt. Companion files (.crai, .fa, .fa.fai, .tbi) are paired automatically.
			</OMText>
		</Pressable>
	)
}

// === Genome card ===========================================================

function GenomeCard({ genome, onClear }: { genome: Genome; onClear: () => void }) {
	const { styles, mutedIconTone } = useTheme()
	const complete = isGenomeComplete(genome)
	const missing = missingGenomeSlots(genome)
	const readiness = complete ? 'Genome complete' : `Missing ${missing.join(' · ')}`
	return (
		<View style={[styles.loadedRow, complete ? styles.loadedRowOk : styles.loadedRowWarn]}>
			<View style={styles.loadedRowHead}>
				<View style={styles.loadedRowIcon}>
					<OMIcon name="document-text-outline" tone="accent" size={18} />
				</View>
				<View style={styles.loadedRowText}>
					<OMText variant="caption" style={styles.loadedRowKicker}>
						LOADED GENOME
					</OMText>
					<OMText variant="headline" style={styles.loadedRowTitle}>
						{genomeDisplayName(genome)}
					</OMText>
					<OMText variant="caption" style={styles.loadedRowMeta}>
						{genomeKindLabel(genome)} · {humanLabSize(genomeBytesTotal(genome))}
					</OMText>
					<OMText
						variant="caption"
						style={complete ? styles.loadedRowStatusOk : styles.loadedRowStatusWarn}
					>
						{readiness}
					</OMText>
				</View>
				<Pressable onPress={onClear} style={styles.removeButton}>
					<OMIcon name="close-outline" tone={mutedIconTone} size={14} />
					<OMText variant="subtitle" style={styles.removeButtonText}>
						Swap
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

// === Sample genomes (empty state) ==========================================

function SampleGenomeList({
	bundles,
	error,
	loadingId,
	onPick,
}: {
	bundles: LabTestFileBundle[]
	error: string | null
	loadingId: string | null
	onPick: (bundle: LabTestFileBundle) => void
}) {
	const { styles } = useTheme()
	return (
		<View style={styles.pickerSection}>
			<OMText variant="caption" style={styles.pickerKicker}>
				NO FILE? USE A SAMPLE GENOME
			</OMText>
			<View style={styles.pickerList}>
				{bundles.map((bundle) => {
					const loading = loadingId === bundle.id
					return (
						<Pressable
							key={bundle.id}
							onPress={() => onPick(bundle)}
							disabled={loading}
							style={[styles.pickerRow, loading ? styles.pickerRowDisabled : null]}
						>
							<View style={styles.pickerIcon}>
								<OMIcon name="document-text-outline" tone="accent" size={16} />
							</View>
							<View style={styles.pickerText}>
								<OMText variant="body" style={styles.pickerTitle}>
									{bundle.title}
								</OMText>
								<OMText variant="caption" style={styles.pickerMeta}>
									{ASSAY_INPUT_FORMAT_LABELS[bundle.format]} · {bundle.description}
								</OMText>
							</View>
							<View style={loading ? styles.pickerActionMuted : styles.pickerAction}>
								<OMText
									variant="subtitle"
									style={loading ? styles.pickerActionMutedText : styles.pickerActionText}
								>
									{loading ? 'Loading…' : 'Use sample'}
								</OMText>
							</View>
						</Pressable>
					)
				})}
			</View>
			{error ? (
				<OMText variant="caption" style={styles.errorInline}>
					{error}
				</OMText>
			) : null}
		</View>
	)
}

// === Assay picker ==========================================================

function AssayPicker({
	categories,
	category,
	genome,
	onCategoryChange,
	onQueryChange,
	onRun,
	query,
	results,
	runningAssayId,
}: {
	categories: AssayCategory[]
	category: AssayCategory | null
	genome: Genome
	onCategoryChange: (c: AssayCategory | null) => void
	onQueryChange: (q: string) => void
	onRun: (assay: LabAssay) => void
	query: string
	results: LabAssay[]
	runningAssayId: string | null
}) {
	const { palette, styles } = useTheme()
	const anyRunning = Boolean(runningAssayId)

	return (
		<View style={styles.pickerSection}>
			<OMText variant="caption" style={styles.pickerKicker}>
				CHOOSE AN ASSAY
			</OMText>
			<OMText variant="caption" style={styles.pickerIntro}>
				{isGenomeComplete(genome)
					? 'Pick an assay to run on this genome.'
					: `Complete this genome first: ${missingGenomeSlots(genome).join(' · ')}`}
			</OMText>

			<View style={styles.searchBox}>
				<OMIcon name="search-outline" tone="muted" size={16} />
				<TextInput
					value={query}
					onChangeText={onQueryChange}
					placeholder="Search assays…"
					placeholderTextColor={palette.textFaint}
					style={styles.searchInput}
					returnKeyType="search"
				/>
				{query ? (
					<Pressable onPress={() => onQueryChange('')} style={styles.clearBtn}>
						<OMIcon name="close-circle" tone="muted" size={16} />
					</Pressable>
				) : null}
			</View>

			{categories.length > 1 ? (
				<View style={styles.chipRow}>
					<CategoryChip
						label="All"
						active={category === null}
						onPress={() => onCategoryChange(null)}
					/>
					{categories.map((c) => (
						<CategoryChip
							key={c}
							label={ASSAY_CATEGORY_LABELS[c]}
							active={category === c}
							onPress={() => onCategoryChange(category === c ? null : c)}
						/>
					))}
				</View>
			) : null}

			{results.length === 0 ? (
				<OMText variant="caption" style={styles.mutedHint}>
					No assays match this search. Try clearing filters or search text.
				</OMText>
			) : (
				<View style={styles.pickerList}>
					{results.map((assay) => {
						const compatible = isAssayCompatible(assay, genome)
						const disabledReason = compatible
							? getLabRunDisabledReasonFor(genome, assay.language)
							: 'Assay is not compatible with this genome format.'
						const isRunning = runningAssayId === assay.id
						const disabled = anyRunning || !compatible
						return (
							<Pressable
								key={assay.id}
								onPress={() => onRun(assay)}
								disabled={disabled}
								style={[
									styles.pickerRow,
									!compatible ? styles.pickerRowIncompatible : null,
									disabled && !isRunning ? styles.pickerRowDisabled : null,
								]}
							>
								<View style={styles.pickerIcon}>
									<OMIcon name="flask-outline" tone="accent" size={16} />
								</View>
								<View style={styles.pickerText}>
									<OMText variant="body" style={styles.pickerTitle}>
										{assay.title}
									</OMText>
									<OMText variant="caption" style={styles.pickerMeta} numberOfLines={1}>
										{ASSAY_CATEGORY_LABELS[assay.category]} ·{' '}
										{assay.inputFormats.map((f) => ASSAY_INPUT_FORMAT_LABELS[f]).join(' / ')}
										{disabledReason ? ` · ${disabledReason}` : ''}
									</OMText>
								</View>
								{isRunning ? (
									<View style={styles.pickerActionRunning}>
										<ActivityIndicator size="small" color={palette.accent} />
										<OMText variant="subtitle" style={styles.pickerActionRunningText}>
											Running…
										</OMText>
									</View>
								) : (
									<View style={compatible ? styles.pickerAction : styles.pickerActionMuted}>
										<OMText
											variant="subtitle"
											style={compatible ? styles.pickerActionText : styles.pickerActionMutedText}
										>
											{compatible ? 'Run assay' : 'Unavailable'}
										</OMText>
									</View>
								)}
							</Pressable>
						)
					})}
				</View>
			)}
		</View>
	)
}

function CategoryChip({
	active,
	label,
	onPress,
}: {
	active: boolean
	label: string
	onPress: () => void
}) {
	const { styles } = useTheme()
	return (
		<Pressable onPress={onPress} style={[styles.chip, active ? styles.chipActive : null]}>
			<OMText variant="caption" style={active ? styles.chipTextActive : styles.chipText}>
				{label}
			</OMText>
		</Pressable>
	)
}

// === Run card ==============================================================

function RunCard({ record }: { record: RunRecord }) {
	const { palette, styles } = useTheme()
	const { assay, result } = record
	return (
		<View style={styles.runCard}>
			<View style={styles.runCardHead}>
				<View style={styles.runCardIcon}>
					<OMIcon name="flask-outline" tone="accent" size={16} />
				</View>
				<View style={{ flex: 1, gap: 2 }}>
					<OMText variant="caption" style={styles.runCardKicker}>
						{ASSAY_CATEGORY_LABELS[assay.category].toUpperCase()}
					</OMText>
					<OMText variant="headline" style={styles.runCardTitle}>
						{assay.title}
					</OMText>
					{result.status === 'done' && result.durationMs !== undefined ? (
						<OMText variant="caption" style={styles.runCardMeta}>
							{result.durationMs} ms
							{result.observations ? ` · ${result.observations.length} variant${result.observations.length === 1 ? '' : 's'}` : ''}
						</OMText>
					) : null}
				</View>
				{result.status === 'running' ? (
					<ActivityIndicator size="small" color={palette.accent} />
				) : null}
			</View>

			{result.status === 'running' ? (
				<OMText variant="caption" style={styles.runCardHint}>
					Running locally in your browser.
				</OMText>
			) : null}

			{result.status === 'done' && result.observations ? (
				<View style={styles.stack}>
					{result.observations.map((obs) => (
						<ObservationCard key={obs.name} obs={obs} />
					))}
				</View>
			) : null}

			{result.status === 'done' && result.textOutput !== undefined ? (
				result.textOutput ? (
					<View style={styles.preBlock}>
						<OMText variant="body" style={styles.preText}>
							{result.textOutput}
						</OMText>
					</View>
				) : (
					<OMText variant="caption" style={styles.runCardHint}>
						No output produced.
					</OMText>
				)
			) : null}

			{result.status === 'error' && result.error ? (
				<View style={styles.errorInlineBlock}>
					<OMIcon name="alert-circle-outline" tone="danger" size={14} />
					<OMText variant="caption" style={styles.errorInline}>
						{result.error}
					</OMText>
				</View>
			) : null}
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

// === Unknown files note =====================================================

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
					Couldn’t use {unknowns.length} file{unknowns.length === 1 ? '' : 's'}
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

// === Footer + overlay ======================================================

function PrivacyFootnote() {
	const { styles, mutedIconTone } = useTheme()
	return (
		<View style={styles.footerNote}>
			<OMIcon name="lock-closed-outline" tone={mutedIconTone} size={14} />
			<OMText variant="caption" style={styles.footerNoteText}>
				Everything runs locally.
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
					Genomes, indexes, and companion files are sorted automatically.
				</OMText>
			</View>
		</View>
	)
}

function WebThemeToggle({ scheme }: { scheme: 'light' | 'dark' }) {
	const { styles } = useTheme()
	const { icon, label } =
		scheme === 'light'
			? { icon: 'sunny-outline' as const, label: 'Light' }
			: { icon: 'moon-outline' as const, label: 'Dark' }

	return (
		<Pressable
			onPress={() => toggleColorSchemePreferenceSync(scheme)}
			hitSlop={8}
			style={[styles.webThemeButton, scheme === 'light' ? styles.webThemeButtonLight : styles.webThemeButtonDark]}
			accessibilityRole="button"
			accessibilityLabel={`Color theme: ${label}. Tap to toggle.`}
		>
			<View pointerEvents="none" style={styles.webThemeButtonIcon}>
				<OMIcon name={icon} size={16} tone="accent" />
			</View>
			<View pointerEvents="none">
				<OMText
					variant="caption"
					style={[
						styles.webThemeButtonText,
						scheme === 'light' ? styles.webThemeButtonTextLight : styles.webThemeButtonTextDark,
					]}
				>
					{label}
				</OMText>
			</View>
		</Pressable>
	)
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
			gap: omSpacing.m,
		},
		stack: { gap: omSpacing.s },
		headerRow: {
			flexDirection: 'row',
			alignItems: 'center',
			justifyContent: 'space-between',
			gap: omSpacing.m,
		},

		brandMark: {
			color: p.accentStrong,
			letterSpacing: 1.4,
			flexShrink: 1,
		},
		webThemeButton: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: 6,
			height: 40,
			paddingHorizontal: 14,
			borderRadius: omRadius.full,
			borderWidth: 1,
			cursor: 'pointer',
			userSelect: 'none',
			WebkitTapHighlightColor: 'transparent',
		},
		webThemeButtonIcon: { justifyContent: 'center' },
		webThemeButtonLight: {
			backgroundColor: 'rgba(252,252,253,0.92)',
			borderColor: 'rgba(83,190,169,0.32)',
		},
		webThemeButtonDark: {
			backgroundColor: 'rgba(23,22,29,0.84)',
			borderColor: 'rgba(83,190,169,0.24)',
		},
		webThemeButtonText: {},
		webThemeButtonTextLight: {
			color: '#17161d',
		},
		webThemeButtonTextDark: {
			color: p.text,
		},

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
		dropZoneActive: { borderColor: p.accent, backgroundColor: p.accentSoft },
		dropZoneTitle: { color: p.text, textAlign: 'center' },
		dropZoneBody: { color: p.text, textAlign: 'center' },
		dropZoneStat: { color: p.textMuted, textAlign: 'center' },
		dropZoneButton: {
			marginTop: omSpacing.s,
			paddingHorizontal: omSpacing.xl,
			paddingVertical: omSpacing.m,
			borderRadius: omRadius.full,
			backgroundColor: p.accent,
			borderWidth: 1,
			borderColor: p.accentBorder,
		},
		dropZoneHint: {
			color: p.textFaint,
			textAlign: 'center',
			marginTop: omSpacing.s,
			maxWidth: 420,
		},
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

		// genome card
		loadedRow: {
			paddingHorizontal: omSpacing.l,
			paddingVertical: omSpacing.m,
			borderRadius: omRadius.l,
			backgroundColor: p.surface,
			borderWidth: 1,
			borderColor: p.border,
			gap: omSpacing.s,
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
			alignItems: 'flex-start',
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
		loadedRowText: { flex: 1, gap: 1 },
		loadedRowKicker: { color: p.accentStrong, letterSpacing: 1.2 },
		loadedRowTitle: { color: p.text },
		loadedRowMeta: { color: p.textMuted },
		loadedRowStatusOk: { color: p.accentStrong },
		loadedRowStatusWarn: { color: p.warningText },

		removeButton: {
			flexDirection: 'row',
			alignItems: 'center',
			alignSelf: 'flex-start',
			gap: omSpacing.xs,
			paddingHorizontal: omSpacing.m,
			paddingVertical: 10,
			borderRadius: omRadius.full,
			backgroundColor: p.surfaceRaised,
			borderWidth: 1,
			borderColor: p.borderStrong,
		},
		removeButtonText: { color: p.textMuted },

		// slots
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

		// picker sections (sample genomes + assays)
		pickerSection: { gap: omSpacing.m, marginTop: omSpacing.m },
		pickerKicker: { color: p.textFaint, letterSpacing: 1.4 },
		pickerIntro: { color: p.textMuted },
		pickerList: { gap: omSpacing.s },
		pickerRow: {
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
		pickerRowDisabled: { opacity: 0.5 },
		pickerRowIncompatible: { opacity: 0.6 },
		pickerIcon: {
			width: 32,
			height: 32,
			borderRadius: 8,
			alignItems: 'center',
			justifyContent: 'center',
			backgroundColor: p.accentSoft,
		},
		pickerText: { flex: 1, gap: 2 },
		pickerTitle: { color: p.text },
		pickerMeta: { color: p.textMuted },
		pickerAction: {
			paddingHorizontal: omSpacing.m,
			paddingVertical: omSpacing.s,
			borderRadius: omRadius.full,
			backgroundColor: p.accent,
		},
		pickerActionMuted: {
			paddingHorizontal: omSpacing.m,
			paddingVertical: omSpacing.s,
			borderRadius: omRadius.full,
			backgroundColor: p.surfaceRaised,
			borderWidth: 1,
			borderColor: p.border,
		},
		pickerActionText: { color: p.invertText },
		pickerActionMutedText: { color: p.textFaint },
		pickerActionRunning: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: omSpacing.xs,
			paddingHorizontal: omSpacing.s,
		},
		pickerActionRunningText: { color: p.accentStrong },

		// search
		searchBox: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: omSpacing.s,
			paddingHorizontal: omSpacing.l,
			paddingVertical: omSpacing.m,
			borderRadius: omRadius.full,
			backgroundColor: p.surface,
			borderWidth: 1,
			borderColor: p.border,
		},
		searchInput: {
			flex: 1,
			color: p.text,
			fontSize: 15,
			fontFamily: BrandFonts.body,
			outlineStyle: 'none',
		} as object,
		clearBtn: { padding: 2 },
		chipRow: {
			flexDirection: 'row',
			flexWrap: 'wrap',
			gap: omSpacing.xs,
		},
		chip: {
			paddingHorizontal: omSpacing.m,
			paddingVertical: omSpacing.xs,
			borderRadius: omRadius.full,
			backgroundColor: p.surface,
			borderWidth: 1,
			borderColor: p.border,
		},
		chipActive: {
			backgroundColor: p.accentSoft,
			borderColor: p.accentBorder,
		},
		chipText: { color: p.textMuted },
		chipTextActive: { color: p.accentStrong },
		mutedHint: { color: p.textFaint, paddingHorizontal: omSpacing.s },

		// runs history
		runsAnchor: { gap: omSpacing.m, marginTop: omSpacing.m },
		resultSection: { gap: omSpacing.s },
		sectionKicker: { color: p.textFaint, letterSpacing: 1.4 },
		runCard: {
			padding: omSpacing.l,
			borderRadius: omRadius.l,
			backgroundColor: p.surface,
			borderWidth: 1,
			borderColor: p.accentBorder,
			gap: omSpacing.m,
		},
		runCardHead: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: omSpacing.m,
		},
		runCardIcon: {
			width: 32,
			height: 32,
			borderRadius: 8,
			alignItems: 'center',
			justifyContent: 'center',
			backgroundColor: p.accentSoft,
		},
		runCardKicker: { color: p.accentStrong, letterSpacing: 1.4 },
		runCardTitle: { color: p.text },
		runCardMeta: { color: p.textMuted },
		runCardHint: { color: p.textFaint },

		// observations
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

		// error inline inside run card
		errorInlineBlock: {
			flexDirection: 'row',
			gap: omSpacing.xs,
			alignItems: 'flex-start',
			paddingHorizontal: omSpacing.m,
			paddingVertical: omSpacing.s,
			borderRadius: omRadius.m,
			backgroundColor: p.dangerBg,
			borderWidth: 1,
			borderColor: p.dangerBorder,
		},
		errorInline: { color: p.dangerText, flex: 1 },

		// buttons / text
		primaryButtonText: { color: p.invertText },
		textButton: {
			paddingHorizontal: omSpacing.m,
			paddingVertical: omSpacing.s,
			borderRadius: omRadius.full,
		},
		textButtonText: { color: p.accentStrong },

		// unknowns
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
			justifyContent: 'center',
			gap: omSpacing.xs,
			marginTop: omSpacing.l,
		},
		footerNoteText: { color: p.textFaint, textAlign: 'center' },

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
