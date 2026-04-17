import { OMText } from '@/components/ui/OMText'
import { useAnalytics } from '@/hooks/useAnalytics'
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
import { LAB_SAMPLE_PRESETS, loadLabSamplePresetFiles, type LabSamplePreset } from '@/lib/lab/sample-data'
import { getLabRunDisabledReason, runLabAssay } from '@/lib/lab/runner'
import type {
	Assay,
	Genome,
	RunResult,
	UnknownEntry,
} from '@/lib/lab/types'
import { omColors, omRadius, omSpacing, omTheme } from '@/styles/brand'
import type { VariantObservation } from '@/modules/expo-bioscript'
import { useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
// Unified Bioscript lab — drop any mix of genomic files + assay scripts, pick
// a genome and an assay, and run. Heavy parsing happens inside the
// bioscript-wasm Web Worker (CRAM / VCF variant lookups) or Monty's
// WASI runtime (genotype-text + Python/YAML assays).

// ts-prune-ignore-next
export default function LabScreen() {
	const params = useLocalSearchParams<{ assay?: string | string[] }>()
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
	const [samplePresetError, setSamplePresetError] = useState<string | null>(null)

	const requestedAssayUrl = normalizeLabSearchParam(params.assay)
	const hasRequestedAssayLoaded = useMemo(
		() => assays.some((assay) => assay.source === requestedAssayUrl),
		[assays, requestedAssayUrl],
	)
	const showRemoteAssayPrompt =
		Boolean(requestedAssayUrl) &&
		requestedAssayUrl !== dismissedAssayUrl &&
		!hasRequestedAssayLoaded

	const addAssay = useCallback(
		(file: File, language: Assay['language'], source?: string) => {
			const assay = createAssayFromFile(file, language, source)
			setAssays((prev) => appendAssay(prev, assay))
			setSelectedAssayId(assay.id)
			return assay
		},
		[],
	)

	const ingest = useCallback((file: File) => {
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
	}, [addAssay])

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
			trackEvent('lab_remote_assay_load_failed', {
				error: message,
			})
		} finally {
			setRemoteAssayLoading(false)
		}
	}, [addAssay, requestedAssayUrl, trackEvent])

	const loadSamplePreset = useCallback(async (preset: LabSamplePreset) => {
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
	}, [ingestMany, trackEvent])

	useEffect(() => {
		if (Platform.OS !== 'web') return
		let depth = 0
		const hasFiles = (e: DragEvent) =>
			Array.from(e.dataTransfer?.types ?? []).includes('Files')
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
			const files = Array.from(e.dataTransfer?.files ?? [])
			ingestMany(files)
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
		[selectedAssay, selectedGenome],
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
			setRun({
				status: 'error',
				error: message,
			})
			trackEvent('lab_run_failed', {
				assayLanguage: selectedAssay.language,
				genomeKind: selectedGenome.kind,
				error: message,
			})
		}
	}, [selectedAssay, selectedGenome, trackEvent])

	// === Render ==============================================================

	return (
		<SafeAreaView style={styles.safe} edges={['top']}>
			{Platform.OS === 'web' && dragActive ? (
				<View style={styles.dragOverlay} pointerEvents="none">
					<OMText variant="h3" style={styles.dragOverlayTitle}>
						Drop to add to lab
					</OMText>
					<OMText variant="body" style={styles.dragOverlayBody}>
						We&rsquo;ll sort genomes, indexes, and assays automatically.
					</OMText>
				</View>
			) : null}

			<ScrollView contentContainerStyle={styles.content}>
				{showRemoteAssayPrompt && requestedAssayUrl ? (
					<RemoteAssayPrompt
						error={remoteAssayLoadError}
						loading={remoteAssayLoading}
						url={requestedAssayUrl}
						onDismiss={() => setDismissedAssayUrl(requestedAssayUrl)}
						onLoad={() => void loadRequestedAssay()}
					/>
				) : null}

				<HeroDrop
					onClick={openPicker}
					active={dragActive}
					genomeCount={genomes.length}
					assayCount={assays.length}
				/>

				<View style={styles.section}>
					<SectionHeader label="Try sample data" count={LAB_SAMPLE_PRESETS.length} />
					<View style={styles.cardGrid}>
						{LAB_SAMPLE_PRESETS.map((preset) => (
							<SamplePresetCard
								key={preset.id}
								preset={preset}
								error={samplePresetError}
								loading={samplePresetLoadingId === preset.id}
								onLoad={() => void loadSamplePreset(preset)}
							/>
						))}
					</View>
				</View>

				{genomes.length > 0 ? (
					<View style={styles.section}>
						<SectionHeader label="Genomes" count={genomes.length} />
						<View style={styles.cardGrid}>
							{genomes.map((g) => (
								<GenomeCard
									key={g.id}
									genome={g}
									selected={g.id === selectedGenomeId}
									onSelect={() => setSelectedGenomeId(g.id)}
									onRemove={() => removeGenome(g.id)}
								/>
							))}
						</View>
					</View>
				) : null}

				{assays.length > 0 ? (
					<View style={styles.section}>
						<SectionHeader label="Assays" count={assays.length} />
						<View style={styles.cardGrid}>
							{assays.map((a) => (
								<AssayCard
									key={a.id}
									assay={a}
									selected={a.id === selectedAssayId}
									onSelect={() => setSelectedAssayId(a.id)}
									onRemove={() => removeAssay(a.id)}
								/>
							))}
						</View>
					</View>
				) : null}

				{unknowns.length > 0 ? (
					<View style={styles.section}>
						<SectionHeader label="Unrecognised" count={unknowns.length} />
						<View style={styles.unknownBox}>
							{unknowns.map((u) => (
								<View key={u.id} style={styles.unknownRow}>
									<OMText variant="body" style={styles.unknownName}>
										{u.file.name}
									</OMText>
									<Pressable onPress={() => removeUnknown(u.id)} style={styles.secondaryButton}>
										<OMText variant="subtitle" style={styles.secondaryText}>
											Remove
										</OMText>
									</Pressable>
								</View>
							))}
						</View>
					</View>
				) : null}

				{genomes.length > 0 || assays.length > 0 ? (
					<View style={styles.runBar}>
						<View style={{ flex: 1 }}>
							<OMText variant="caption" style={styles.runSummaryLabel}>
								READY TO RUN
							</OMText>
							<OMText variant="body" style={styles.runSummaryText}>
								{selectedGenome
									? `Genome: ${genomeDisplayName(selectedGenome)}`
									: 'No genome picked'}
								{selectedAssay ? ` · Assay: ${selectedAssay.name}` : ' · No assay picked'}
							</OMText>
							{runDisabledReason ? (
								<OMText variant="caption" style={styles.runHint}>
									{runDisabledReason}
								</OMText>
							) : null}
						</View>
						<Pressable
							onPress={() => void executeRun()}
							disabled={runBlocked}
							style={[styles.runButton, runBlocked ? styles.runButtonDisabled : null]}
						>
							<OMText variant="subtitle" style={styles.runButtonText}>
								{run.status === 'running' ? 'Running…' : 'Run'}
							</OMText>
						</Pressable>
					</View>
				) : null}

				{run.status === 'error' && run.error ? (
					<View style={styles.errorCard}>
						<OMText variant="subtitle" style={styles.errorTitle}>
							Run failed
						</OMText>
						<OMText variant="body" style={styles.errorBody}>
							{run.error}
						</OMText>
					</View>
				) : null}

				{run.status === 'done' && run.observations ? (
					<ResultsCard
						durationMs={run.durationMs ?? 0}
						observations={run.observations}
					/>
				) : null}

				{run.status === 'done' && run.textOutput !== undefined ? (
					<TextOutputCard durationMs={run.durationMs ?? 0} text={run.textOutput} />
				) : null}

				{genomes.length > 0 || assays.length > 0 ? (
					<Pressable onPress={reset} style={styles.resetButton}>
						<OMText variant="subtitle" style={styles.secondaryText}>
							Clear everything
						</OMText>
					</Pressable>
				) : null}
			</ScrollView>
		</SafeAreaView>
	)
}

