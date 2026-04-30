import { OMIcon } from '@/components/ui/OMIcon'
import { OMText } from '@/components/ui/OMText'
import { PlatformSvgUri } from '@/components/ui/PlatformSvgUri'
import { useAnalytics } from '@/hooks/useAnalytics'
import { toggleColorSchemePreferenceSync, useColorScheme } from '@/lib/color-theme'
import {
	deleteHandles,
	getHandles,
	inspectPermission,
	listHandles,
	putHandles,
	type StoredHandleBundle,
} from '@/lib/file-handle-store'
import { getCurrentWebLaunchIntent, type LaunchIntent } from '@/lib/launch-intents'
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
import { createWebLabFileAdapter } from '@/lib/lab/adapters/file-adapter.web'
import type { LabFileRef } from '@/lib/lab/core/files'
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
	stripGenomeSuffix,
} from '@/lib/lab/file-model'
import {
	getLabRunDisabledReasonFor,
	runLabAssay,
	runLabVariantYamlFiles,
} from '@/lib/lab/runner'
import {
	deleteRemoteResourceCache,
	listResolvedCachedRemoteResources,
	resolveRemoteResource,
	resourceKindLabel,
	type ResolvedRemoteResource,
} from '@/lib/remote-resource-resolver'
import {
	deleteCachedRemoteLabFile,
	fetchRemoteLabFile,
	listCachedRemoteLabFiles,
	remoteLabFileCacheLimitLabel,
	remoteLabFileKind,
	remoteLabFileName,
	type RemoteLabFile,
} from '@/lib/remote-lab-file'
import type { AssayLang, Genome, RunResult, UnknownEntry } from '@/lib/lab/types'
import { BrandFonts } from '@/lib/brand-typography'
import { warmupMontyRuntime, type VariantObservation } from '@/modules/expo-bioscript'
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
import { Highlight, themes } from 'prism-react-renderer'
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
	genomeName: string
	sourceFiles: AssaySourceFile[]
	startedAt: number
	result: RunResult
}
type AssaySourceFile = {
	language: AssayLang
	name: string
	source?: string
	text: string
}
type SourceViewerState = {
	files: AssaySourceFile[]
	title: string
}
type SessionLabAssay = LabAssay & {
	dependencyUrls: string[]
	file: File
	remoteKind: ResolvedRemoteResource['kind']
}
type PendingPersistentHandle = {
	fileName: string
	groupId: string
	groupLabel: string
	handle?: FileSystemFileHandle
	id: string
	lastError?: string
	needsPicker?: boolean
}
type SavedHandleGroup = {
	id: string
	label: string
	rows: StoredHandleBundle[]
	summary: string
}
type RuntimeWarmupStatus = 'loading' | 'ready' | 'error'
type RemoteIntentState =
	| { status: 'idle' }
	| { intent: LaunchIntent; status: 'pending' }
	| { intent: LaunchIntent; status: 'resolving' }
	| { error: string; intent: LaunchIntent; status: 'error' }
	| { file: RemoteLabFile; intent: LaunchIntent; status: 'file-loaded' }
	| { intent: LaunchIntent; status: 'file-loading' }
	| { dependencies: ResolvedRemoteResource[]; intent: LaunchIntent; resource: ResolvedRemoteResource; status: 'resolved' }
	| { error: string; intent: LaunchIntent; resource: ResolvedRemoteResource; status: 'dependency-error' }
	| { intent: LaunchIntent; resource: ResolvedRemoteResource; status: 'resolving-dependencies' }

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

function assayNeedsWebRuntime(assay: LabAssay, genome: Genome): boolean {
	return assay.language === 'python' || genome.kind === 'text' || genome.kind === 'zip'
}

function searchSessionAssays(assays: LabAssay[], query: string, category: AssayCategory | null): LabAssay[] {
	const q = query.trim().toLowerCase()
	return assays.filter((assay) => {
		if (category && assay.category !== category) return false
		if (!q) return true
		return [
			assay.title,
			assay.subtitle ?? '',
			assay.description,
			...(assay.tags ?? []),
		]
			.join(' ')
			.toLowerCase()
			.includes(q)
	})
}

function isSessionLabAssay(assay: LabAssay): assay is SessionLabAssay {
	return 'file' in assay && assay.file instanceof File
}

function assayDisplayKind(assay: LabAssay): 'builtin' | 'panel' | 'python' | 'variant' {
	if (isSessionLabAssay(assay)) {
		if (assay.remoteKind === 'panel') return 'panel'
		if (assay.remoteKind === 'python') return 'python'
		return 'variant'
	}
	if (assay.category === 'panel') return 'panel'
	if (assay.language === 'python') return 'python'
	return 'builtin'
}

function assayKindLabel(kind: ReturnType<typeof assayDisplayKind>): string {
	switch (kind) {
		case 'panel':
			return 'Panel'
		case 'variant':
			return 'Variant'
		case 'python':
			return 'Python assay'
		default:
			return 'Built-in'
	}
}

function assayKindIcon(kind: ReturnType<typeof assayDisplayKind>) {
	switch (kind) {
		case 'panel':
			return 'layers-outline'
		case 'variant':
			return 'git-branch-outline'
		case 'python':
			return 'code-slash-outline'
		default:
			return 'flask-outline'
	}
}

function mergeAssayList(assays: LabAssay[]): LabAssay[] {
	const byKey = new Map<string, LabAssay>()
	for (const assay of assays) {
		const key = assayStableKey(assay)
		byKey.set(key, assay)
	}
	return Array.from(byKey.values())
}

function assayStableKey(assay: LabAssay): string {
	if (isSessionLabAssay(assay)) {
		return `remote:${assay.remoteKind}:${normalizeRemoteAssayUrl(assay.url)}`
	}
	return `catalog:${assay.id || assay.url || assay.title}`
}

function normalizeRemoteAssayUrl(url: string): string {
	try {
		const parsed = new URL(url)
		parsed.hash = ''
		return parsed.toString()
	} catch {
		return url.trim()
	}
}

function panelVariantAssays(panel: SessionLabAssay, assays: SessionLabAssay[]): SessionLabAssay[] {
	const dependencyUrls = new Set(panel.dependencyUrls)
	if (!dependencyUrls.size) return []
	return assays.filter((assay) => assay.remoteKind === 'variant' && dependencyUrls.has(assay.url))
}

function isPrimaryGenomeKind(kind: LabFileRef['kind']) {
	return kind === 'cram' || kind === 'vcf_gz' || kind === 'genotype_text' || kind === 'zip'
}

function buildGenomeBundleFromRefs(
	refs: LabFileRef[],
	getFile: (ref: LabFileRef) => File,
): { genome: Genome; unknowns: File[] } | null {
	const ordered = [...refs].sort((a, b) => {
		if (isPrimaryGenomeKind(a.kind) && !isPrimaryGenomeKind(b.kind)) return -1
		if (isPrimaryGenomeKind(b.kind) && !isPrimaryGenomeKind(a.kind)) return 1
		return 0
	})
	const primary = ordered.find((ref) => isPrimaryGenomeKind(ref.kind))
	if (!primary) return null
	const primaryKind = primary.kind
	if (
		primaryKind !== 'cram' &&
		primaryKind !== 'vcf_gz' &&
		primaryKind !== 'genotype_text' &&
		primaryKind !== 'zip'
	) {
		return null
	}
	let genome = createGenomeFromPrimaryFile(getFile(primary), primaryKind)
	const unknowns: File[] = []
	for (const ref of ordered) {
		if (ref.id === primary.id) continue
		const kind = ref.kind
		const file = getFile(ref)
		if (kind === 'crai' || kind === 'tbi' || kind === 'fai' || kind === 'fasta') {
			genome = pairCompanionFile([genome], file, kind)[0] ?? genome
			continue
		}
		if (kind === 'unknown' || kind === 'assay_python' || kind === 'assay_yaml') {
			unknowns.push(file)
		}
	}
	return { genome, unknowns }
}

function storedHandleName(row: StoredHandleBundle): string {
	return row.handles.primary?.name ?? row.handles.reference?.name ?? row.documentId.replace(/^lab-drop:/, '')
}

function savedGroupKey(name: string): string {
	const kind = classifyLabFile(name)
	if (kind === 'crai' || kind === 'tbi' || kind === 'fai') {
		return stripGenomeSuffix(name).toLowerCase()
	}
	if (kind === 'fasta') return name.toLowerCase()
	return stripGenomeSuffix(name).toLowerCase()
}

function groupStoredHandles(rows: StoredHandleBundle[]): SavedHandleGroup[] {
	const groups = new Map<string, StoredHandleBundle[]>()
	for (const row of rows) {
		const name = storedHandleName(row)
		const key = row.handles.groupId ?? savedGroupKey(name)
		const current = groups.get(key) ?? []
		current.push(row)
		groups.set(key, current)
	}

	const pendingFasta = new Map<string, StoredHandleBundle[]>()
	const result = Array.from(groups.entries()).map(([key, groupRows]) => {
		const names = groupRows.map(storedHandleName)
		const storedLabel = groupRows.find((row) => row.handles.groupLabel)?.handles.groupLabel
		const primary = names.find((name) => {
			const kind = classifyLabFile(name)
			return kind === 'cram' || kind === 'vcf_gz' || kind === 'genotype_text' || kind === 'zip' || kind === 'assay_yaml' || kind === 'assay_python'
		}) ?? storedLabel ?? names[0] ?? key
		return {
			id: key,
			label: primary,
			rows: groupRows.sort((left, right) => storedHandleName(left).localeCompare(storedHandleName(right))),
			summary: names.map((name) => {
				const kind = classifyLabFile(name)
				return kind === 'unknown' ? name : kind.replace('_', ' ')
			}).join(' · '),
		} satisfies SavedHandleGroup
	})

	// A CRAM genome often has an unrelated reference FASTA name. Attach loose
	// FASTA/FAI groups to a single CRAM group so reopening restores one complete
	// genome bundle from the files the user persisted together.
	const cramGroups = result.filter((group) => group.rows.some((row) => classifyLabFile(storedHandleName(row)) === 'cram'))
	const looseCraiGroups = result.filter((group) =>
		group.rows.every((row) => classifyLabFile(storedHandleName(row)) === 'crai')
	)
	for (const craiGroup of looseCraiGroups) {
		const craiName = storedHandleName(craiGroup.rows[0]!)
		const cramName = stripGenomeSuffix(craiName).toLowerCase()
		const target = cramGroups.find((group) =>
			group.rows.some((row) => storedHandleName(row).toLowerCase() === cramName)
		)
		if (!target) continue
		pendingFasta.set(craiGroup.id, craiGroup.rows)
		target.rows.push(...craiGroup.rows)
	}
	const looseReferenceGroups = result.filter((group) =>
		group.rows.every((row) => {
			const kind = classifyLabFile(storedHandleName(row))
			return kind === 'fasta' || kind === 'fai'
		})
	)
	if (cramGroups.length === 1 && looseReferenceGroups.length) {
		const cram = cramGroups[0]
		if (!cram) return result
		for (const refGroup of looseReferenceGroups) {
			pendingFasta.set(refGroup.id, refGroup.rows)
			cram.rows.push(...refGroup.rows)
		}
		cram.rows.sort((left, right) => storedHandleName(left).localeCompare(storedHandleName(right)))
		cram.summary = cram.rows
			.map((row) => classifyLabFile(storedHandleName(row)).replace('_', ' '))
			.join(' · ')
	}

	return result
		.filter((group) => !pendingFasta.has(group.id))
		.sort((left, right) => left.label.localeCompare(right.label))
}

function logPersistentHandleDebug(label: string, payload: Record<string, unknown>) {
	if (typeof console === 'undefined') return
	console.info(`[lab:persistent-handles] ${label}`, payload)
}