// === Sub-components =========================================================

function HeroDrop({
	onClick,
	active,
	genomeCount,
	assayCount,
}: {
	onClick: () => void
	active: boolean
	genomeCount: number
	assayCount: number
}) {
	return (
		<Pressable
			onPress={onClick}
			style={[styles.hero, active ? styles.heroActive : null]}
		>
			<OMText variant="h3" style={styles.heroTitle}>
				Drag and drop files
			</OMText>
			<OMText variant="body" style={styles.heroBody}>
				23andMe exports · .txt / .csv / .tsv · .zip · .vcf / .vcf.gz · .cram
			</OMText>
			<OMText variant="caption" style={styles.heroSubBody}>
				We&rsquo;ll auto-pair indexes (.crai, .tbi) and references (.fa/.fa.fai). Drop .py
				or .yaml assays to use as the variant plan. Click here to pick files too.
			</OMText>
			{genomeCount === 0 && assayCount === 0 ? (
				<OMText variant="caption" style={styles.heroEmpty}>
					Nothing loaded yet.
				</OMText>
			) : (
				<OMText variant="caption" style={styles.heroFill}>
					{genomeCount} genome{genomeCount === 1 ? '' : 's'} · {assayCount} assay
					{assayCount === 1 ? '' : 's'}
				</OMText>
			)}
		</Pressable>
	)
}

function RemoteAssayPrompt({
	error,
	loading,
	url,
	onDismiss,
	onLoad,
}: {
	error: string | null
	loading: boolean
	url: string
	onDismiss: () => void
	onLoad: () => void
}) {
	let host = url
	try {
		const parsed = new URL(url)
		host = `${parsed.hostname}${parsed.pathname}`
	} catch {}

	return (
		<View style={styles.remoteAssayCard}>
			<View style={{ flex: 1, gap: omSpacing.xs }}>
				<OMText variant="caption" style={styles.sectionLabel}>
					LINKED ASSAY
				</OMText>
				<OMText variant="subtitle" style={styles.remoteAssayTitle}>
					Load assay from URL?
				</OMText>
				<OMText variant="body" style={styles.remoteAssayBody}>
					This link requested a remote assay. Load it into the lab, then drop genome files to run it.
				</OMText>
				<OMText variant="caption" style={styles.remoteAssayUrl}>
					{host}
				</OMText>
				{error ? (
					<OMText variant="caption" style={styles.remoteAssayError}>
						{error}
					</OMText>
				) : null}
			</View>
			<View style={styles.remoteAssayActions}>
				<Pressable onPress={onDismiss} style={styles.secondaryButton}>
					<OMText variant="subtitle" style={styles.secondaryText}>
						Not now
					</OMText>
				</Pressable>
				<Pressable
					onPress={onLoad}
					disabled={loading}
					style={[styles.runButton, loading ? styles.runButtonDisabled : null]}
				>
					<OMText variant="subtitle" style={styles.runButtonText}>
						{loading ? 'Loading…' : 'Load assay'}
					</OMText>
				</Pressable>
			</View>
		</View>
	)
}

function SamplePresetCard({
	error,
	loading,
	onLoad,
	preset,
}: {
	error: string | null
	loading: boolean
	onLoad: () => void
	preset: LabSamplePreset
}) {
	return (
		<View style={styles.card}>
			<View style={styles.sampleHeader}>
				<View style={{ flex: 1, gap: omSpacing.xs }}>
					<OMText variant="caption" style={styles.sectionLabel}>
						SAMPLE DATA
					</OMText>
					<OMText variant="subtitle" style={styles.cardTitle}>
						{preset.title}
					</OMText>
				</View>
			</View>
			<OMText variant="body" style={styles.sampleBody}>
				{preset.description}
			</OMText>
			<OMText variant="caption" style={styles.sampleMeta}>
				Genome: {preset.genomeLabel} · Assay: {preset.assayLabel}
			</OMText>
			{error ? (
				<OMText variant="caption" style={styles.remoteAssayError}>
					{error}
				</OMText>
			) : null}
			<Pressable
				onPress={onLoad}
				disabled={loading}
				style={[styles.runButton, loading ? styles.runButtonDisabled : null, styles.sampleButton]}
			>
				<OMText variant="subtitle" style={styles.runButtonText}>
					{loading ? 'Loading…' : 'Load sample'}
				</OMText>
			</Pressable>
		</View>
	)
}

function SectionHeader({ label, count }: { label: string; count: number }) {
	return (
		<View style={styles.sectionHeader}>
			<OMText variant="subtitle" style={styles.sectionTitle}>
				{label}
			</OMText>
			<OMText variant="caption" style={styles.sectionCount}>
				· {count}
			</OMText>
		</View>
	)
}