function logPersistentHandleWarning(label: string, payload: Record<string, unknown>) {
	if (typeof console === 'undefined') return
	console.warn(`[lab:persistent-handles] ${label}`, payload)
}

async function selectPersistentHandlesForPending(
	pending: PendingPersistentHandle[],
): Promise<PendingPersistentHandle[]> {
	const picker = (window as typeof window & {
		showOpenFilePicker?: (options?: {
			excludeAcceptAllOption?: boolean
			multiple?: boolean
			types?: {
				accept: Record<string, string[]>
				description: string
			}[]
		}) => Promise<FileSystemFileHandle[]>
	}).showOpenFilePicker
	if (typeof picker !== 'function') {
		throw new Error('File picker handle persistence is not supported in this browser.')
	}

	const selected = await picker({
		excludeAcceptAllOption: false,
		multiple: pending.length > 1,
	})
	const byName = new Map(selected.map((handle) => [handle.name, handle]))
	return pending.map((item) => {
		const handle = byName.get(item.fileName)
		if (!handle) {
			return {
				...item,
				handle: undefined,
				lastError: `Selected files did not include ${item.fileName}`,
				needsPicker: true,
			}
		}
		return {
			...item,
			handle,
			lastError: undefined,
			needsPicker: false,
		}
	})
}