function GenomeCard({
	genome,
	selected,
	onSelect,
	onRemove,
}: {
	genome: Genome
	selected: boolean
	onSelect: () => void
	onRemove: () => void
}) {
	const complete = isGenomeComplete(genome)
	const missing = missingGenomeSlots(genome)
	return (
		<Pressable
			onPress={onSelect}
			style={[styles.card, selected ? styles.cardSelected : null]}
		>
			<View style={styles.cardHeader}>
				<View style={styles.cardTitleRow}>
					<OMText variant="subtitle" style={styles.cardTitle}>
						{selected ? '● ' : '○ '}
						{genomeDisplayName(genome)}
					</OMText>
					<StatusPill ok={complete} />
				</View>
				<Pressable onPress={onRemove} style={styles.removeCorner}>
					<OMText variant="caption" style={styles.removeText}>
						✕
					</OMText>
				</Pressable>
			</View>
			<OMText variant="caption" style={styles.cardKind}>
				{genomeKindLabel(genome)} · {humanLabSize(genomeBytesTotal(genome))}
			</OMText>

			{genome.kind === 'cram' ? (
				<View style={styles.slotList}>
					<SlotRow label="CRAM alignment (.cram)" file={genome.primary} required />
					<SlotRow label="CRAM index (.cram.crai)" file={genome.crai} required />
					<SlotRow label="Reference FASTA (.fa / .fasta)" file={genome.fasta} required />
					<SlotRow label="FASTA index (.fa.fai)" file={genome.fai} required />
				</View>
			) : null}

			{genome.kind === 'vcf' ? (
				<View style={styles.slotList}>
					<SlotRow label="VCF bgzipped (.vcf.gz)" file={genome.primary} required />
					<SlotRow label="Tabix index (.vcf.gz.tbi)" file={genome.tbi} required />
				</View>
			) : null}

			{missing.length > 0 ? (
				<OMText variant="caption" style={styles.missing}>
					Drop: {missing.join(' · ')}
				</OMText>
			) : null}
		</Pressable>
	)
}

function SlotRow({
	label,
	file,
	required,
}: {
	label: string
	file?: File
	required?: boolean
}) {
	const filled = Boolean(file)
	return (
		<View style={styles.slotRow}>
			<View
				style={[
					styles.slotIcon,
					filled ? styles.slotIconOk : required ? styles.slotIconMissing : styles.slotIconIdle,
				]}
			>
				<OMText variant="caption" style={styles.slotIconText}>
					{filled ? '✓' : '…'}
				</OMText>
			</View>
			<View style={{ flex: 1 }}>
				<OMText variant="body" style={styles.slotLabel}>
					{label}
				</OMText>
				<OMText variant="caption" style={styles.slotName}>
					{file ? `${file.name} · ${humanLabSize(file.size)}` : 'drop it here'}
				</OMText>
			</View>
		</View>
	)
}

function StatusPill({ ok }: { ok: boolean }) {
	return (
		<View style={[styles.pill, ok ? styles.pillOk : styles.pillBad]}>
			<OMText variant="caption" style={ok ? styles.pillOkText : styles.pillBadText}>
				{ok ? 'complete' : 'needs files'}
			</OMText>
		</View>
	)
}

function AssayCard({
	assay,
	selected,
	onSelect,
	onRemove,
}: {
	assay: Assay
	selected: boolean
	onSelect: () => void
	onRemove: () => void
}) {
	return (
		<Pressable
			onPress={onSelect}
			style={[styles.card, selected ? styles.cardSelected : null]}
		>
			<View style={styles.cardHeader}>
				<OMText variant="subtitle" style={styles.cardTitle}>
					{selected ? '● ' : '○ '}
					{assay.name}
				</OMText>
				<Pressable onPress={onRemove} style={styles.removeCorner}>
					<OMText variant="caption" style={styles.removeText}>
						✕
					</OMText>
				</Pressable>
			</View>
			<OMText variant="caption" style={styles.cardKind}>
				{assay.language === 'python' ? 'Python assay' : 'YAML variant assay'} ·{' '}
				{humanLabSize(assay.file.size)}
			</OMText>
		</Pressable>
	)
}

function ResultsCard({
	durationMs,
	observations,
}: {
	durationMs: number
	observations: VariantObservation[]
}) {
	return (
		<View style={styles.resultsCard}>
			<OMText variant="caption" style={styles.sectionLabel}>
				RESULTS · {durationMs} ms · {observations.length} variant
				{observations.length === 1 ? '' : 's'}
			</OMText>
			{observations.map((obs) => (
				<View key={obs.name} style={styles.obsRow}>
					<OMText variant="subtitle" style={styles.obsTitle}>
						{obs.name}
					</OMText>
					<OMText variant="body" style={styles.obsBody}>
						backend: {obs.backend}
						{obs.matchedRsid ? ` · rsid: ${obs.matchedRsid}` : ''}
						{obs.assembly ? ` · ${obs.assembly.toUpperCase()}` : ''}
					</OMText>
					{obs.genotype ? (
						<OMText variant="body" style={styles.obsBody}>
							genotype: {obs.genotype}
							{obs.depth !== undefined ? ` · depth ${obs.depth}` : ''}
							{obs.refCount !== undefined ? ` · ref ${obs.refCount}` : ''}
							{obs.altCount !== undefined ? ` · alt ${obs.altCount}` : ''}
						</OMText>
					) : null}
					{obs.evidence.length > 0 ? (
						<OMText variant="caption" style={styles.obsEvidence}>
							{obs.evidence.join(' · ')}
						</OMText>
					) : null}
				</View>
			))}
		</View>
	)
}