function droppedFileGroupPlan(files: File[]): Map<string, { groupId: string; groupLabel: string }> {
	type PlannedGroup = {
		crai?: string
		fai?: string
		fasta?: string
		groupId: string
		groupLabel: string
		kind: 'assay' | 'cram' | 'other' | 'vcf'
		names: string[]
		primary?: string
		tbi?: string
	}

	const groups: PlannedGroup[] = []
	const ordered = sortFilesForIngestion(files)
	const addStandalone = (file: File, kind: PlannedGroup['kind'] = 'other') => {
		groups.push({
			groupId: `drop-record-${groups.length}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			groupLabel: file.name,
			kind,
			names: [file.name],
			primary: file.name,
		})
	}

	for (const file of ordered) {
		const kind = classifyLabFile(file.name)
		if (kind === 'cram') {
			addStandalone(file, 'cram')
			continue
		}
		if (kind === 'vcf_gz') {
			addStandalone(file, 'vcf')
			continue
		}
		if (kind === 'genotype_text' || kind === 'zip') {
			addStandalone(file, 'other')
			continue
		}
		if (kind === 'assay_yaml' || kind === 'assay_python') {
			addStandalone(file, 'assay')
			continue
		}
		if (kind === 'crai') {
			const stem = stripGenomeSuffix(file.name).toLowerCase()
			const target =
				groups.find((group) => group.kind === 'cram' && group.primary?.toLowerCase() === stem) ??
				groups.find((group) => group.kind === 'cram' && !group.crai)
			if (target) {
				target.crai = file.name
				target.names.push(file.name)
			} else {
				addStandalone(file)
			}
			continue
		}
		if (kind === 'tbi') {
			const stem = stripGenomeSuffix(file.name).toLowerCase()
			const target =
				groups.find((group) => group.kind === 'vcf' && group.primary?.toLowerCase() === stem) ??
				groups.find((group) => group.kind === 'vcf' && !group.tbi)
			if (target) {
				target.tbi = file.name
				target.names.push(file.name)
			} else {
				addStandalone(file)
			}
			continue
		}
		if (kind === 'fasta') {
			const target = groups.find((group) => group.kind === 'cram' && !group.fasta)
			if (target) {
				target.fasta = file.name
				target.names.push(file.name)
			} else {
				addStandalone(file)
			}
			continue
		}
		if (kind === 'fai') {
			const stem = stripGenomeSuffix(file.name).toLowerCase()
			const target =
				groups.find((group) => group.kind === 'cram' && group.fasta?.toLowerCase() === stem) ??
				groups.find((group) => group.kind === 'cram' && !group.fai)
			if (target) {
				target.fai = file.name
				target.names.push(file.name)
			} else {
				addStandalone(file)
			}
			continue
		}
		addStandalone(file)
	}

	const plan = new Map<string, { groupId: string; groupLabel: string }>()
	for (const group of groups) {
		for (const name of group.names) {
			plan.set(name, { groupId: group.groupId, groupLabel: group.groupLabel })
		}
	}
	return plan
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
	const fileAdapterRef = useRef(createWebLabFileAdapter())

	const [genomes, setGenomes] = useState<Genome[]>([])
	const [unknowns, setUnknowns] = useState<UnknownEntry[]>([])
	const [selectedGenomeId, setSelectedGenomeId] = useState<string | null>(null)
	const [runs, setRuns] = useState<RunRecord[]>([])
	const [runningAssayId, setRunningAssayId] = useState<string | null>(null)
	const [dragActive, setDragActive] = useState(false)
	const [query, setQuery] = useState('')
	const [assayUrlInput, setAssayUrlInput] = useState('')
	const [assayUrlCopied, setAssayUrlCopied] = useState(false)
	const [category, setCategory] = useState<AssayCategory | null>(null)
	const [sampleLoadingId, setSampleLoadingId] = useState<string | null>(null)
	const [sampleLoadError, setSampleLoadError] = useState<string | null>(null)
	const [sourceViewer, setSourceViewer] = useState<SourceViewerState | null>(null)
	const [runtimeWarmupStatus, setRuntimeWarmupStatus] = useState<RuntimeWarmupStatus>('loading')
	const [remoteIntent, setRemoteIntent] = useState<RemoteIntentState>({ status: 'idle' })
	const [sessionAssays, setSessionAssays] = useState<SessionLabAssay[]>([])
	const [pendingHandles, setPendingHandles] = useState<PendingPersistentHandle[]>([])
	const [handlePersistMessage, setHandlePersistMessage] = useState<string | null>(null)
	const [savedHandles, setSavedHandles] = useState<SavedHandleGroup[]>([])
	const [savedHandlesLoading, setSavedHandlesLoading] = useState(false)
	const [savedHandlesError, setSavedHandlesError] = useState<string | null>(null)
	const [cachedRemoteFiles, setCachedRemoteFiles] = useState<RemoteLabFile[]>([])

	const activeGenome = useMemo(
		() => genomes.find((g) => g.id === selectedGenomeId) ?? genomes[genomes.length - 1] ?? null,
		[genomes, selectedGenomeId],
	)

	const ingestRef = useCallback((ref: LabFileRef) => {
		const file = fileAdapterRef.current.getFile(ref)
		const kind = ref.kind
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

	const ingestManyRefs = useCallback(
		(refs: LabFileRef[]) => {
			const ordered = [...refs].sort((a, b) => {
				if (isPrimaryGenomeKind(a.kind) && !isPrimaryGenomeKind(b.kind)) return -1
				if (isPrimaryGenomeKind(b.kind) && !isPrimaryGenomeKind(a.kind)) return 1
				return 0
			})
			trackEvent('lab_files_added', {
				fileKinds: ordered.map((ref) => ref.kind),
				fileSources: ordered.map((ref) => ref.source),
				totalFiles: ordered.length,
			})
			const primaryCount = ordered.filter((ref) => isPrimaryGenomeKind(ref.kind)).length
			if (primaryCount === 1) {
				const bundle = buildGenomeBundleFromRefs(ordered, fileAdapterRef.current.getFile)
				if (bundle) {
					setGenomes((prev) => [
						...prev.filter((genome) => genome.primary.name !== bundle.genome.primary.name),
						bundle.genome,
					])
					setSelectedGenomeId(bundle.genome.id)
					if (bundle.unknowns.length) {
						setUnknowns((prev) => [...prev, ...bundle.unknowns.map(createUnknownEntry)])
					}
					return
				}
			}
			for (const ref of ordered) ingestRef(ref)
		},
		[ingestRef, trackEvent],
	)

	const ingestMany = useCallback(
		(files: File[], source: LabFileRef['source'] = 'local') => {
			ingestManyRefs(fileAdapterRef.current.fromPlatformFiles(files, source))
		},
		[ingestManyRefs],
	)

	const refreshSavedHandles = useCallback(async () => {
		const rows = await listHandles()
		const labRows = rows.filter((row) => row.documentId.startsWith('lab-drop:'))
		const groups = groupStoredHandles(labRows)
		logPersistentHandleDebug('refresh saved rows', {
			groups: groups.map((group) => ({
				id: group.id,
				label: group.label,
				rows: group.rows.map((row) => row.documentId),
			})),
			rowCount: labRows.length,
			rows: labRows.map((row) => ({
				documentId: row.documentId,
				groupId: row.handles.groupId ?? null,
				groupLabel: row.handles.groupLabel ?? null,
				primary: row.handles.primary?.name ?? null,
				reference: row.handles.reference?.name ?? null,
			})),
			totalRowCount: rows.length,
		})
		setSavedHandles(groups)
	}, [])

	const refreshCachedRemoteFiles = useCallback(async () => {
		try {
			setCachedRemoteFiles(await listCachedRemoteLabFiles())
		} catch (error) {
			logPersistentHandleWarning('remote file cache refresh failed', {
				error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
			})
		}
	}, [])

	const ingestDroppedItems = useCallback(
		async (items: DataTransferItemList | undefined, fallbackFiles: File[]) => {
			const files = fallbackFiles
			ingestMany(files)
			const groupPlan = droppedFileGroupPlan(files)
			const handles: PendingPersistentHandle[] = []
			const handledNames = new Set<string>()
			const itemList = Array.from(items ?? [])
			logPersistentHandleDebug('drop received', {
				fileNames: files.map((file) => file.name),
				itemCount: itemList.length,
				hasGetAsFileSystemHandle: itemList.map((item) =>
					typeof (item as DataTransferItem & { getAsFileSystemHandle?: unknown }).getAsFileSystemHandle === 'function'
				),
			})
			for (const item of itemList) {
				if (item.kind !== 'file') continue
				const getHandle = (item as DataTransferItem & {
					getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>
				}).getAsFileSystemHandle
				if (typeof getHandle !== 'function') continue
				try {
					const handle = await getHandle.call(item)
					logPersistentHandleDebug('drop handle resolved', {
						handleKind: handle?.kind ?? 'none',
						handleName: handle?.name ?? 'none',
					})
					if (handle?.kind === 'file') {
						handledNames.add(handle.name)
						const group = groupPlan.get(handle.name) ?? {
							groupId: `drop-record-${handle.name}`,
							groupLabel: handle.name,
						}
						handles.push({
							fileName: handle.name,
							groupId: group.groupId,
							groupLabel: group.groupLabel,
							handle: handle as FileSystemFileHandle,
							id: `drop-${handle.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
						})
					}
				} catch (error) {
					logPersistentHandleWarning('drop handle failed', {
						error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
					})
				}
			}
			for (const file of files) {
				if (handledNames.has(file.name)) continue
				const group = groupPlan.get(file.name) ?? {
					groupId: `drop-record-${file.name}`,
					groupLabel: file.name,
				}
				handles.push({
					fileName: file.name,
					groupId: group.groupId,
					groupLabel: group.groupLabel,
					id: `upgrade-${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
				})
			}
			if (handles.length) {
				setPendingHandles((prev) => {
					const byName = new Map(prev.map((item) => [item.fileName, item]))
					for (const handle of handles) byName.set(handle.fileName, handle)
					return Array.from(byName.values())
				})
				setHandlePersistMessage(null)
			}
		},
		[ingestMany],
	)

	useEffect(() => {
		let cancelled = false
		void warmupMontyRuntime()
			.then(() => {
				if (!cancelled) setRuntimeWarmupStatus('ready')
			})
			.catch((error) => {
				console.warn('[bioscript] web runtime warmup failed', error)
				if (!cancelled) setRuntimeWarmupStatus('error')
			})
		return () => {
			cancelled = true
		}
	}, [])

	useEffect(() => {
		void refreshSavedHandles()
	}, [refreshSavedHandles])

	useEffect(() => {
		void refreshCachedRemoteFiles()
	}, [refreshCachedRemoteFiles])

	useEffect(() => {
		if (Platform.OS !== 'web') return
		const syncIntent = () => {
			const intent = getCurrentWebLaunchIntent()
			if (!intent) return
			setRemoteIntent((current) => {
				if ('intent' in current && current.intent.url === intent.url) return current
				return { intent, status: 'pending' }
			})
		}
		syncIntent()
		window.addEventListener('hashchange', syncIntent)
		window.addEventListener('popstate', syncIntent)
		return () => {
			window.removeEventListener('hashchange', syncIntent)
			window.removeEventListener('popstate', syncIntent)
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
			void ingestDroppedItems(e.dataTransfer?.items, Array.from(e.dataTransfer?.files ?? []))
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
	}, [ingestDroppedItems])

	const persistDroppedHandles = useCallback(async () => {
		if (!pendingHandles.length) return
		let handlesToPersist = pendingHandles
		const pickerRequired = handlesToPersist.some((item) => item.needsPicker || !item.handle)
		if (pickerRequired) {
			logPersistentHandleDebug('persist picker fallback start', {
				pending: handlesToPersist.map((item) => ({
					fileName: item.fileName,
					lastError: item.lastError ?? null,
					needsPicker: Boolean(item.needsPicker || !item.handle),
				})),
			})
			try {
				handlesToPersist = await selectPersistentHandlesForPending(handlesToPersist)
				setPendingHandles(handlesToPersist)
				logPersistentHandleDebug('persist picker fallback selected', {
					pending: handlesToPersist.map((item) => ({
						fileName: item.fileName,
						hasHandle: Boolean(item.handle),
						lastError: item.lastError ?? null,
					})),
				})
			} catch (error) {
				const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
				logPersistentHandleWarning('persist picker fallback failed', { error: message })
				setHandlePersistMessage(`Persistent access was not saved. ${message}`)
				return
			}
		}
		let saved = 0
		const failed: string[] = []
		const storedRows: string[] = []
		const retryByName = new Map<string, PendingPersistentHandle>()
		logPersistentHandleDebug('persist start', {
			pending: handlesToPersist.map((item) => ({
				fileName: item.fileName,
				groupId: item.groupId,
				hasHandle: Boolean(item.handle),
			})),
		})
		for (const item of handlesToPersist) {
			const handle = item.handle
			if (!handle) {
				logPersistentHandleWarning('persist skipped missing browser handle', { fileName: item.fileName })
				failed.push(item.fileName)
				retryByName.set(item.fileName, {
					...item,
					lastError: 'Chrome did not provide a persistent dropped-file handle.',
					needsPicker: true,
				})
				continue
			}
			const permission = await inspectPermission(handle)
			logPersistentHandleDebug('persist permission', {
				fileName: item.fileName,
				permission,
			})
			if (permission.state !== 'granted') {
				failed.push(`${item.fileName}: permission ${permission.state}${permission.error ? ` (${permission.error})` : ''}`)
				continue
			}
			logPersistentHandleDebug('persist getFile probe start', { fileName: item.fileName })
			try {
				const file = await handle.getFile()
				logPersistentHandleDebug('persist getFile probe ok', {
					fileName: item.fileName,
					lastModified: file.lastModified,
					size: file.size,
					type: file.type,
				})
			} catch (error) {
				const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
				logPersistentHandleWarning('persist getFile probe failed', { fileName: item.fileName, error: message })
				failed.push(`${item.fileName}: ${message}`)
				retryByName.set(item.fileName, {
					...item,
					handle: undefined,
					lastError: message,
					needsPicker: true,
				})
				continue
			}
			const documentId = `lab-drop:${item.fileName}`
			logPersistentHandleDebug('persist put start', { documentId, fileName: item.fileName })
			try {
				await putHandles(documentId, {
					groupId: item.groupId,
					groupLabel: item.groupLabel,
					primary: handle,
				})
				const stored = await getHandles(documentId)
				logPersistentHandleDebug('persist stored', {
					documentId,
					fileName: item.fileName,
					groupId: item.groupId,
					groupLabel: item.groupLabel,
					verified: Boolean(stored?.primary),
					verifiedName: stored?.primary?.name ?? null,
				})
				if (!stored?.primary) {
					failed.push(`${item.fileName}: IndexedDB write verification failed`)
					continue
				}
				storedRows.push(documentId)
				saved += 1
			} catch (error) {
				const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
				logPersistentHandleWarning('persist put failed', { documentId, fileName: item.fileName, error: message })
				failed.push(`${item.fileName}: ${message}`)
			}
		}
		await refreshSavedHandles()
		for (const documentId of storedRows) {
			retryByName.delete(documentId.replace(/^lab-drop:/, ''))
		}
		const retryWithPicker = Array.from(retryByName.values())
		setPendingHandles(retryWithPicker)
		const failedMessage = failed.length ? ` Failed: ${failed.join(' · ')}` : ''
		setHandlePersistMessage(
			saved
				? `Saved persistent access for ${saved} ${saved === 1 ? 'file' : 'files'} (${storedRows.join(', ')}).${failedMessage}`
				: retryWithPicker.length
					? `Chrome's dropped handle could not be reopened. Click "Select files to persist" and choose the same ${retryWithPicker.length === 1 ? 'file' : 'files'}.${failedMessage}`
					: `Persistent access was not saved.${failedMessage}`,
		)
		setSavedHandlesError(null)
		trackEvent('lab_persistent_handles_saved', { saved, offered: handlesToPersist.length })
	}, [pendingHandles, refreshSavedHandles, trackEvent])

	const restoreSavedHandle = useCallback(async (group: SavedHandleGroup) => {
		setSavedHandlesLoading(true)
		setSavedHandlesError(null)
		try {
			const files: File[] = []
			const failed: string[] = []
			logPersistentHandleDebug('restore start', {
				groupId: group.id,
				groupLabel: group.label,
				rows: group.rows.map((row) => ({
					documentId: row.documentId,
					primary: row.handles.primary?.name ?? null,
					reference: row.handles.reference?.name ?? null,
				})),
			})
			for (const row of group.rows) {
				for (const handle of [row.handles.primary, row.handles.reference]) {
					if (!handle) continue
					try {
						const permission = await inspectPermission(handle)
						logPersistentHandleDebug('restore permission', {
							documentId: row.documentId,
							fileName: handle.name,
							permission,
						})
						if (permission.state !== 'granted') {
							failed.push(`${handle.name}: permission ${permission.state}${permission.error ? ` (${permission.error})` : ''}`)
							continue
						}
						const file = await handle.getFile()
						logPersistentHandleDebug('restore getFile ok', {
							documentId: row.documentId,
							fileName: handle.name,
							lastModified: file.lastModified,
							size: file.size,
							type: file.type,
						})
						files.push(file)
					} catch (error) {
						const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
						logPersistentHandleWarning('restore getFile failed', {
							documentId: row.documentId,
							fileName: handle.name,
							error: message,
							hint: 'The browser handle is stale, the file moved, or Chrome revoked access. Use Forget, then drag/drop and Keep access again.',
						})
						failed.push(`${handle.name}: ${message}`)
					}
				}
			}
			if (files.length) {
				ingestMany(files)
			}
			if (failed.length) {
				setSavedHandlesError(
					`${files.length ? 'Partially restored.' : 'Could not restore saved files.'} ${failed.join(' · ')}`,
				)
			}
			trackEvent('lab_persistent_handles_restored', {
				documentId: group.id,
				failedFiles: failed.length,
				totalFiles: files.length,
			})
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			setSavedHandlesError(message)
			trackEvent('lab_persistent_handles_restore_failed', {
				documentId: group.id,
				error: message,
			})
		} finally {
			setSavedHandlesLoading(false)
		}
	}, [ingestMany, trackEvent])

	const removeSavedHandle = useCallback(async (group: SavedHandleGroup) => {
		await Promise.all(group.rows.map((row) => deleteHandles(row.documentId)))
		await refreshSavedHandles()
		setSavedHandlesError(null)
		setHandlePersistMessage(null)
	}, [refreshSavedHandles])

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
			if (bundle.remoteUrl) {
				trackEvent('lab_sample_genome_remote_requested', { bundleId: bundle.id })
				if (Platform.OS === 'web') {
					window.location.hash = `url=${encodeURIComponent(bundle.remoteUrl)}`
				}
				return
			}
			setSampleLoadingId(bundle.id)
			setSampleLoadError(null)
			trackEvent('lab_sample_genome_requested', { bundleId: bundle.id })
			try {
				const files = await loadTestFileBundle(bundle)
				ingestMany(files, 'bundled')
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

	const addResolvedSessionAssays = useCallback((resources: ResolvedRemoteResource[]) => {
		const assays = resources
			.filter((resource) => resource.kind === 'panel' || resource.kind === 'variant' || resource.kind === 'python')
			.map((resource): SessionLabAssay => {
				const language = resource.kind === 'python' ? 'python' : 'yaml'
				return {
					id: `remote-${resource.sha256.slice(0, 16)}`,
					title: resource.title,
					subtitle: resource.schema ?? resource.name,
					description: resource.summary,
					category: resource.kind === 'panel' ? 'panel' : 'pharmacogenomics',
					language,
					url: resource.sourceUrl,
					inputFormats: ['cram', 'vcf_gz', 'genotype_text', 'zip'],
					tags: [
						'remote',
						resource.kind,
						...(resource.version ? [`version:${resource.version}`] : []),
					],
					file: new File([resource.contents], resource.name, {
						type: language === 'python' ? 'text/x-python' : 'application/yaml',
					}),
					dependencyUrls: resource.dependencies.map((dependency) => dependency.url),
					remoteKind: resource.kind,
				}
			})
		if (!assays.length) return
		setSessionAssays((prev) => {
			const byKey = new Map(prev.map((assay) => [assayStableKey(assay), assay]))
			for (const assay of assays) byKey.set(assayStableKey(assay), assay)
			return Array.from(byKey.values()).sort((left, right) => left.title.localeCompare(right.title))
		})
	}, [])

	useEffect(() => {
		let cancelled = false
		void listResolvedCachedRemoteResources()
			.then((resources) => {
				if (cancelled || !resources.length) return
				addResolvedSessionAssays(resources)
				logPersistentHandleDebug('remote cache rehydrated', {
					count: resources.length,
					resources: resources.map((resource) => ({
						kind: resource.kind,
						sourceUrl: resource.sourceUrl,
						title: resource.title,
					})),
				})
			})
			.catch((error) => {
				logPersistentHandleWarning('remote cache rehydrate failed', {
					error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
				})
			})
		return () => {
			cancelled = true
		}
	}, [addResolvedSessionAssays])

	const forgetRemoteAssay = useCallback(async (assay: LabAssay) => {
		if (!isSessionLabAssay(assay)) return
		await deleteRemoteResourceCache(assay.url)
		setSessionAssays((prev) => prev.filter((item) => item.url !== assay.url))
		trackEvent('lab_remote_resource_cache_deleted', {
			kind: assay.remoteKind,
			sourceUrl: assay.url,
		})
	}, [trackEvent])

	const dismissRemoteIntent = useCallback(() => {
		setRemoteIntent({ status: 'idle' })
	}, [])

	const loadAssayUrl = useCallback((url: string) => {
		const trimmed = url.trim()
		if (!trimmed || Platform.OS !== 'web') return
		window.location.hash = `url=${encodeURIComponent(trimmed)}`
	}, [])

	const shareAssayUrl = useMemo(() => {
		const trimmed = assayUrlInput.trim()
		if (!trimmed || Platform.OS !== 'web') return ''
		return `${window.location.origin}/lab#url=${encodeURIComponent(trimmed)}`
	}, [assayUrlInput])

	const copyShareAssayUrl = useCallback(async () => {
		if (!shareAssayUrl || Platform.OS !== 'web') return
		await navigator.clipboard?.writeText(shareAssayUrl)
		setAssayUrlCopied(true)
		window.setTimeout(() => setAssayUrlCopied(false), 1500)
	}, [shareAssayUrl])

	const fetchRemoteIntent = useCallback(async () => {
		if (remoteIntent.status !== 'pending' && remoteIntent.status !== 'error') return
		const { intent } = remoteIntent
		const intentFileKind = remoteLabFileKind(intent.url)
		const isRemoteLabFile =
			intentFileKind !== 'assay_python' &&
			intentFileKind !== 'assay_yaml' &&
			intentFileKind !== 'unknown'
		setRemoteIntent({ intent, status: isRemoteLabFile ? 'file-loading' : 'resolving' })
		trackEvent('lab_remote_intent_fetch_requested', { source: intent.source })
		try {
			if (isRemoteLabFile) {
				const remoteFile = await fetchRemoteLabFile(intent.url)
				ingestMany([remoteFile.file], 'url')
				if (remoteFile.cacheStatus === 'stored' || remoteFile.cacheStatus === 'hit') {
					await refreshCachedRemoteFiles()
				}
				setRemoteIntent({ file: remoteFile, intent, status: 'file-loaded' })
				trackEvent('lab_remote_file_loaded', {
					cacheStatus: remoteFile.cacheStatus,
					fileKind: remoteFile.fileKind,
					size: remoteFile.file.size,
				})
				return
			}
			const resource = await resolveRemoteResource(intent.url)
			addResolvedSessionAssays([resource])
			setRemoteIntent({ dependencies: [], intent, resource, status: 'resolved' })
			trackEvent('lab_remote_intent_resolved', {
				dependencyCount: resource.dependencies.length,
				kind: resource.kind,
				schema: resource.schema ?? 'none',
			})
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			setRemoteIntent({ error: message, intent, status: 'error' })
			trackEvent('lab_remote_intent_failed', { error: message })
		}
	}, [addResolvedSessionAssays, ingestMany, refreshCachedRemoteFiles, remoteIntent, trackEvent])

	const restoreCachedRemoteFile = useCallback((remoteFile: RemoteLabFile) => {
		ingestMany([remoteFile.file], 'url')
		trackEvent('lab_remote_file_cache_restored', {
			fileKind: remoteFile.fileKind,
			size: remoteFile.file.size,
			sourceUrl: remoteFile.sourceUrl,
		})
	}, [ingestMany, trackEvent])

	const removeCachedRemoteFile = useCallback(async (remoteFile: RemoteLabFile) => {
		await deleteCachedRemoteLabFile(remoteFile.sourceUrl)
		await refreshCachedRemoteFiles()
		trackEvent('lab_remote_file_cache_deleted', {
			fileKind: remoteFile.fileKind,
			sourceUrl: remoteFile.sourceUrl,
		})
	}, [refreshCachedRemoteFiles, trackEvent])

	const resolveRemoteDependencies = useCallback(async () => {
		if (remoteIntent.status !== 'resolved' && remoteIntent.status !== 'dependency-error') return
		const { intent, resource } = remoteIntent
		setRemoteIntent({ intent, resource, status: 'resolving-dependencies' })
		trackEvent('lab_remote_dependencies_fetch_requested', {
			dependencyCount: resource.dependencies.length,
			kind: resource.kind,
		})
		try {
			const dependencies = await Promise.all(
				resource.dependencies.map((dependency) => resolveRemoteResource(dependency.url)),
			)
			addResolvedSessionAssays([resource, ...dependencies])
			setRemoteIntent({ dependencies, intent, resource, status: 'resolved' })
			trackEvent('lab_remote_dependencies_resolved', {
				dependencyCount: dependencies.length,
				kind: resource.kind,
			})
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			setRemoteIntent({ error: message, intent, resource, status: 'dependency-error' })
			trackEvent('lab_remote_dependencies_failed', { error: message, kind: resource.kind })
		}
	}, [addResolvedSessionAssays, remoteIntent, trackEvent])

	const buildAssaySourceFiles = useCallback(
		async (catalogAssay: LabAssay): Promise<AssaySourceFile[]> => {
			const sourceFromAssay = async (assay: LabAssay): Promise<AssaySourceFile> => {
				const file = isSessionLabAssay(assay) ? assay.file : await loadAssayFile(assay)
				return {
					language: assay.language,
					name: file.name,
					source: assay.url,
					text: await file.text(),
				}
			}

			if (isSessionLabAssay(catalogAssay) && catalogAssay.remoteKind === 'panel') {
				const panel = await sourceFromAssay(catalogAssay)
				const variants = await Promise.all(panelVariantAssays(catalogAssay, sessionAssays).map(sourceFromAssay))
				return [panel, ...variants]
			}
			return [await sourceFromAssay(catalogAssay)]
		},
		[sessionAssays],
	)

	const openAssaySource = useCallback(
		async (assay: LabAssay) => {
			const files = await buildAssaySourceFiles(assay)
			setSourceViewer({ files, title: assay.title })
		},
		[buildAssaySourceFiles],
	)

	const runAssay = useCallback(
		async (catalogAssay: LabAssay) => {
			if (!activeGenome || !isGenomeComplete(activeGenome)) return
			if (runningAssayId) return
			if (!isAssayCompatible(catalogAssay, activeGenome)) return
			if (runtimeWarmupStatus === 'loading' && assayNeedsWebRuntime(catalogAssay, activeGenome)) return

			try {
				setRunningAssayId(catalogAssay.id)
				const runId = `run-${Date.now()}-${Math.floor(Math.random() * 1000)}`
				const sourceFiles = await buildAssaySourceFiles(catalogAssay)
				setRuns((prev) => [
					{
						id: runId,
						assay: catalogAssay,
						genomeName: genomeDisplayName(activeGenome),
						sourceFiles,
						startedAt: Date.now(),
						result: { status: 'running' },
					},
					...prev,
				])
				trackEvent('lab_run_started', {
					assayId: catalogAssay.id,
					assayLanguage: catalogAssay.language,
					genomeKind: activeGenome.kind,
				})

				const success =
					isSessionLabAssay(catalogAssay) && catalogAssay.remoteKind === 'panel'
						? await runLabVariantYamlFiles(
								activeGenome,
								panelVariantAssays(catalogAssay, sessionAssays).map((assay) => assay.file),
								(progress) => {
									setRuns((prev) =>
										prev.map((r) =>
											r.id === runId && r.result.status === 'running'
												? { ...r, result: { ...r.result, progress } }
												: r,
										),
									)
								},
							)
						: await runLabAssay(
								activeGenome,
								createAssayFromFile(
									isSessionLabAssay(catalogAssay)
										? catalogAssay.file
										: await loadAssayFile(catalogAssay),
									catalogAssay.language,
									catalogAssay.url,
								),
							)
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
		[activeGenome, buildAssaySourceFiles, runningAssayId, runtimeWarmupStatus, sessionAssays, trackEvent],
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
		if (runtimeWarmupStatus === 'loading' && assayNeedsWebRuntime(assay, activeGenome)) return
		pendingAutoRunRef.current = null
		void runAssay(assay)
	}, [activeGenome, runningAssayId, runAssay, runtimeWarmupStatus])

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

	const categories = useMemo(() => {
		const seen = new Set<AssayCategory>(listAssayCategories())
		for (const assay of sessionAssays) seen.add(assay.category)
		return Array.from(seen)
	}, [sessionAssays])
	const searchResults = useMemo(
		() => searchSessionAssays(mergeAssayList([...searchAssays('', null), ...sessionAssays]), query, category),
		[category, query, sessionAssays],
	)
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

					<RemoteIntentCard
						state={remoteIntent}
						onDismiss={dismissRemoteIntent}
						onFetch={fetchRemoteIntent}
						onResolveDependencies={resolveRemoteDependencies}
					/>

					<DropZone
						compact={Boolean(activeGenome)}
						dragActive={dragActive}
						onChoose={openPicker}
					/>

					<UrlLoadBox
						urlInput={assayUrlInput}
						shareUrl={shareAssayUrl}
						shareUrlCopied={assayUrlCopied}
						onUrlInputChange={setAssayUrlInput}
						onLoadUrl={loadAssayUrl}
						onCopyShareUrl={copyShareAssayUrl}
					/>

					<PersistentHandlePrompt
						message={handlePersistMessage}
						pendingHandles={pendingHandles}
						onDismiss={() => {
							setPendingHandles([])
							setHandlePersistMessage(null)
						}}
						onSave={persistDroppedHandles}
					/>

					<SavedLocalFiles
						cachedRemoteFiles={cachedRemoteFiles}
						error={savedHandlesError}
						loading={savedHandlesLoading}
						rows={savedHandles}
						onRemoveCachedRemote={removeCachedRemoteFile}
						onRemove={removeSavedHandle}
						onRestoreCachedRemote={restoreCachedRemoteFile}
						onRestore={restoreSavedHandle}
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
							onForgetRemoteAssay={forgetRemoteAssay}
							runningAssayId={runningAssayId}
							runtimeWarmupStatus={runtimeWarmupStatus}
							sessionAssays={sessionAssays}
							onRun={runAssay}
							onViewSource={(assay) => {
								void openAssaySource(assay)
							}}
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
								<RunCard
									record={latestRun}
									onViewSource={() => {
										setSourceViewer({ files: latestRun.sourceFiles, title: latestRun.assay.title })
									}}
								/>
							</View>
						) : null}
						{previousRuns.length > 0 ? (
							<View style={styles.resultSection}>
								<OMText variant="caption" style={styles.sectionKicker}>
									RECENT RUNS
								</OMText>
								<View style={styles.stack}>
									{previousRuns.map((r) => (
										<RunCard
											key={r.id}
											record={r}
											onViewSource={() => {
												setSourceViewer({ files: r.sourceFiles, title: r.assay.title })
											}}
										/>
									))}
								</View>
							</View>
						) : null}
					</View>

					<PrivacyFootnote />
				</ScrollView>
				{sourceViewer ? (
					<SourceViewer viewer={sourceViewer} onClose={() => setSourceViewer(null)} />
				) : null}
			</SafeAreaView>
		</ThemeCtx.Provider>
	)
}

function RemoteIntentCard({
	onDismiss,
	onFetch,
	onResolveDependencies,
	state,
}: {
	onDismiss: () => void
	onFetch: () => void
	onResolveDependencies: () => void
	state: RemoteIntentState
}) {
	const { styles, mutedIconTone } = useTheme()
	if (state.status === 'idle') return null

	if (state.status === 'pending' || state.status === 'resolving' || state.status === 'file-loading' || state.status === 'error') {
		const busy = state.status === 'resolving' || state.status === 'file-loading'
		const fileName = remoteLabFileName(state.intent.url)
		const fileKind = remoteLabFileKind(state.intent.url)
		const looksLikeFile = fileKind !== 'assay_python' && fileKind !== 'assay_yaml' && fileKind !== 'unknown'
		return (
			<View style={styles.intentCard}>
				<View style={styles.intentHeader}>
					<View style={styles.intentIcon}>
						<OMIcon name="link-outline" tone="accent" size={18} />
					</View>
					<View style={styles.intentText}>
						<OMText variant="caption" style={styles.intentKicker}>
							SHARED RESOURCE
						</OMText>
						<OMText variant="headline" style={styles.intentTitle}>
							{looksLikeFile ? 'Load this file URL?' : 'Fetch this URL?'}
						</OMText>
						<OMText variant="caption" style={styles.intentUrl} numberOfLines={2}>
							{state.intent.url}
						</OMText>
					</View>
					<Pressable onPress={onDismiss} style={styles.intentClose}>
						<OMIcon name="close-outline" tone={mutedIconTone} size={16} />
					</Pressable>
				</View>
				<OMText variant="body" style={styles.intentBody}>
					{looksLikeFile
						? `BioVault will download ${fileName}, load it into the Lab, and cache it in this browser if it is ${remoteLabFileCacheLimitLabel()} or smaller.`
						: 'BioVault will fetch the target file first, inspect its schema, then ask again before fetching any dependencies it references.'}
				</OMText>
				{looksLikeFile ? (
					<View style={styles.intentMetaRow}>
						<MetaChip label={`file: ${fileName}`} />
						<MetaChip label={`kind: ${fileKind}`} />
					</View>
				) : null}
				{state.status === 'error' ? (
					<View style={styles.errorInlineBlock}>
						<OMIcon name="alert-circle-outline" tone="danger" size={14} />
						<OMText variant="caption" style={styles.errorInline}>
							{state.error}
						</OMText>
					</View>
				) : null}
				<View style={styles.intentActions}>
					<Pressable onPress={onDismiss} disabled={busy} style={styles.intentSecondaryButton}>
						<OMText variant="subtitle" style={styles.intentSecondaryText}>
							Ignore
						</OMText>
					</Pressable>
					<Pressable onPress={onFetch} disabled={busy} style={styles.intentPrimaryButton}>
						{busy ? <ActivityIndicator color="#ffffff" size="small" /> : null}
						<OMText variant="subtitle" style={styles.primaryButtonText}>
							{busy ? 'Loading' : state.status === 'error' ? 'Retry fetch' : looksLikeFile ? 'Load file' : 'Fetch URL'}
						</OMText>
					</Pressable>
				</View>
			</View>
		)
	}

	if (state.status === 'file-loaded') {
		return (
			<View style={styles.intentCard}>
				<View style={styles.intentHeader}>
					<View style={styles.intentIcon}>
						<OMIcon name="document-attach-outline" tone="accent" size={18} />
					</View>
					<View style={styles.intentText}>
						<OMText variant="caption" style={styles.intentKicker}>
							REMOTE FILE LOADED
						</OMText>
						<OMText variant="headline" style={styles.intentTitle}>
							{state.file.file.name}
						</OMText>
						<OMText variant="caption" style={styles.intentUrl} numberOfLines={2}>
							{state.intent.url}
						</OMText>
					</View>
					<Pressable onPress={onDismiss} style={styles.intentClose}>
						<OMIcon name="close-outline" tone={mutedIconTone} size={16} />
					</Pressable>
				</View>
				<OMText variant="body" style={styles.intentBody}>
					Loaded into the Lab as {state.file.fileKind}. Cache status: {state.file.cacheStatus}.
				</OMText>
				<View style={styles.intentMetaRow}>
					<MetaChip label={`size: ${humanLabSize(state.file.file.size)}`} />
					<MetaChip label={`cache: ${state.file.cacheStatus}`} />
					<MetaChip label={`limit: ${remoteLabFileCacheLimitLabel()}`} />
				</View>
				<View style={styles.intentActions}>
					<Pressable onPress={onDismiss} style={styles.intentPrimaryButton}>
						<OMText variant="subtitle" style={styles.primaryButtonText}>
							Done
						</OMText>
					</Pressable>
				</View>
			</View>
		)
	}

	const resource = state.resource
	const resolvingDeps = state.status === 'resolving-dependencies'
	const resolvedDeps = state.status === 'resolved' ? state.dependencies : []
	return (
		<View style={styles.intentCard}>
			<View style={styles.intentHeader}>
				<View style={styles.intentIcon}>
					<OMIcon name="document-text-outline" tone="accent" size={18} />
				</View>
				<View style={styles.intentText}>
					<OMText variant="caption" style={styles.intentKicker}>
						{resourceKindLabel(resource.kind).toUpperCase()}
					</OMText>
					<OMText variant="headline" style={styles.intentTitle}>
						{resource.title}
					</OMText>
					<OMText variant="caption" style={styles.intentUrl} numberOfLines={2}>
						{resource.sourceUrl}
					</OMText>
				</View>
				<Pressable onPress={onDismiss} style={styles.intentClose}>
					<OMIcon name="close-outline" tone={mutedIconTone} size={16} />
				</Pressable>
			</View>

			<OMText variant="body" style={styles.intentBody}>
				{resource.summary}
			</OMText>
			<View style={styles.intentMetaRow}>
				<MetaChip label={`schema: ${resource.schema ?? 'none'}`} />
				<MetaChip label={`version: ${resource.version ?? 'none'}`} />
				<MetaChip label={`cache: ${resource.cacheStatus}`} />
				<MetaChip label={`file: ${resource.name}`} />
			</View>
			{resource.cacheStatus === 'updated' ? (
				<View style={styles.errorInlineBlock}>
					<OMIcon name="alert-circle-outline" tone="danger" size={14} />
					<OMText variant="caption" style={styles.errorInline}>
						This URL differs from the cached copy
						{resource.previousVersion ? ` (cached version ${resource.previousVersion})` : ''}. Fetching
						dependencies will use the newly fetched version for this session.
					</OMText>
				</View>
			) : null}

			{resource.dependencies.length ? (
				<View style={styles.intentDependencyList}>
					<OMText variant="caption" style={styles.intentKicker}>
						DEPENDENCIES
					</OMText>
					{resource.dependencies.slice(0, 8).map((dependency) => (
						<OMText key={dependency.url} variant="caption" style={styles.intentDependency}>
							{dependency.label}: {dependency.url}
						</OMText>
					))}
					{resource.dependencies.length > 8 ? (
						<OMText variant="caption" style={styles.intentDependency}>
							+{resource.dependencies.length - 8} more
						</OMText>
					) : null}
				</View>
			) : null}

			{state.status === 'dependency-error' ? (
				<View style={styles.errorInlineBlock}>
					<OMIcon name="alert-circle-outline" tone="danger" size={14} />
					<OMText variant="caption" style={styles.errorInline}>
						{state.error}
					</OMText>
				</View>
			) : null}

			{resolvedDeps.length ? (
				<View style={styles.intentDependencyList}>
					<OMText variant="caption" style={styles.intentKicker}>
						FETCHED
					</OMText>
					<OMText variant="caption" style={styles.intentDependency}>
						{resolvedDeps.length} dependency {resolvedDeps.length === 1 ? 'file' : 'files'} fetched for this session.
					</OMText>
				</View>
			) : null}

			<View style={styles.intentActions}>
				<Pressable onPress={onDismiss} disabled={resolvingDeps} style={styles.intentSecondaryButton}>
					<OMText variant="subtitle" style={styles.intentSecondaryText}>
						Done
					</OMText>
				</Pressable>
				{resource.dependencies.length ? (
					<Pressable onPress={onResolveDependencies} disabled={resolvingDeps} style={styles.intentPrimaryButton}>
						{resolvingDeps ? <ActivityIndicator color="#ffffff" size="small" /> : null}
						<OMText variant="subtitle" style={styles.primaryButtonText}>
							{resolvingDeps ? 'Fetching dependencies' : resolvedDeps.length ? 'Refetch dependencies' : 'Fetch dependencies'}
						</OMText>
					</Pressable>
				) : null}
			</View>
		</View>
	)
}