function TextOutputCard({ durationMs, text }: { durationMs: number; text: string }) {
	return (
		<View style={styles.resultsCard}>
			<OMText variant="caption" style={styles.sectionLabel}>
				RESULTS · {durationMs} ms
			</OMText>
			{text ? (
				<View style={styles.preBlock}>
					<OMText variant="body" style={styles.preText}>
						{text}
					</OMText>
				</View>
			) : (
				<OMText variant="caption" style={styles.obsEvidence}>
					(no output produced)
				</OMText>
			)}
		</View>
	)
}

// === Styles =================================================================

const styles = StyleSheet.create({
	safe: { flex: 1, backgroundColor: omColors.grayscale850 },
	content: {
		padding: omSpacing.xl,
		// Extra top padding clears the NativeTabs pill which overlays the top
		// of the viewport on web (~60 px tall + its own margin). Without this
		// the dashed hero card tucks underneath the chrome on first load.
		paddingTop: 80,
		gap: omSpacing.xl,
		paddingBottom: omSpacing.xxxl,
		maxWidth: 960,
		alignSelf: 'center',
		width: '100%',
	},

	hero: {
		padding: omSpacing.xxl,
		borderRadius: omRadius.l,
		borderWidth: 3,
		borderStyle: 'dashed',
		borderColor: 'rgba(83,190,169,0.45)',
		backgroundColor: 'rgba(83,190,169,0.05)',
		alignItems: 'center',
		gap: omSpacing.m,
		minHeight: 220,
		justifyContent: 'center',
	},
	heroActive: {
		borderColor: omTheme.accent,
		backgroundColor: 'rgba(83,190,169,0.12)',
	},
	heroTitle: { color: omTheme.accent, textAlign: 'center' },
	heroBody: { color: omColors.grayscale00, textAlign: 'center' },
	heroSubBody: { color: omColors.grayscale300, textAlign: 'center', maxWidth: 640 },
	heroEmpty: { color: omColors.grayscale500 },
	heroFill: { color: omTheme.accent },

	section: { gap: omSpacing.m },
	remoteAssayCard: {
		padding: omSpacing.l,
		borderRadius: omRadius.l,
		backgroundColor: 'rgba(83,190,169,0.08)',
		borderWidth: 1,
		borderColor: 'rgba(83,190,169,0.3)',
		gap: omSpacing.m,
	},
	remoteAssayTitle: { color: omTheme.primaryText },
	remoteAssayBody: { color: omColors.grayscale300 },
	remoteAssayUrl: { color: omTheme.accent },
	remoteAssayError: { color: '#ffb2b2' },
	remoteAssayActions: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: omSpacing.s,
	},
	sampleHeader: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		justifyContent: 'space-between',
	},
	sampleBody: { color: omColors.grayscale300 },
	sampleMeta: { color: omColors.grayscale500, marginTop: omSpacing.xs },
	sampleButton: { alignSelf: 'flex-start', marginTop: omSpacing.s },
	sectionHeader: { flexDirection: 'row', alignItems: 'baseline', gap: omSpacing.s },
	sectionTitle: { color: omTheme.primaryText },
	sectionCount: { color: omColors.grayscale500 },
	sectionLabel: { color: omColors.grayscale500, letterSpacing: 0.8 },

	cardGrid: { gap: omSpacing.m },
	card: {
		padding: omSpacing.l,
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.1)',
		gap: omSpacing.s,
	},
	cardSelected: {
		borderColor: 'rgba(83,190,169,0.55)',
		backgroundColor: 'rgba(83,190,169,0.08)',
	},
	cardHeader: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		gap: omSpacing.m,
	},
	cardTitleRow: {
		flex: 1,
		flexDirection: 'row',
		alignItems: 'center',
		gap: omSpacing.s,
		flexWrap: 'wrap',
	},
	cardTitle: { color: omTheme.primaryText, flexShrink: 1 },
	cardKind: { color: omColors.grayscale400 },
	removeCorner: {
		paddingHorizontal: omSpacing.s,
		paddingVertical: omSpacing.xs,
		borderRadius: omRadius.full,
		backgroundColor: 'rgba(255,255,255,0.06)',
	},
	removeText: { color: omColors.grayscale400 },

	slotList: { gap: omSpacing.xs, marginTop: omSpacing.s },
	slotRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: omSpacing.m,
		padding: omSpacing.s,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(255,255,255,0.03)',
	},
	slotIcon: {
		width: 24,
		height: 24,
		borderRadius: 12,
		alignItems: 'center',
		justifyContent: 'center',
	},
	slotIconOk: { backgroundColor: 'rgba(83,190,169,0.18)' },
	slotIconMissing: { backgroundColor: 'rgba(255,200,80,0.18)' },
	slotIconIdle: { backgroundColor: 'rgba(255,255,255,0.08)' },
	slotIconText: { color: omColors.grayscale00 },
	slotLabel: { color: omTheme.primaryText },
	slotName: { color: omColors.grayscale500, marginTop: 2 },
	missing: { color: '#ffd36b', marginTop: omSpacing.s },

	pill: {
		paddingHorizontal: omSpacing.s,
		paddingVertical: 2,
		borderRadius: omRadius.full,
	},
	pillOk: { backgroundColor: 'rgba(83,190,169,0.18)' },
	pillBad: { backgroundColor: 'rgba(255,200,80,0.18)' },
	pillOkText: { color: omTheme.accent },
	pillBadText: { color: '#ffd36b' },

	unknownBox: {
		padding: omSpacing.l,
		borderRadius: omRadius.l,
		borderWidth: 1,
		borderColor: 'rgba(255,200,80,0.25)',
		backgroundColor: 'rgba(255,200,80,0.05)',
		gap: omSpacing.s,
	},
	unknownRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: omSpacing.m,
	},
	unknownName: { color: omColors.grayscale300, flex: 1 },
	secondaryButton: {
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.full,
		backgroundColor: 'rgba(255,255,255,0.06)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.12)',
	},
	secondaryText: { color: omTheme.accent },

	runBar: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: omSpacing.l,
		padding: omSpacing.l,
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(83,190,169,0.3)',
	},
	runSummaryLabel: { color: omColors.grayscale500, letterSpacing: 0.8 },
	runSummaryText: { color: omTheme.primaryText, marginTop: 2 },
	runHint: { color: '#ffd36b', marginTop: omSpacing.xs },
	runButton: {
		paddingHorizontal: omSpacing.xl,
		paddingVertical: omSpacing.m,
		borderRadius: omRadius.full,
		backgroundColor: omTheme.accent,
	},
	runButtonDisabled: { opacity: 0.4 },
	runButtonText: { color: omColors.grayscale850 },

	errorCard: {
		padding: omSpacing.l,
		borderRadius: omRadius.l,
		backgroundColor: 'rgba(255,107,107,0.08)',
		borderWidth: 1,
		borderColor: 'rgba(255,107,107,0.3)',
		gap: omSpacing.xs,
	},
	errorTitle: { color: '#ff8a8a' },
	errorBody: { color: '#ffb2b2' },

	resultsCard: {
		padding: omSpacing.l,
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(83,190,169,0.25)',
		gap: omSpacing.m,
	},
	obsRow: {
		gap: omSpacing.xs,
		padding: omSpacing.m,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(83,190,169,0.06)',
	},
	obsTitle: { color: omTheme.primaryText },
	obsBody: { color: omColors.grayscale300 },
	obsEvidence: { color: omColors.grayscale500, marginTop: 2 },

	preBlock: {
		padding: omSpacing.m,
		borderRadius: omRadius.m,
		backgroundColor: '#17181d',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
	},
	preText: {
		color: omColors.grayscale300,
		fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
		fontSize: 12,
	},

	resetButton: {
		alignSelf: 'flex-start',
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.full,
		backgroundColor: 'rgba(255,255,255,0.06)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.12)',
	},

	dragOverlay: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		...(Platform.OS === 'web' ? ({ position: 'fixed' } as object) : null),
		backgroundColor: 'rgba(5, 15, 20, 0.82)',
		alignItems: 'center',
		justifyContent: 'center',
		zIndex: 9999,
		gap: omSpacing.s,
	},
	dragOverlayTitle: { color: omTheme.accent, textAlign: 'center' },
	dragOverlayBody: { color: '#ffffff', textAlign: 'center' },
})