function PersistentHandlePrompt({
	message,
	onDismiss,
	onSave,
	pendingHandles,
}: {
	message: string | null
	onDismiss: () => void
	onSave: () => void
	pendingHandles: PendingPersistentHandle[]
}) {
	const { styles, mutedIconTone } = useTheme()
	if (!pendingHandles.length && !message) return null
	return (
		<View style={styles.intentCard}>
			<View style={styles.intentHeader}>
				<View style={styles.intentIcon}>
					<OMIcon name="folder-open-outline" tone="accent" size={18} />
				</View>
				<View style={styles.intentText}>
					<OMText variant="caption" style={styles.intentKicker}>
						PERSISTENT FILE ACCESS
					</OMText>
					<OMText variant="headline" style={styles.intentTitle}>
						Keep access after refresh?
					</OMText>
					<OMText variant="caption" style={styles.intentUrl}>
						{message ?? `${pendingHandles.length} dropped ${pendingHandles.length === 1 ? 'file can' : 'files can'} be upgraded to persistent browser handles.`}
					</OMText>
				</View>
				<Pressable onPress={onDismiss} style={styles.intentClose}>
					<OMIcon name="close-outline" tone={mutedIconTone} size={16} />
				</Pressable>
			</View>
			{pendingHandles.length ? (
				<View style={styles.intentDependencyList}>
					{pendingHandles.slice(0, 6).map((item) => (
						<OMText key={item.id} variant="caption" style={styles.intentDependency}>
							{item.fileName}{item.needsPicker || !item.handle ? ' (select again to persist)' : ''}
							{item.lastError ? ` - ${item.lastError}` : ''}
						</OMText>
					))}
					{pendingHandles.length > 6 ? (
						<OMText variant="caption" style={styles.intentDependency}>
							+{pendingHandles.length - 6} more
						</OMText>
					) : null}
				</View>
			) : null}
			{pendingHandles.length ? (
				<View style={styles.intentActions}>
					<Pressable onPress={onDismiss} style={styles.intentSecondaryButton}>
						<OMText variant="subtitle" style={styles.intentSecondaryText}>
							Not now
						</OMText>
					</Pressable>
					<Pressable onPress={onSave} style={styles.intentPrimaryButton}>
						<OMText variant="subtitle" style={styles.primaryButtonText}>
							{pendingHandles.some((item) => item.needsPicker || !item.handle)
								? 'Select files to persist'
								: 'Keep access'}
						</OMText>
					</Pressable>
				</View>
			) : null}
		</View>
	)
}

function SavedLocalFiles({
	cachedRemoteFiles,
	error,
	loading,
	onRemove,
	onRemoveCachedRemote,
	onRestore,
	onRestoreCachedRemote,
	rows,
	}: {
		cachedRemoteFiles: RemoteLabFile[]
		error: string | null
		loading: boolean
		onRemove: (group: SavedHandleGroup) => void
		onRemoveCachedRemote: (remoteFile: RemoteLabFile) => void
		onRestore: (group: SavedHandleGroup) => void
		onRestoreCachedRemote: (remoteFile: RemoteLabFile) => void
		rows: SavedHandleGroup[]
	}) {
	const { styles } = useTheme()
	if (!rows.length && !cachedRemoteFiles.length && !error) return null
	return (
		<View testID="saved-local-files" style={styles.pickerSection}>
			<OMText variant="caption" style={styles.pickerKicker}>
				SAVED LOCAL FILES
			</OMText>
			<OMText variant="caption" style={styles.pickerIntro}>
				Persistent browser handles and cached URL downloads. Reopen them after refresh.
			</OMText>
			{error ? (
				<View style={styles.errorInlineBlock}>
					<OMIcon name="alert-circle-outline" tone="danger" size={14} />
					<OMText variant="caption" style={styles.errorInline}>
						{error}
					</OMText>
				</View>
			) : null}
			<View style={styles.pickerList}>
				{rows.map((group) => {
					return (
						<View key={group.id} testID="saved-local-file-row" style={styles.pickerRow}>
							<View style={styles.pickerIcon}>
								<OMIcon name="folder-open-outline" tone="accent" size={16} />
							</View>
							<View style={styles.pickerText}>
								<OMText testID="saved-local-file-title" variant="body" style={styles.pickerTitle}>
									{group.label}
								</OMText>
								<OMText testID="saved-local-file-meta" variant="caption" style={styles.pickerMeta}>
									{group.summary} · {group.rows.length} persisted {group.rows.length === 1 ? 'file' : 'files'}
								</OMText>
							</View>
							<Pressable
								onPress={() => onRestore(group)}
								disabled={loading}
								style={loading ? styles.pickerActionMuted : styles.pickerAction}
							>
								<OMText
									variant="subtitle"
									style={loading ? styles.pickerActionMutedText : styles.pickerActionText}
								>
									Open
								</OMText>
							</Pressable>
							<Pressable onPress={() => onRemove(group)} disabled={loading} style={styles.textButton}>
								<OMText variant="subtitle" style={styles.textButtonText}>
									Forget
								</OMText>
							</Pressable>
						</View>
					)
				})}
				{cachedRemoteFiles.map((remoteFile) => (
					<View key={remoteFile.sourceUrl} testID="saved-local-file-row" style={styles.pickerRow}>
						<View style={styles.pickerIcon}>
							<OMIcon name="cloud-download-outline" tone="accent" size={16} />
						</View>
						<View style={styles.pickerText}>
							<OMText testID="saved-local-file-title" variant="body" style={styles.pickerTitle}>
								{remoteFile.file.name}
							</OMText>
							<OMText testID="saved-local-file-meta" variant="caption" style={styles.pickerMeta}>
								Cached URL file · {remoteFile.fileKind} · {humanLabSize(remoteFile.file.size)}
							</OMText>
						</View>
						<Pressable
							onPress={() => onRestoreCachedRemote(remoteFile)}
							disabled={loading}
							style={loading ? styles.pickerActionMuted : styles.pickerAction}
						>
							<OMText
								variant="subtitle"
								style={loading ? styles.pickerActionMutedText : styles.pickerActionText}
							>
								Open
							</OMText>
						</Pressable>
						<Pressable onPress={() => onRemoveCachedRemote(remoteFile)} disabled={loading} style={styles.textButton}>
							<OMText variant="subtitle" style={styles.textButtonText}>
								Forget
							</OMText>
						</Pressable>
					</View>
				))}
			</View>
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

function UrlLoadBox({
	onCopyShareUrl,
	onLoadUrl,
	onUrlInputChange,
	shareUrl,
	shareUrlCopied,
	urlInput,
}: {
	onCopyShareUrl: () => void
	onLoadUrl: (url: string) => void
	onUrlInputChange: (url: string) => void
	shareUrl: string
	shareUrlCopied: boolean
	urlInput: string
}) {
	const { palette, styles } = useTheme()
	return (
		<View style={styles.urlLoadBox}>
			<View style={styles.urlLoadHeader}>
				<OMIcon name="link-outline" tone="accent" size={16} />
				<OMText variant="caption" style={styles.urlLoadTitle}>
					Or load from URL
				</OMText>
			</View>
			<View style={styles.urlLoadRow}>
				<TextInput
					value={urlInput}
					onChangeText={onUrlInputChange}
					placeholder="Paste a GitHub/raw assay, panel, genome ZIP, or genotype URL…"
					placeholderTextColor={palette.textFaint}
					style={styles.urlLoadInput}
					autoCapitalize="none"
					autoCorrect={false}
					keyboardType="url"
					returnKeyType="go"
					onSubmitEditing={() => onLoadUrl(urlInput)}
				/>
				<Pressable
					onPress={() => onLoadUrl(urlInput)}
					disabled={!urlInput.trim()}
					style={urlInput.trim() ? styles.urlLoadButton : styles.urlLoadButtonDisabled}
				>
					<OMText
						variant="subtitle"
						style={urlInput.trim() ? styles.pickerActionText : styles.pickerActionMutedText}
					>
						Load
					</OMText>
				</Pressable>
			</View>
			<OMText variant="caption" style={styles.pickerIntro}>
				Assays are schema-inspected; genome/test files are loaded into the Lab and cached if small enough.
			</OMText>
			{shareUrl ? (
				<View style={styles.shareLinkBox}>
					<OMText variant="caption" style={styles.urlLoadTitle}>
						Shareable lab link
					</OMText>
					<OMText variant="caption" style={styles.shareLinkText} selectable>
						{shareUrl}
					</OMText>
					<Pressable onPress={onCopyShareUrl} style={styles.intentSecondaryButton}>
						<OMText variant="subtitle" style={styles.intentSecondaryText}>
							{shareUrlCopied ? 'Copied' : 'Copy link'}
						</OMText>
					</Pressable>
				</View>
			) : null}
		</View>
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
									{loading ? 'Loading…' : bundle.remoteUrl ? 'Download' : 'Use sample'}
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
	onForgetRemoteAssay,
	onQueryChange,
	onRun,
	onViewSource,
	query,
	results,
	runningAssayId,
	sessionAssays,
	runtimeWarmupStatus,
}: {
	categories: AssayCategory[]
	category: AssayCategory | null
	genome: Genome
	onCategoryChange: (c: AssayCategory | null) => void
	onForgetRemoteAssay: (assay: LabAssay) => void
	onQueryChange: (q: string) => void
	onRun: (assay: LabAssay) => void
	onViewSource: (assay: LabAssay) => void
	query: string
	results: LabAssay[]
	runningAssayId: string | null
	sessionAssays: SessionLabAssay[]
	runtimeWarmupStatus: RuntimeWarmupStatus
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
						const displayKind = assayDisplayKind(assay)
						const isPanel = isSessionLabAssay(assay) && displayKind === 'panel'
						const isRemote = isSessionLabAssay(assay)
						const panelVariants = isPanel ? panelVariantAssays(assay, sessionAssays) : []
						const compatible = isAssayCompatible(assay, genome)
						const waitingForRuntime =
							compatible &&
							runtimeWarmupStatus === 'loading' &&
							assayNeedsWebRuntime(assay, genome)
						const disabledReason = compatible
							? isPanel
								? panelVariants.length
									? `${panelVariants.length} fetched variants ready.`
									: 'Fetch panel dependencies first.'
								: waitingForRuntime
								? 'Runtime is loading.'
								: getLabRunDisabledReasonFor(genome, assay.language)
							: 'Assay is not compatible with this genome format.'
						const isRunning = runningAssayId === assay.id
						const disabled = anyRunning || !compatible || waitingForRuntime || (isPanel && !panelVariants.length)
						return (
							<Pressable
								key={assay.id}
								onPress={() => onRun(assay)}
								disabled={disabled}
								style={[
									styles.pickerRow,
									displayKind === 'panel' ? styles.pickerRowPanel : null,
									displayKind === 'variant' ? styles.pickerRowVariant : null,
									!compatible ? styles.pickerRowIncompatible : null,
									disabled && !isRunning && !isPanel ? styles.pickerRowDisabled : null,
								]}
							>
								<View style={[
									styles.pickerIcon,
									displayKind === 'panel' ? styles.pickerIconPanel : null,
									displayKind === 'variant' ? styles.pickerIconVariant : null,
								]}>
									<OMIcon name={assayKindIcon(displayKind)} tone="accent" size={16} />
								</View>
								<View style={styles.pickerText}>
									<View style={styles.assayTitleRow}>
										<OMText variant="body" style={styles.pickerTitle}>
											{assay.title}
										</OMText>
										<View style={[
											styles.assayKindBadge,
											displayKind === 'panel' ? styles.assayKindBadgePanel : null,
											displayKind === 'variant' ? styles.assayKindBadgeVariant : null,
										]}>
											<OMText variant="caption" style={styles.assayKindBadgeText}>
												{assayKindLabel(displayKind)}
											</OMText>
										</View>
									</View>
									<OMText variant="caption" style={styles.pickerMeta} numberOfLines={1}>
										{ASSAY_CATEGORY_LABELS[assay.category]} ·{' '}
										{assay.inputFormats.map((f) => ASSAY_INPUT_FORMAT_LABELS[f]).join(' / ')}
										{isRemote ? ' · Cached remote' : ''}
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
								) : waitingForRuntime ? (
									<View style={styles.pickerActionRunning}>
										<ActivityIndicator size="small" color={palette.accent} />
										<OMText variant="subtitle" style={styles.pickerActionRunningText}>
											Loading runtime…
										</OMText>
									</View>
								) : (
									<View style={styles.assayActionGroup}>
										<View style={!disabled || isRunning ? styles.pickerAction : styles.pickerActionMuted}>
											<OMText
												variant="subtitle"
												style={!disabled || isRunning ? styles.pickerActionText : styles.pickerActionMutedText}
											>
												{isPanel ? 'Run panel' : compatible ? 'Run assay' : 'Unavailable'}
											</OMText>
										</View>
										{isRemote ? (
											<Pressable
												onPress={(event) => {
													event.stopPropagation?.()
													void onForgetRemoteAssay(assay)
												}}
												style={styles.textButton}
											>
												<OMText variant="subtitle" style={styles.textButtonText}>
													Forget
												</OMText>
											</Pressable>
										) : null}
										<Pressable
											onPress={(event) => {
												event.stopPropagation?.()
												onViewSource(assay)
											}}
											style={styles.textButton}
										>
											<OMText variant="subtitle" style={styles.textButtonText}>
												View
											</OMText>
										</Pressable>
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

function RunCard({ onViewSource, record }: { onViewSource: () => void; record: RunRecord }) {
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
					<OMText variant="caption" style={styles.runCardHint} numberOfLines={1}>
						Input: {record.genomeName}
					</OMText>
				</View>
				{result.status === 'running' ? (
					<ActivityIndicator size="small" color={palette.accent} />
				) : null}
				<Pressable accessibilityRole="button" onPress={onViewSource} style={styles.textButton}>
					<OMText variant="subtitle" style={styles.textButtonText}>
						View source
					</OMText>
				</Pressable>
			</View>

			{result.status === 'running' ? (
				<RunProgress progress={result.progress} />
			) : null}

			{result.status === 'done' && result.observations ? (
				<ObservationTable observations={result.observations} />
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

function RunProgress({ progress }: { progress: RunResult['progress'] }) {
	const { palette, styles } = useTheme()
	const hasTotal = progress?.total !== null && progress?.total !== undefined
	const completed = progress?.completed ?? 0
	const total = progress?.total ?? null
	const ratio = hasTotal && total ? Math.max(0, Math.min(1, completed / total)) : 0
	return (
		<View style={styles.runProgressBlock}>
			<View style={styles.runProgressHead}>
				<OMText variant="caption" style={styles.runCardHint}>
					{progress?.label ?? 'Running locally in your browser.'}
				</OMText>
				{hasTotal ? (
					<OMText variant="caption" style={styles.runCardHint}>
						{completed}/{total}
					</OMText>
				) : null}
			</View>
			{hasTotal ? (
				<View style={styles.runProgressTrack}>
					<View style={[styles.runProgressFill, { backgroundColor: palette.accent, width: `${ratio * 100}%` }]} />
				</View>
			) : null}
		</View>
	)
}

function ObservationTable({ observations }: { observations: VariantObservation[] }) {
	const { styles } = useTheme()
	const showCounts = observations.some((obs) => obs.depth !== undefined || obs.refCount !== undefined || obs.altCount !== undefined)
	const showEvidence = showCounts && observations.some((obs) => obs.evidence.length > 0 || Object.keys(obs.rawCounts).length > 0)
	return (
		<View style={styles.obsTableWrap}>
			<View style={styles.obsTableTitleRow}>
				<OMText variant="caption" style={styles.sectionKicker}>
					OBSERVATIONS
				</OMText>
				<OMText variant="caption" style={styles.runCardHint}>
					{observations.length} row{observations.length === 1 ? '' : 's'}
				</OMText>
			</View>
			<ScrollView horizontal showsHorizontalScrollIndicator>
				<View style={styles.obsTable}>
					<ObservationTableRow header showCounts={showCounts} showEvidence={showEvidence} />
					{observations.map((obs, index) => (
						<ObservationTableRow
							key={`${obs.name}-${obs.matchedRsid ?? 'no-rsid'}-${index}`}
							obs={obs}
							showCounts={showCounts}
							showEvidence={showEvidence}
						/>
					))}
				</View>
			</ScrollView>
		</View>
	)
}

function ObservationTableRow({
	header,
	obs,
	showCounts,
	showEvidence,
}: {
	header?: boolean
	obs?: VariantObservation
	showCounts: boolean
	showEvidence: boolean
}) {
	const { styles } = useTheme()
	const [evidenceExpanded, setEvidenceExpanded] = useState(false)
	if (header) {
		return (
			<View style={[styles.obsTableRow, styles.obsTableHeaderRow]}>
				<ObsCell width={110} header value="RSID" />
				<ObsCell width={92} header value="Ref->Alt" />
				<ObsCell width={120} header value="Genotype" />
				<ObsCell width={110} header value="Decision" />
				<ObsCell width={220} header value="Variant" />
				<ObsCell width={90} header value="Assembly" />
				<ObsCell width={120} header value="Backend" />
				{showCounts ? (
					<>
						<ObsCell width={80} header value="Depth" />
						<ObsCell width={90} header value="ref_count" />
						<ObsCell width={90} header value="alt_count" />
					</>
				) : null}
				{showEvidence ? <ObsCell width={320} header value="Evidence" /> : null}
			</View>
		)
	}
	if (!obs) return null
	const hasAltSupport = observationHasFoundSignal(obs)
	const alleles = parseObservationAlleles(obs)
	return (
		<View style={[styles.obsTableRow, hasAltSupport ? styles.obsTableAltRow : null]}>
			<RsidCell width={110} rsid={obs.matchedRsid} />
			<ObsCell width={92} value={formatObservationAlleles(obs, alleles)} strong />
			<GenotypeCell width={120} obs={obs} />
			<ObsCell width={110} value={formatObservationDecision(obs)} />
			<ObsCell width={220} value={obs.name} />
			<ObsCell width={90} value={obs.assembly?.toUpperCase() ?? '—'} />
			<ObsCell width={120} value={obs.backend} />
			{showCounts ? (
				<>
					<ObsCell width={80} value={formatOptionalNumber(obs.depth)} />
					<ObsCell width={90} value={formatOptionalNumber(obs.refCount)} />
					<ObsCell width={90} value={formatOptionalNumber(obs.altCount)} />
				</>
			) : null}
			{showEvidence ? (
				<EvidenceCell
					expanded={evidenceExpanded}
					onToggle={() => setEvidenceExpanded((value) => !value)}
					value={obs.evidence.length ? obs.evidence.join(' · ') : formatRawCounts(obs.rawCounts)}
					width={320}
				/>
			) : null}
		</View>
	)
}

function GenotypeCell({ obs, width }: { obs: VariantObservation; width: number }) {
	const { styles } = useTheme()
	const genotype = obs.genotype ?? '—'
	const alleles = parseObservationAlleles(obs)
	const hasAltSupport = observationHasFoundSignal(obs)
	if (!alleles || genotype === '—') {
		return (
			<View style={[styles.obsCell, { width }]}>
				<View style={[styles.obsGenotypePill, hasAltSupport ? styles.obsGenotypePillAlt : null]}>
					<OMText variant="caption" numberOfLines={1} style={hasAltSupport ? styles.obsGenotypeAltText : styles.obsGenotypeRefText}>
						{genotype}
					</OMText>
				</View>
			</View>
		)
	}

	const canSplitBases = alleles.ref.length === 1 && alleles.alt.length === 1 && genotype.length <= 2
	return (
		<View style={[styles.obsCell, { width }]}>
			<View style={[styles.obsGenotypePill, hasAltSupport ? styles.obsGenotypePillAlt : null]}>
				{canSplitBases ? (
					<OMText variant="caption" style={styles.obsGenotypeText}>
						{genotype.split('').map((base, index) => {
							const normalized = base.toUpperCase()
							const isAlt = normalized === alleles.alt.toUpperCase()
							const isRef = normalized === alleles.ref.toUpperCase()
							return (
								<OMText
									key={`${base}-${index}`}
									variant="caption"
									style={isAlt ? styles.obsGenotypeAltText : isRef ? styles.obsGenotypeRefText : styles.obsGenotypeText}
								>
									{base}
								</OMText>
							)
						})}
					</OMText>
				) : (
					<OMText variant="caption" numberOfLines={1} style={hasAltSupport ? styles.obsGenotypeAltText : styles.obsGenotypeRefText}>
						{genotype}
					</OMText>
				)}
			</View>
		</View>
	)
}

function RsidCell({ rsid, width }: { rsid?: string; width: number }) {
	const { styles } = useTheme()
	if (!rsid) return <ObsCell width={width} value="—" />
	const normalizedRsid = rsid.trim()
	const href = `https://www.ncbi.nlm.nih.gov/snp/${normalizedRsid}`
	return (
		<View style={[styles.obsCell, { width }]}>
			<Pressable
				accessibilityRole="link"
				onPress={() => {
					window.open(href, '_blank', 'noopener,noreferrer')
				}}
			>
				<OMText numberOfLines={1} variant="caption" style={styles.obsLinkText}>
					{normalizedRsid}
				</OMText>
			</Pressable>
		</View>
	)
}

function EvidenceCell({
	expanded,
	onToggle,
	value,
	width,
}: {
	expanded: boolean
	onToggle: () => void
	value: string
	width: number
}) {
	const { styles } = useTheme()
	return (
		<View style={[styles.obsCell, { width }]}>
			<OMText
				numberOfLines={expanded ? undefined : 2}
				variant="caption"
				style={expanded ? styles.obsEvidenceExpandedText : styles.obsCellText}
			>
				{value}
			</OMText>
			{value.length > 120 ? (
				<Pressable accessibilityRole="button" onPress={onToggle} style={styles.obsEvidenceToggle}>
					<OMText variant="caption" style={styles.obsLinkText}>
						{expanded ? 'Show less' : 'Full evidence'}
					</OMText>
				</Pressable>
			) : null}
		</View>
	)
}

function ObsCell({
	header,
	strong,
	value,
	width,
}: {
	header?: boolean
	strong?: boolean
	value: string
	width: number
}) {
	const { styles } = useTheme()
	return (
		<View style={[styles.obsCell, { width }]}>
			<OMText
				numberOfLines={header ? 1 : 2}
				variant="caption"
				style={header ? styles.obsCellHeaderText : strong ? styles.obsCellStrongText : styles.obsCellText}
			>
				{value}
			</OMText>
		</View>
	)
}

function formatObservationDecision(obs: VariantObservation): string {
	return obs.decision ?? (obs.genotype ? 'called' : 'not found')
}

function formatObservationAlleles(
	obs: VariantObservation,
	parsedAlleles: { ref: string; alt: string } | null = parseObservationAlleles(obs),
): string {
	const ref = obs.ref ?? parsedAlleles?.ref
	const alt = obs.alt ?? parsedAlleles?.alt
	return ref && alt ? `${ref}->${alt}` : '—'
}

function observationHasFoundSignal(obs: VariantObservation): boolean {
	if ((obs.altCount ?? 0) > 0) return true
	if (obs.altCount !== undefined || obs.refCount !== undefined) return false
	const genotype = obs.genotype?.trim()
	return Boolean(genotype && genotype !== '—' && genotype !== '--')
}

function parseObservationAlleles(obs: VariantObservation): { ref: string; alt: string } | null {
	const text = obs.decision ?? ''
	const snpMatch = text.match(/\bfor\s+([ACGT]+)>([ACGT]+)\b/i)
	if (snpMatch?.[1] && snpMatch[2]) return { ref: snpMatch[1], alt: snpMatch[2] }
	const indelMatch = text.match(/\bfor\s+([ACGT]+)->([ACGT]+)\b/i)
	if (indelMatch?.[1] && indelMatch[2]) return { ref: indelMatch[1], alt: indelMatch[2] }
	return null
}

function formatOptionalNumber(value: number | undefined): string {
	return value === undefined ? '—' : String(value)
}

function formatRawCounts(rawCounts: Record<string, number>): string {
	const entries = Object.entries(rawCounts)
	if (!entries.length) return '—'
	return entries.map(([allele, count]) => `${allele}:${count}`).join(' · ')
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

function SourceViewer({
	onClose,
	viewer,
}: {
	onClose: () => void
	viewer: SourceViewerState
}) {
	const { styles } = useTheme()
	const [selectedIndex, setSelectedIndex] = useState(0)
	const selected = viewer.files[Math.min(selectedIndex, viewer.files.length - 1)] ?? viewer.files[0]
	return (
		<View style={styles.sourceOverlay}>
			<Pressable accessibilityRole="button" onPress={onClose} style={styles.sourceBackdrop} />
			<View style={styles.sourcePanel}>
				<View style={styles.sourceHead}>
					<View style={{ flex: 1, gap: 2 }}>
						<OMText variant="caption" style={styles.sectionKicker}>
							SOURCE FILES
						</OMText>
						<OMText variant="headline" style={styles.sourceTitle}>
							{viewer.title}
						</OMText>
						<OMText variant="caption" style={styles.runCardHint}>
							{viewer.files.length} file{viewer.files.length === 1 ? '' : 's'} used by this assay/report
						</OMText>
					</View>
					<Pressable accessibilityRole="button" onPress={onClose} style={styles.iconButton}>
						<OMIcon name="close-outline" tone="muted" size={18} />
					</Pressable>
				</View>

				{viewer.files.length > 1 ? (
					<ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sourceTabsScroll}>
						<View style={styles.sourceTabs}>
							{viewer.files.map((file, index) => (
								<Pressable
									key={`${file.name}-${index}`}
									onPress={() => setSelectedIndex(index)}
									style={[styles.sourceTab, selectedIndex === index ? styles.sourceTabActive : null]}
								>
									<OMText
										variant="caption"
										style={selectedIndex === index ? styles.sourceTabTextActive : styles.sourceTabText}
										numberOfLines={1}
									>
										{file.name}
									</OMText>
								</Pressable>
							))}
						</View>
					</ScrollView>
				) : null}

				{selected ? (
					<View style={styles.sourceBody}>
						<View style={styles.sourceMetaRow}>
							<OMText variant="caption" style={styles.sourceFileName}>
								{selected.name}
							</OMText>
							<OMText variant="caption" style={styles.runCardHint}>
								{selected.language.toUpperCase()}
							</OMText>
						</View>
						{selected.source ? (
							<OMText variant="caption" style={styles.runCardHint} numberOfLines={1}>
								{selected.source}
							</OMText>
						) : null}
						<ScrollView style={styles.sourceCodeScroll}>
							<ScrollView horizontal>
								<HighlightedSourceCode file={selected} />
							</ScrollView>
						</ScrollView>
					</View>
				) : null}
			</View>
		</View>
	)
}

function HighlightedSourceCode({ file }: { file: AssaySourceFile }) {
	const { styles } = useTheme()
	const language = sourceLanguage(file)
	return (
		<Highlight code={file.text} language={language} theme={themes.github}>
			{({ tokens, getTokenProps }) => (
				<View style={styles.sourceCodeBlock}>
					{tokens.map((line, lineIndex) => (
						<View key={lineIndex} style={styles.sourceCodeLine}>
							<OMText variant="caption" style={styles.sourceLineNumber}>
								{String(lineIndex + 1).padStart(3, ' ')}
							</OMText>
							<OMText selectable variant="caption" style={styles.sourceCodeText}>
								{line.map((token, tokenIndex) => {
									const tokenProps = getTokenProps({ token })
									return (
										<OMText
											key={tokenIndex}
											variant="caption"
											style={[styles.sourceCodeText, tokenProps.style as any]}
										>
											{token.content}
										</OMText>
									)
								})}
							</OMText>
						</View>
					))}
				</View>
			)}
		</Highlight>
	)
}

function sourceLanguage(file: AssaySourceFile): 'yaml' | 'python' {
	if (file.language === 'python' || /\.py$/i.test(file.name)) return 'python'
	return 'yaml'
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
		} as object,
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

		// launch intents
		intentCard: {
			padding: omSpacing.l,
			borderRadius: omRadius.l,
			backgroundColor: p.surface,
			borderWidth: 1,
			borderColor: p.accentBorder,
			gap: omSpacing.m,
		},
		intentHeader: {
			flexDirection: 'row',
			alignItems: 'flex-start',
			gap: omSpacing.m,
		},
		intentIcon: {
			width: 32,
			height: 32,
			borderRadius: 8,
			alignItems: 'center',
			justifyContent: 'center',
			backgroundColor: p.accentSoft,
		},
		intentText: { flex: 1, gap: 2 },
		intentKicker: { color: p.accentStrong, letterSpacing: 1.4 },
		intentTitle: { color: p.text },
		intentUrl: { color: p.textMuted },
		intentBody: { color: p.textMuted },
		intentClose: {
			padding: omSpacing.xs,
			borderRadius: omRadius.full,
			backgroundColor: p.surfaceRaised,
			borderWidth: 1,
			borderColor: p.border,
		},
		intentMetaRow: {
			flexDirection: 'row',
			flexWrap: 'wrap',
			gap: omSpacing.xs,
		},
		intentDependencyList: {
			gap: omSpacing.xs,
			padding: omSpacing.m,
			borderRadius: omRadius.m,
			backgroundColor: p.surfaceSunken,
			borderWidth: 1,
			borderColor: p.border,
		},
		intentDependency: { color: p.textMuted },
		intentActions: {
			flexDirection: 'row',
			justifyContent: 'flex-end',
			flexWrap: 'wrap',
			gap: omSpacing.s,
		},
		intentPrimaryButton: {
			minHeight: 40,
			flexDirection: 'row',
			alignItems: 'center',
			justifyContent: 'center',
			gap: omSpacing.xs,
			paddingHorizontal: omSpacing.l,
			paddingVertical: omSpacing.s,
			borderRadius: omRadius.full,
			backgroundColor: p.accent,
		},
		intentSecondaryButton: {
			minHeight: 40,
			alignItems: 'center',
			justifyContent: 'center',
			paddingHorizontal: omSpacing.l,
			paddingVertical: omSpacing.s,
			borderRadius: omRadius.full,
			backgroundColor: p.surfaceRaised,
			borderWidth: 1,
			borderColor: p.border,
		},
		intentSecondaryText: { color: p.textMuted },

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
		pickerRowPanel: {
			backgroundColor: p.accentTint,
			borderColor: p.accentBorder,
		},
		pickerRowVariant: {
			backgroundColor: p.surfaceSunken,
			borderColor: p.borderStrong,
		},
		pickerIcon: {
			width: 32,
			height: 32,
			borderRadius: 8,
			alignItems: 'center',
			justifyContent: 'center',
			backgroundColor: p.accentSoft,
		},
		pickerIconPanel: {
			backgroundColor: p.accent,
		},
		pickerIconVariant: {
			backgroundColor: p.surfaceRaised,
			borderWidth: 1,
			borderColor: p.accentBorder,
		},
		pickerText: { flex: 1, gap: 2 },
		assayTitleRow: {
			flexDirection: 'row',
			alignItems: 'center',
			flexWrap: 'wrap',
			gap: omSpacing.xs,
		},
		pickerTitle: { color: p.text },
		pickerMeta: { color: p.textMuted },
		assayKindBadge: {
			paddingHorizontal: omSpacing.s,
			paddingVertical: 2,
			borderRadius: omRadius.full,
			backgroundColor: p.surfaceRaised,
			borderWidth: 1,
			borderColor: p.border,
		},
		assayKindBadgePanel: {
			backgroundColor: p.accentSoft,
			borderColor: p.accentBorder,
		},
		assayKindBadgeVariant: {
			backgroundColor: p.surface,
			borderColor: p.accentBorder,
		},
		assayKindBadgeText: { color: p.textMuted, letterSpacing: 0.8 },
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
		assayActionGroup: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: omSpacing.s,
		},

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
		urlLoadBox: {
			gap: omSpacing.s,
			padding: omSpacing.m,
			borderRadius: omRadius.l,
			backgroundColor: p.surfaceSunken,
			borderWidth: 1,
			borderColor: p.border,
		},
		urlLoadHeader: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: omSpacing.xs,
		},
		urlLoadTitle: { color: p.accentStrong, letterSpacing: 1.1 },
		urlLoadRow: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: omSpacing.s,
		},
		urlLoadInput: {
			flex: 1,
			minWidth: 0,
			color: p.text,
			fontSize: 14,
			fontFamily: BrandFonts.body,
			outlineStyle: 'none',
			paddingHorizontal: omSpacing.m,
			paddingVertical: omSpacing.s,
			borderRadius: omRadius.m,
			backgroundColor: p.surface,
			borderWidth: 1,
			borderColor: p.border,
		} as object,
		urlLoadButton: {
			paddingHorizontal: omSpacing.l,
			paddingVertical: omSpacing.s,
			borderRadius: omRadius.full,
			backgroundColor: p.accent,
		},
		urlLoadButtonDisabled: {
			paddingHorizontal: omSpacing.l,
			paddingVertical: omSpacing.s,
			borderRadius: omRadius.full,
			backgroundColor: p.surfaceRaised,
			borderWidth: 1,
			borderColor: p.border,
		},
		shareLinkBox: {
			gap: omSpacing.s,
			padding: omSpacing.m,
			borderRadius: omRadius.m,
			backgroundColor: p.surface,
			borderWidth: 1,
			borderColor: p.accentBorder,
		},
		shareLinkText: {
			color: p.textMuted,
			fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
		},
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
		runProgressBlock: { gap: omSpacing.s },
		runProgressHead: {
			flexDirection: 'row',
			alignItems: 'center',
			justifyContent: 'space-between',
			gap: omSpacing.m,
		},
		runProgressTrack: {
			height: 8,
			borderRadius: omRadius.full,
			backgroundColor: p.surfaceSunken,
			overflow: 'hidden',
		},
		runProgressFill: {
			height: '100%',
			borderRadius: omRadius.full,
		},

		// observations
		obsTableWrap: {
			borderRadius: omRadius.l,
			backgroundColor: p.surfaceRaised,
			borderWidth: 1,
			borderColor: p.border,
			overflow: 'hidden',
		},
		obsTableTitleRow: {
			flexDirection: 'row',
			alignItems: 'center',
			justifyContent: 'space-between',
			gap: omSpacing.m,
			paddingHorizontal: omSpacing.m,
			paddingTop: omSpacing.m,
			paddingBottom: omSpacing.s,
		},
		obsTable: {
			minWidth: 1330,
			paddingBottom: omSpacing.s,
		},
		obsTableRow: {
			flexDirection: 'row',
			borderTopWidth: 1,
			borderTopColor: p.border,
		},
		obsTableAltRow: {
			backgroundColor: p.warningBg,
		},
		obsTableHeaderRow: {
			backgroundColor: p.surfaceSunken,
		},
		obsCell: {
			paddingHorizontal: omSpacing.m,
			paddingVertical: omSpacing.s,
			justifyContent: 'center',
		},
		obsCellHeaderText: {
			color: p.textMuted,
			letterSpacing: 1,
			textTransform: 'uppercase',
		},
		obsCellText: {
			color: p.textMuted,
			lineHeight: 18,
		},
		obsEvidenceExpandedText: {
			color: p.textMuted,
			lineHeight: 18,
		},
		obsEvidenceToggle: {
			alignSelf: 'flex-start',
			marginTop: 4,
		},
		obsLinkText: {
			color: p.accentStrong,
			fontWeight: '700',
			lineHeight: 18,
		},
		obsCellStrongText: {
			color: p.text,
			fontWeight: '700',
			lineHeight: 18,
		},
		obsGenotypePill: {
			alignSelf: 'flex-start',
			borderRadius: omRadius.full,
			borderWidth: 1,
			borderColor: p.borderStrong,
			backgroundColor: p.surface,
			paddingHorizontal: 10,
			paddingVertical: 3,
		},
		obsGenotypePillAlt: {
			borderColor: p.warningBorder,
			backgroundColor: p.warningBg,
		},
		obsGenotypeText: {
			color: p.text,
			fontWeight: '800',
			lineHeight: 18,
		},
		obsGenotypeRefText: {
			color: p.text,
			fontWeight: '800',
			lineHeight: 18,
		},
		obsGenotypeAltText: {
			color: p.warningText,
			fontWeight: '900',
			lineHeight: 18,
		},

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
		iconButton: {
			width: 36,
			height: 36,
			borderRadius: omRadius.full,
			alignItems: 'center',
			justifyContent: 'center',
			backgroundColor: p.surfaceSunken,
			borderWidth: 1,
			borderColor: p.border,
		},

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

		// source viewer
		sourceOverlay: {
			...(Platform.OS === 'web' ? ({ position: 'fixed' } as any) : null),
			left: 0,
			right: 0,
			top: 0,
			bottom: 0,
			zIndex: 30,
			alignItems: 'center',
			justifyContent: 'center',
			padding: omSpacing.xl,
		},
		sourceBackdrop: {
			...(Platform.OS === 'web' ? ({ position: 'fixed' } as any) : null),
			left: 0,
			right: 0,
			top: 0,
			bottom: 0,
			backgroundColor: p.overlayBg,
		},
		sourcePanel: {
			width: '100%',
			maxWidth: 980,
			maxHeight: '86%',
			borderRadius: omRadius.xl,
			backgroundColor: p.surfaceRaised,
			borderWidth: 1,
			borderColor: p.borderStrong,
			overflow: 'hidden',
			boxShadow: `0 24px 70px ${p.shadow}`,
		},
		sourceHead: {
			flexDirection: 'row',
			alignItems: 'flex-start',
			gap: omSpacing.m,
			padding: omSpacing.l,
			borderBottomWidth: 1,
			borderBottomColor: p.border,
		},
		sourceTitle: { color: p.text },
		sourceTabsScroll: {
			borderBottomWidth: 1,
			borderBottomColor: p.border,
		},
		sourceTabs: {
			flexDirection: 'row',
			gap: omSpacing.xs,
			paddingHorizontal: omSpacing.l,
			paddingVertical: omSpacing.s,
		},
		sourceTab: {
			maxWidth: 240,
			paddingHorizontal: omSpacing.m,
			paddingVertical: omSpacing.s,
			borderRadius: omRadius.full,
			backgroundColor: p.surfaceSunken,
			borderWidth: 1,
			borderColor: p.border,
		},
		sourceTabActive: {
			backgroundColor: p.warningBg,
			borderColor: p.warningBorder,
		},
		sourceTabText: { color: p.textMuted },
		sourceTabTextActive: { color: p.warningText, fontWeight: '800' },
		sourceBody: {
			gap: omSpacing.s,
			padding: omSpacing.l,
			minHeight: 280,
			maxHeight: 620,
		},
		sourceMetaRow: {
			flexDirection: 'row',
			alignItems: 'center',
			justifyContent: 'space-between',
			gap: omSpacing.m,
		},
		sourceFileName: {
			color: p.text,
			fontWeight: '800',
		},
		sourceCodeScroll: {
			borderRadius: omRadius.m,
			backgroundColor: p.surfaceSunken,
			borderWidth: 1,
			borderColor: p.border,
			maxHeight: 520,
		},
		sourceCodeBlock: {
			paddingVertical: omSpacing.m,
			minWidth: 680,
		},
		sourceCodeLine: {
			flexDirection: 'row',
			alignItems: 'flex-start',
			paddingHorizontal: omSpacing.m,
		},
		sourceLineNumber: {
			width: 40,
			color: p.textFaint,
			fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
			fontSize: 12,
			lineHeight: 18,
			userSelect: 'none',
		},
		sourceCodeText: {
			color: p.text,
			fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
			fontSize: 12,
			lineHeight: 18,
		},

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
