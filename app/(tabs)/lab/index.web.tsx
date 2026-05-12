/* eslint-disable react/no-children-prop */
import { OMIcon } from '@/components/ui/OMIcon'
import { OMText } from '@/components/ui/OMText'
import { PlatformSvgUri } from '@/components/ui/PlatformSvgUri'
import { useAnalytics } from '@/hooks/useAnalytics'
import { getAnalytics } from '@/lib/analytics'
import { toggleColorSchemePreferenceSync, useColorScheme } from '@/lib/color-theme'
import { clearDeferredLaunchUrlSync, getDeferredLaunchUrlSync } from '@/lib/deferred-launch-url'
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
	getAssayById,
	type LabAssay,
	LAB_ASSAYS,
	LAB_TEST_FILES,
	type LabTestFileBundle,
	listAssayCategories,
	loadAssayFile,
	loadTestFileBundle,
	searchAssays,
} from '@/lib/lab/assay-catalog'
import { normalizeLabSearchParam } from '@/lib/lab/assay-loader'
import { createWebLabFileAdapter } from '@/lib/lab/adapters/file-adapter.web'
import { createLabFilePickerAdapter } from '@/lib/lab/adapters/file-picker'
import {
	buildLabFileGroupPlan,
	isPrimaryGenomeFileKind,
	savedLabFileGroupKey,
	sortLabFileRefsForIngestion,
} from '@/lib/lab/core/file-groups'
import type { LabFileRef } from '@/lib/lab/core/files'
import {
	isLabGenomeComplete,
	labGenomeBytesTotal,
	labGenomeDisplayName,
	labGenomeInputFormat,
	labGenomeKindLabel,
	missingLabGenomeSlots,
} from '@/lib/lab/core/genomes'
import {
	classifyLabFile,
	createUnknownEntry,
	humanLabSize,
	stripGenomeSuffix,
} from '@/lib/lab/file-model'
import { runLabPackageReportRef } from '@/lib/lab/runner'
import {
	createLabGenomeRefFromPrimary,
	pairLabGenomeCompanionRef,
	type LabGenomeRef,
} from '@/lib/lab/core/refs'
import { clearAllAppStorage } from '@/lib/clear-app-storage'
import {
	deleteRemoteResourceCache,
	listResolvedCachedRemotePackages,
	listResolvedCachedRemoteResources,
	resolveRemotePackage,
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
import type { AssayLang, LabRunArtifact, LabRunProgress, LabRunSuccess, RunResult, UnknownEntry } from '@/lib/lab/types'
import { BrandFonts } from '@/lib/brand-typography'
import { inspectBytes, warmupMontyRuntime, type BioscriptInspection, type BioscriptPackageFile } from '@/modules/expo-bioscript'
import { omRadius, omSpacing } from '@/styles/brand'
import { labPalettes, type LabPalette } from '@/styles/lab-theme'
import { Asset } from 'expo-asset'
import { useLocalSearchParams } from 'expo-router'
import {
	createContext,
	createElement,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react'
// @ts-expect-error react-dom ships types via @types/react-dom which isn't a
// dependency here; the runtime module is fine on web.
import { createPortal } from 'react-dom'
import {
	ActivityIndicator,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	TextInput,
	useWindowDimensions,
	View,
} from 'react-native'
import { Highlight, themes } from 'prism-react-renderer'
import { SafeAreaView } from 'react-native-safe-area-context'

// === Theme context =========================================================

type Styles = ReturnType<typeof makeStyles>
type ThemeValue = { palette: LabPalette; styles: Styles; mutedIconTone: 'muted' | 'inverse' }

const ThemeCtx = createContext<ThemeValue | null>(null)
const microscopeIconUri = Asset.fromModule(require('../../../assets/images/microscope.svg')).uri
const ENABLE_CHROME_DROPPED_FILE_HANDLES =
	process.env.EXPO_PUBLIC_ENABLE_CHROME_DROPPED_FILE_HANDLES === '1'
/** IDE-style pinned files + fixtures column (web Lab only). */
const LAB_EXPLORER_PANEL_WIDTH = 296

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
	analyticsAssayId?: string
	dependencyUrls: string[]
	file: File
	packageEntrypoint?: string
	packageFiles?: BioscriptPackageFile[]
	packageSourceUrl?: string
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

function isAssayCompatible(assay: LabAssay, genome: LabGenomeRef): boolean {
	return assay.inputFormats.includes(labGenomeInputFormat(genome))
}

function assayNeedsWebRuntime(assay: LabAssay, genome: LabGenomeRef): boolean {
	return assay.language === 'python' || genome.kind === 'text' || genome.kind === 'zip'
}

function getLabRunDisabledReasonForRef(
	selectedGenome: LabGenomeRef | null,
	assayLanguage: AssayLang | null,
): string | null {
	if (!selectedGenome) return 'Pick a genome above.'
	if (!assayLanguage) return 'Pick an assay above.'
	if (!isLabGenomeComplete(selectedGenome)) {
		return `Genome is missing: ${missingLabGenomeSlots(selectedGenome).join(', ')}`
	}
	return null
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
	// URLs that a session assay arrived via a package release for. Catalog
	// entries with matching `url` are hidden so the resolved package replaces
	// the example entry instead of doubling it.
	const claimedPackageSourceUrls = new Set<string>()
	for (const assay of assays) {
		if (isSessionLabAssay(assay) && assay.packageSourceUrl) {
			claimedPackageSourceUrls.add(normalizeRemoteAssayUrl(assay.packageSourceUrl))
		}
	}
	const byKey = new Map<string, LabAssay>()
	for (const assay of assays) {
		if (
			!isSessionLabAssay(assay) &&
			assay.url &&
			claimedPackageSourceUrls.has(normalizeRemoteAssayUrl(assay.url))
		) {
			continue
		}
		const key = assayStableKey(assay)
		byKey.set(key, assay)
	}
	return Array.from(byKey.values())
}

function assayStableKey(assay: LabAssay): string {
	if (assay.url) return `url:${normalizeRemoteAssayUrl(assay.url)}`
	if (isSessionLabAssay(assay)) {
		return `remote:${assay.remoteKind}:${assay.title}`
	}
	return `catalog:${assay.id || assay.title}`
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

function assayAnalyticsId(assay: LabAssay): string {
	if (isSessionLabAssay(assay) && assay.analyticsAssayId) return assay.analyticsAssayId
	return assay.id
}

function remoteResourceAnalyticsId(resource: ResolvedRemoteResource, catalogAssays: LabAssay[]): string {
	const normalizedSourceUrl = normalizeRemoteAssayUrl(resource.sourceUrl)
	const catalogMatch = catalogAssays.find((assay) => normalizeRemoteAssayUrl(assay.url) === normalizedSourceUrl)
	if (catalogMatch) return catalogMatch.id
	const baseName = resource.name.replace(/\.(yaml|yml|py)$/i, '')
	return baseName || resource.title || `remote-${resource.sha256.slice(0, 16)}`
}

function assayAnalyticsProperties(assay: LabAssay): Record<string, string> {
	const properties: Record<string, string> = {
		assayId: assayAnalyticsId(assay),
	}
	if (isSessionLabAssay(assay)) {
		properties.internalAssayId = assay.id
		properties.remoteKind = assay.remoteKind
		properties.sourceUrl = assay.url
		if (assay.packageSourceUrl) properties.packageSourceUrl = assay.packageSourceUrl
		if (assay.packageEntrypoint) properties.packageEntrypoint = assay.packageEntrypoint
	}
	return properties
}

function genomeRelatedFileNames(genome: LabGenomeRef): string[] {
	if (genome.kind === 'cram') {
		return [
			genome.primary.name,
			genome.crai?.name,
			genome.fasta?.name,
			genome.fai?.name,
		].filter((name): name is string => Boolean(name))
	}
	if (genome.kind === 'vcf') {
		return [genome.primary.name, genome.tbi?.name].filter((name): name is string => Boolean(name))
	}
	return [genome.primary.name]
}

function safeGenomicExtension(name: string): string {
	const lower = name.toLowerCase()
	const knownExtensions = [
		'.vcf.gz.tbi',
		'.cram.crai',
		'.fasta.fai',
		'.fa.fai',
		'.vcf.gz',
		'.fasta',
		'.cram',
		'.crai',
		'.fai',
		'.vcf',
		'.zip',
		'.txt',
		'.tsv',
		'.csv',
		'.fa',
	]
	const match = knownExtensions.find((extension) => lower.endsWith(extension))
	return match ?? (lower.match(/\.[a-z0-9]+$/)?.[0] ?? '')
}

function genomeRelatedFileExtensions(genome: LabGenomeRef): string[] {
	return genomeRelatedFileNames(genome).map(safeGenomicExtension).filter(Boolean)
}

function demoBundleForRemoteUrl(url: string): LabTestFileBundle | null {
	return LAB_TEST_FILES.find((bundle) => bundle.remoteUrl === url) ?? null
}

function demoBundleAnalyticsProperties(bundle: LabTestFileBundle): Record<string, unknown> {
	return {
		data_source: 'demo',
		demo_bundle_id: bundle.id,
		demo_file_extensions: bundle.files.map((file) => safeGenomicExtension(file.name)).filter(Boolean),
		demo_file_kinds: bundle.files.map((file) => file.kind),
		demo_filename: bundle.files.map((file) => file.name).join(','),
		demo_title: bundle.title,
		is_demo_file: true,
		is_user_supplied_data: false,
	}
}

function fileHeuristicAnalyticsProperties(
	genome: LabGenomeRef,
	inspection: BioscriptInspection,
): Record<string, unknown> {
	return {
		assembly: inspection.assembly ?? '',
		confidence: inspection.confidence,
		container: inspection.container,
		detectedKind: inspection.detectedKind,
		durationMs: inspection.durationMs,
		evidenceCount: inspection.evidence.length,
		fileExtension: safeGenomicExtension(inspection.fileName),
		genomeKind: genome.kind,
		hasIndex: inspection.hasIndex ?? false,
		inputFormat: labGenomeInputFormat(genome),
		phased: inspection.phased ?? false,
		platformVersion: inspection.source?.platformVersion ?? '',
		referenceMatches: inspection.referenceMatches ?? false,
		relatedFileExtensions: genomeRelatedFileExtensions(genome),
		selectedEntryExtension: inspection.selectedEntry ? safeGenomicExtension(inspection.selectedEntry) : '',
		sourceConfidence: inspection.source?.confidence ?? '',
		sourceEvidenceCount: inspection.source?.evidence.length ?? 0,
		sourceVendor: inspection.source?.vendor ?? '',
		warnings: inspection.warnings,
	}
}

function panelVariantAssays(panel: SessionLabAssay, assays: SessionLabAssay[]): SessionLabAssay[] {
	const dependencyUrls = new Set(panel.dependencyUrls)
	if (!dependencyUrls.size) return []
	return assays.filter((assay) => assay.remoteKind === 'variant' && dependencyUrls.has(assay.url))
}

function buildGenomeBundleFromRefs(
	refs: LabFileRef[],
	getFile: (ref: LabFileRef) => File,
): { genomeRef: LabGenomeRef; unknowns: File[] } | null {
	const ordered = sortLabFileRefsForIngestion(refs)
	const primary = ordered.find((ref) => isPrimaryGenomeFileKind(ref.kind))
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
	const initialGenomeRef = createLabGenomeRefFromPrimary(primary)
	if (!initialGenomeRef) return null
	let genomeRef = initialGenomeRef
	const unknowns: File[] = []
	for (const ref of ordered) {
		if (ref.id === primary.id) continue
		const kind = ref.kind
		const file = getFile(ref)
		if (kind === 'crai' || kind === 'tbi' || kind === 'fai' || kind === 'fasta') {
			genomeRef = pairLabGenomeCompanionRef([genomeRef], ref)[0] ?? genomeRef
			continue
		}
		if (kind === 'unknown' || kind === 'assay_python' || kind === 'assay_yaml') {
			unknowns.push(file)
		}
	}
	return { genomeRef, unknowns }
}

function storedHandleName(row: StoredHandleBundle): string {
	return row.handles.primary?.name ?? row.handles.reference?.name ?? row.documentId.replace(/^lab-drop:/, '')
}

function groupStoredHandles(rows: StoredHandleBundle[]): SavedHandleGroup[] {
	const groups = new Map<string, StoredHandleBundle[]>()
	for (const row of rows) {
		const name = storedHandleName(row)
		const key = row.handles.groupId ?? savedLabFileGroupKey(name)
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
		if (typeof window !== 'undefined' && !window.isSecureContext) {
			throw new Error('File picker handle persistence requires HTTPS or localhost in Chrome.')
		}
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
	const filePickerRef = useRef(createLabFilePickerAdapter())

	const [genomes, setGenomes] = useState<LabGenomeRef[]>([])
	const [unknowns, setUnknowns] = useState<UnknownEntry[]>([])
	const [selectedGenomeId, setSelectedGenomeId] = useState<string | null>(null)
	const [runs, setRuns] = useState<RunRecord[]>([])
	const [runningAssayId, setRunningAssayId] = useState<string | null>(null)
	const [dragActive, setDragActive] = useState(false)
	const [query, setQuery] = useState('')
	const [assayUrlInput, setAssayUrlInput] = useState('')
	const [assayUrlCopied, setAssayUrlCopied] = useState(false)
	const [category, setCategory] = useState<AssayCategory | null>('panel')
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

	const activeGenomeRef = useMemo(
		() => genomes.find((g) => g.id === selectedGenomeId) ?? genomes[genomes.length - 1] ?? null,
		[genomes, selectedGenomeId],
	)

	const { width: layoutWidth } = useWindowDimensions()
	/** Wide browser layout: genome setup left, assays + runs right */
	const LAB_WIDE_TWO_COL_MIN = 1100
	const useWideSplit = layoutWidth >= LAB_WIDE_TWO_COL_MIN && Boolean(activeGenomeRef)

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
			const genomeRef = createLabGenomeRefFromPrimary(ref)
			if (!genomeRef) return
			setGenomes((prev) => [...prev, genomeRef])
			setSelectedGenomeId(genomeRef.id)
			return
		}
		setGenomes((prev) => pairLabGenomeCompanionRef(prev, ref))
	}, [])

	const ingestManyRefs = useCallback(
		(refs: LabFileRef[], eventProperties?: Record<string, unknown>) => {
			const ordered = sortLabFileRefsForIngestion(refs)
			trackEvent('lab_files_added', {
				fileKinds: ordered.map((ref) => ref.kind),
				fileSources: ordered.map((ref) => ref.source),
				totalFiles: ordered.length,
				...eventProperties,
			})
			const primaryCount = ordered.filter((ref) => isPrimaryGenomeFileKind(ref.kind)).length
			if (primaryCount === 1) {
				const bundle = buildGenomeBundleFromRefs(ordered, fileAdapterRef.current.getFile)
				if (bundle) {
					setGenomes((prev) => [
						...prev.filter((genome) => genome.primary.name !== bundle.genomeRef.primary.name),
						bundle.genomeRef,
					])
					setSelectedGenomeId(bundle.genomeRef.id)
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
		(files: File[], source: LabFileRef['source'] = 'local', eventProperties?: Record<string, unknown>) => {
			ingestManyRefs(fileAdapterRef.current.fromPlatformFiles(files, source), eventProperties)
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
			const refs = fileAdapterRef.current.fromPlatformFiles(files, 'local')
			ingestManyRefs(refs)
			const groupPlan = buildLabFileGroupPlan(refs)
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
			if (ENABLE_CHROME_DROPPED_FILE_HANDLES) {
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
		[ingestManyRefs],
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
		const seenIntentUrls = new Set<string>()
		const syncIntent = () => {
			const intent = getCurrentWebLaunchIntent()
			if (!intent) return
			const deferredLaunchUrl = getDeferredLaunchUrlSync()
			const restoredFromOnboarding = deferredLaunchUrl === window.location.href
			if (restoredFromOnboarding) {
				clearDeferredLaunchUrlSync()
			}
			if (!seenIntentUrls.has(intent.url)) {
				seenIntentUrls.add(intent.url)
				trackEvent('lab_shared_link_opened', {
					restoredFromOnboarding,
					url: intent.url,
					source: intent.source,
				})
			}
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
	}, [trackEvent])

	useEffect(() => {
		return filePickerRef.current.subscribeToFileDrops({
			onActiveChange: setDragActive,
			onFiles: (files, items) => {
				void ingestDroppedItems(items, files)
			},
		})
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

	const openPicker = useCallback(async () => {
		const files = await filePickerRef.current.pickFiles()
		if (files.length) ingestMany(files)
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
				trackEvent('lab_sample_genome_remote_requested', {
					...demoBundleAnalyticsProperties(bundle),
					bundleId: bundle.id,
				})
				setRemoteIntent({
					intent: {
						kind: 'remote-resource',
						source: 'demo-catalog',
						url: bundle.remoteUrl,
					},
					status: 'pending',
				})
				return
			}
			setSampleLoadingId(bundle.id)
			setSampleLoadError(null)
			trackEvent('lab_sample_genome_requested', {
				...demoBundleAnalyticsProperties(bundle),
				bundleId: bundle.id,
			})
			try {
				const files = await loadTestFileBundle(bundle)
				ingestMany(files, 'bundled', demoBundleAnalyticsProperties(bundle))
				trackEvent('lab_sample_genome_loaded', {
					...demoBundleAnalyticsProperties(bundle),
					bundleId: bundle.id,
					totalFiles: files.length,
				})
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err)
				setSampleLoadError(msg)
				trackEvent('lab_sample_genome_failed', {
					...demoBundleAnalyticsProperties(bundle),
					bundleId: bundle.id,
					error: msg,
				})
			} finally {
				setSampleLoadingId(null)
			}
		},
		[ingestMany, trackEvent],
	)

	const addResolvedSessionAssays = useCallback((
		resources: ResolvedRemoteResource[],
		packageInfo?: { entrypoint: string; files: BioscriptPackageFile[]; sourceUrl: string },
	) => {
		const assays = resources
			.filter((resource) => resource.kind === 'panel' || resource.kind === 'assay' || resource.kind === 'variant' || resource.kind === 'python')
			.map((resource): SessionLabAssay => {
				const language = resource.kind === 'python' ? 'python' : 'yaml'
				return {
					id: `remote-${resource.sha256.slice(0, 16)}`,
					title: resource.title,
					subtitle: resource.schema ?? resource.name,
					description: resource.summary,
					category: resource.kind === 'panel' ? 'panel' : 'pharmacogenomics',
					language,
					analyticsAssayId: remoteResourceAnalyticsId(resource, LAB_ASSAYS),
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
					packageEntrypoint: packageInfo?.entrypoint,
					packageFiles: packageInfo?.files,
					packageSourceUrl: packageInfo?.sourceUrl,
					remoteKind: resource.kind,
				}
			})
		if (!assays.length) return
		setSessionAssays((prev) => {
			const byKey = new Map(prev.map((assay) => [assayStableKey(assay), assay]))
			for (const assay of assays) {
				const key = assayStableKey(assay)
				const existing = byKey.get(key)
				byKey.set(key, existing && !assay.packageFiles?.length ? {
					...assay,
					packageEntrypoint: existing.packageEntrypoint,
					packageFiles: existing.packageFiles,
					packageSourceUrl: existing.packageSourceUrl,
				} : assay)
			}
			return Array.from(byKey.values()).sort((left, right) => left.title.localeCompare(right.title))
		})
	}, [])

	useEffect(() => {
		let cancelled = false
		void Promise.all([
			listResolvedCachedRemoteResources(),
			listResolvedCachedRemotePackages(),
		])
			.then(([resources, packages]) => {
				if (cancelled) return
				for (const pkg of packages) {
					addResolvedSessionAssays(pkg.resources, { entrypoint: pkg.entrypoint, files: pkg.files, sourceUrl: pkg.sourceUrl })
				}
				if (resources.length) addResolvedSessionAssays(resources)
				logPersistentHandleDebug('remote cache rehydrated', {
					count: resources.length,
					packageCount: packages.length,
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
		trackEvent('lab_share_link_copied', {
			shareUrl: shareAssayUrl,
			targetUrl: assayUrlInput.trim(),
		})
	}, [assayUrlInput, shareAssayUrl, trackEvent])

	const fetchRemoteIntent = useCallback(async () => {
		if (remoteIntent.status !== 'pending' && remoteIntent.status !== 'error') return
		const { intent } = remoteIntent
		const demoBundle = intent.source === 'demo-catalog' ? demoBundleForRemoteUrl(intent.url) : null
		const demoProperties = demoBundle ? demoBundleAnalyticsProperties(demoBundle) : {}
		const intentFileKind = remoteLabFileKind(intent.url)
		const isRemoteLabFile =
			intentFileKind !== 'assay_python' &&
			intentFileKind !== 'assay_yaml' &&
			intentFileKind !== 'unknown'
		setRemoteIntent({ intent, status: isRemoteLabFile ? 'file-loading' : 'resolving' })
		trackEvent('lab_remote_intent_fetch_requested', { ...demoProperties, source: intent.source, url: intent.url })
		try {
			if (isRemoteLabFile) {
				if (intentFileKind === 'zip') {
					try {
						const pkg = await resolveRemotePackage(intent.url)
						addResolvedSessionAssays(pkg.resources, { entrypoint: pkg.entrypoint, files: pkg.files, sourceUrl: pkg.sourceUrl })
						const resource =
							pkg.resources.find((candidate) => candidate.sourceUrl.endsWith(`/${pkg.entrypoint}`)) ??
							pkg.resources[0]
						if (!resource) {
							throw new Error(`Package ${pkg.name ?? pkg.sourceUrl} did not contain runnable BioScript resources.`)
						}
						setRemoteIntent({
							dependencies: pkg.resources.filter((candidate) => candidate.sourceUrl !== resource.sourceUrl),
							intent,
							resource,
							status: 'resolved',
						})
						trackEvent('lab_remote_package_resolved', {
							...demoProperties,
							resourceCount: pkg.resources.length,
							source: intent.source,
							url: intent.url,
						})
						return
					} catch (error) {
						console.warn('[lab] remote zip was not a BioScript package; falling back to lab file', error)
					}
				}
				const remoteFile = await fetchRemoteLabFile(intent.url)
				ingestMany([remoteFile.file], demoBundle ? 'bundled' : 'url', demoProperties)
				if (remoteFile.cacheStatus === 'stored' || remoteFile.cacheStatus === 'hit') {
					await refreshCachedRemoteFiles()
				}
				setRemoteIntent({ file: remoteFile, intent, status: 'file-loaded' })
				trackEvent('lab_remote_file_loaded', {
					...demoProperties,
					cacheStatus: remoteFile.cacheStatus,
					fileKind: remoteFile.fileKind,
					size: remoteFile.file.size,
					source: intent.source,
					url: intent.url,
				})
				return
			}
			const resource = await resolveRemoteResource(intent.url)
			if (resource.schema === 'bioscript:package-release:1.0') {
				const pkg = await resolveRemotePackage(intent.url)
				addResolvedSessionAssays(pkg.resources, { entrypoint: pkg.entrypoint, files: pkg.files, sourceUrl: pkg.sourceUrl })
				const entrypointResource =
					pkg.resources.find((candidate) => candidate.sourceUrl.endsWith(`/${pkg.entrypoint}`)) ??
					pkg.resources[0]
				if (!entrypointResource) {
					throw new Error(`Package ${pkg.name ?? pkg.sourceUrl} did not contain runnable BioScript resources.`)
				}
				setRemoteIntent({
					dependencies: pkg.resources.filter((candidate) => candidate.sourceUrl !== entrypointResource.sourceUrl),
					intent,
					resource: entrypointResource,
					status: 'resolved',
				})
				trackEvent('lab_remote_package_resolved', {
					...demoProperties,
					resourceCount: pkg.resources.length,
					source: intent.source,
					url: intent.url,
				})
				return
			}
			addResolvedSessionAssays([resource])
			setRemoteIntent({ dependencies: [], intent, resource, status: 'resolved' })
			trackEvent('lab_remote_intent_resolved', {
				...demoProperties,
				dependencyCount: resource.dependencies.length,
				kind: resource.kind,
				schema: resource.schema ?? 'none',
				source: intent.source,
				url: intent.url,
			})
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			setRemoteIntent({ error: message, intent, status: 'error' })
			trackEvent('lab_remote_intent_failed', { ...demoProperties, error: message, source: intent.source, url: intent.url })
		}
	}, [addResolvedSessionAssays, ingestMany, refreshCachedRemoteFiles, remoteIntent, trackEvent])

	const restoreCachedRemoteFile = useCallback((remoteFile: RemoteLabFile) => {
		const demoBundle = demoBundleForRemoteUrl(remoteFile.sourceUrl)
		const demoProperties = demoBundle ? demoBundleAnalyticsProperties(demoBundle) : {}
		ingestMany([remoteFile.file], demoBundle ? 'bundled' : 'url', demoProperties)
		trackEvent('lab_remote_file_cache_restored', {
			...demoProperties,
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
			url: intent.url,
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
				url: intent.url,
			})
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			setRemoteIntent({ error: message, intent, resource, status: 'dependency-error' })
			trackEvent('lab_remote_dependencies_failed', { error: message, kind: resource.kind, url: intent.url })
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

			// Catalog entries that came from example-resources.json have a github
			// `blob` URL that can't be raw-fetched directly. Route them through
			// resolveRemoteResource so we get the resolved File content.
			if (!isSessionLabAssay(catalogAssay) && catalogAssay.url) {
				const resolved = await resolveRemoteResource(catalogAssay.url)
				return [{
					language: catalogAssay.language,
					name: resolved.name,
					source: catalogAssay.url,
					text: resolved.contents,
				}]
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
			if (!activeGenomeRef || !isLabGenomeComplete(activeGenomeRef)) return
			if (runningAssayId) return
			if (!isAssayCompatible(catalogAssay, activeGenomeRef)) return
			if (runtimeWarmupStatus === 'loading' && assayNeedsWebRuntime(catalogAssay, activeGenomeRef)) return

			try {
				setRunningAssayId(catalogAssay.id)
				const runId = `run-${Date.now()}-${Math.floor(Math.random() * 1000)}`
				const sourceFiles = await buildAssaySourceFiles(catalogAssay)
				setRuns((prev) => [
					{
						id: runId,
						assay: catalogAssay,
						genomeName: labGenomeDisplayName(activeGenomeRef),
						sourceFiles,
						startedAt: Date.now(),
						result: { status: 'running' },
					},
					...prev,
				])
				trackEvent('lab_run_started', {
					...assayAnalyticsProperties(catalogAssay),
					assayLanguage: catalogAssay.language,
					genomeKind: activeGenomeRef.kind,
				})
				try {
					const primaryFile = fileAdapterRef.current.getFile(activeGenomeRef.primary)
					const bytes = new Uint8Array(await primaryFile.arrayBuffer())
					const inspection = await inspectBytes(primaryFile.name, bytes, { detectSex: true })
					trackEvent('using_file_heuristics', fileHeuristicAnalyticsProperties(activeGenomeRef, inspection))
				} catch (inspectionError) {
					trackEvent('using_file_heuristics', {
						error: inspectionError instanceof Error ? inspectionError.message : String(inspectionError),
						fileExtension: safeGenomicExtension(activeGenomeRef.primary.name),
						genomeKind: activeGenomeRef.kind,
						inputFormat: labGenomeInputFormat(activeGenomeRef),
						relatedFileExtensions: genomeRelatedFileExtensions(activeGenomeRef),
					})
				}

				const onProgress = (progress: LabRunProgress) => {
					setRuns((prev) =>
						prev.map((r) =>
							r.id === runId && r.result.status === 'running'
								? { ...r, result: { ...r.result, progress } }
								: r,
						),
					)
				}
				const session = isSessionLabAssay(catalogAssay) ? catalogAssay : null
				let packageEntrypoint = session?.packageEntrypoint
				let packageFiles = session?.packageFiles
				// If the user is running a catalog entry that hasn't been resolved
				// to a package yet (or whose cache was cleared / refresh raced the
				// rehydrate effect), resolve on-the-fly so they don't need a
				// separate "Load" click. resolveRemotePackage handles both
				// package-release manifests and panel/assay YAMLs that declare a
				// `package: { artifact: ... }` field, so we don't gate on schema.
				if ((!packageFiles?.length || !packageEntrypoint) && catalogAssay.url) {
					try {
						const pkg = await resolveRemotePackage(catalogAssay.url)
						addResolvedSessionAssays(pkg.resources, { entrypoint: pkg.entrypoint, files: pkg.files, sourceUrl: pkg.sourceUrl })
						packageEntrypoint = pkg.entrypoint
						packageFiles = pkg.files
					} catch (resolveError) {
						console.warn('[lab] auto-resolve package failed', resolveError)
					}
				}
				if (!packageFiles?.length || !packageEntrypoint) {
					throw new Error(
						'This assay was not loaded as a package — load it as a .zip so the rust report path runs (no fallback).',
					)
				}
				const success: LabRunSuccess = await runLabPackageReportRef(
					activeGenomeRef,
					packageEntrypoint,
					packageFiles,
					fileAdapterRef.current,
					onProgress,
				)
				setRuns((prev) =>
					prev.map((r) => (r.id === runId ? { ...r, result: success.result } : r)),
				)
				trackEvent('lab_report_generated', {
					...assayAnalyticsProperties(catalogAssay),
					artifactCount: success.result.artifacts?.length ?? 0,
					artifactNames: (success.result.artifacts ?? []).map((artifact) => artifact.name),
					genomeKind: activeGenomeRef.kind,
					htmlReportName: htmlArtifactForResult(success.result)?.name ?? '',
					resultKind: success.kind,
				})
				trackEvent('lab_run_completed', {
					...assayAnalyticsProperties(catalogAssay),
					genomeKind: activeGenomeRef.kind,
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
					...assayAnalyticsProperties(catalogAssay),
					genomeKind: activeGenomeRef.kind,
					error: msg,
				})
			} finally {
				setRunningAssayId(null)
			}
		},
		[activeGenomeRef, buildAssaySourceFiles, runningAssayId, runtimeWarmupStatus, sessionAssays, trackEvent],
	)

	// Auto-run from `?run=<assayId>` once genome is ready — consumed only once.
	const pendingAutoRunRef = useRef<string | null>(normalizeLabSearchParam(params.run))
	useEffect(() => {
		const id = pendingAutoRunRef.current
		if (!id) return
		if (!activeGenomeRef || !isLabGenomeComplete(activeGenomeRef)) return
		if (runningAssayId) return
		const assay = getAssayById(id)
		if (!assay) {
			pendingAutoRunRef.current = null
			return
		}
		if (!isAssayCompatible(assay, activeGenomeRef)) return
		if (runtimeWarmupStatus === 'loading' && assayNeedsWebRuntime(assay, activeGenomeRef)) return
		pendingAutoRunRef.current = null
		void runAssay(assay)
	}, [activeGenomeRef, runningAssayId, runAssay, runtimeWarmupStatus])

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

	const labSetupBlocks = (
		<>
			<PersistentHandlePrompt
				message={handlePersistMessage}
				pendingHandles={pendingHandles}
				onDismiss={() => {
					setPendingHandles([])
					setHandlePersistMessage(null)
				}}
				onSave={persistDroppedHandles}
			/>

			{activeGenomeRef ? <GenomeCard genome={activeGenomeRef} onClear={clearGenome} /> : null}

			{unknowns.length > 0 ? (
				<UnknownFilesNote unknowns={unknowns} onRemove={removeUnknown} />
			) : null}
		</>
	)

	const labWorkBlocks = (
		<>
			{activeGenomeRef ? (
				<AssayPicker
					genome={activeGenomeRef}
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
		</>
	)

	return (
		<ThemeCtx.Provider value={themeValue}>
			<SafeAreaView style={styles.safe} edges={['top']}>
				{dragActive ? <DragOverlay /> : null}

				<View style={styles.workspaceShell}>
					<LabExplorerSidebar
						assayUrlCopied={assayUrlCopied}
						assayUrlInput={assayUrlInput}
						cachedRemoteFiles={cachedRemoteFiles}
						dragActive={dragActive}
						onChooseGenomeFiles={openPicker}
						onCopyShareAssayUrl={copyShareAssayUrl}
						onLoadAssayUrl={loadAssayUrl}
						onUrlInputChange={setAssayUrlInput}
						sampleBundles={LAB_TEST_FILES}
						sampleLoadError={sampleLoadError}
						sampleLoadingId={sampleLoadingId}
						savedHandlesError={savedHandlesError}
						savedHandlesLoading={savedHandlesLoading}
						savedHandleGroups={savedHandles}
						shareAssayUrl={shareAssayUrl}
						onPickSample={pickSample}
						onRemoveCachedRemote={removeCachedRemoteFile}
						onRemoveSavedHandle={removeSavedHandle}
						onRestoreCachedRemote={restoreCachedRemoteFile}
						onRestoreSavedHandle={restoreSavedHandle}
					/>
					<ScrollView
						ref={scrollRef}
						style={[styles.scroll, styles.mainWorkspaceScroll]}
						contentContainerStyle={styles.content}
					>
						<View style={styles.siteHeader}>
							<View style={styles.heroRow}>
								<View style={styles.heroTextBlock}>
									<OMText variant="caption" style={styles.heroEyebrow}>
										BIOVAULT LAB
									</OMText>
									<OMText variant="h4" style={styles.heroTitle}>
										Run genomics assays in your browser
									</OMText>
									<OMText variant="body" style={[styles.heroLead, { color: palette.textMuted }]}>
										Load genomic data, pick an assay, and inspect results—using the full width of your
										display.
									</OMText>
								</View>
								<View style={styles.headerTools}>
									<GithubButton scheme={scheme} />
									<ContactButton scheme={scheme} />
									<ClearAllButton />
									<WebThemeToggle scheme={scheme} />
								</View>
							</View>
						</View>

						{useWideSplit ? (
							<View style={styles.splitRow}>
								<View style={[styles.splitPane, styles.splitPanePrimary]}>
									<OMText variant="caption" style={styles.columnKicker}>
										DATA · SETUP
									</OMText>
									{labSetupBlocks}
								</View>
								<View style={[styles.splitPane, styles.splitPaneWork]}>
									<OMText variant="caption" style={styles.columnKicker}>
										ASSAYS · OUTPUT
									</OMText>
									{labWorkBlocks}
								</View>
							</View>
						) : (
							<>
								{labSetupBlocks}
								{labWorkBlocks}
							</>
						)}

						<PrivacyFootnote />
						<FeedbackFooterButton />
					</ScrollView>
				</View>
				<RemoteIntentCard
					state={remoteIntent}
					onDismiss={dismissRemoteIntent}
					onFetch={fetchRemoteIntent}
					onResolveDependencies={resolveRemoteDependencies}
				/>
				{sourceViewer ? (
					<SourceViewer viewer={sourceViewer} onClose={() => setSourceViewer(null)} />
				) : null}
			</SafeAreaView>
		</ThemeCtx.Provider>
	)
}

function IntentLaunchModalChrome({
	busyBackdrop,
	children,
	onBackdropDismiss,
}: {
	busyBackdrop: boolean
	children: ReactNode
	onBackdropDismiss: () => void
}) {
	const { styles } = useTheme()
	return (
		<View style={[styles.sourceOverlay, styles.intentModalLayer]}>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={busyBackdrop ? undefined : 'Close dialog'}
				disabled={busyBackdrop}
				onPress={busyBackdrop ? undefined : onBackdropDismiss}
				style={styles.sourceBackdrop}
			/>
			<View style={[styles.sourcePanel, styles.intentModalSheet]}>
				<ScrollView
					contentContainerStyle={styles.intentModalScrollContent}
					keyboardShouldPersistTaps="handled"
					nestedScrollEnabled
					style={styles.intentModalScroll}
				>
					{children}
				</ScrollView>
			</View>
		</View>
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

	let busyBackdrop = false
	let body: ReactNode = null

	if (state.status === 'pending' || state.status === 'resolving' || state.status === 'file-loading' || state.status === 'error') {
		const busy = state.status === 'resolving' || state.status === 'file-loading'
		busyBackdrop = busy
		const fileName = remoteLabFileName(state.intent.url)
		const fileKind = remoteLabFileKind(state.intent.url)
		const looksLikeFile = fileKind !== 'assay_python' && fileKind !== 'assay_yaml' && fileKind !== 'unknown'
		body = (
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
						? `BioVault will download ${fileName}, load it into the Lab, and try to cache it in this browser.`
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
	} else if (state.status === 'file-loaded') {
		body = (
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
	} else {
		const resource = state.resource
		const resolvingDeps = state.status === 'resolving-dependencies'
		const resolvedDeps = state.status === 'resolved' ? state.dependencies : []
		busyBackdrop = resolvingDeps
		body = (
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

	return (
		<IntentLaunchModalChrome busyBackdrop={busyBackdrop} onBackdropDismiss={onDismiss}>
			{body}
		</IntentLaunchModalChrome>
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

function LabExplorerSidebar({
	assayUrlCopied,
	assayUrlInput,
	cachedRemoteFiles,
	dragActive,
	onChooseGenomeFiles,
	onCopyShareAssayUrl,
	onLoadAssayUrl,
	onPickSample,
	onRemoveCachedRemote,
	onRemoveSavedHandle,
	onRestoreCachedRemote,
	onRestoreSavedHandle,
	onUrlInputChange,
	sampleBundles,
	sampleLoadError,
	sampleLoadingId,
	savedHandlesError,
	savedHandlesLoading,
	savedHandleGroups,
	shareAssayUrl,
}: {
	assayUrlCopied: boolean
	assayUrlInput: string
	cachedRemoteFiles: RemoteLabFile[]
	dragActive: boolean
	onChooseGenomeFiles: () => void
	onCopyShareAssayUrl: () => void
	onLoadAssayUrl: (url: string) => void
	sampleBundles: LabTestFileBundle[]
	sampleLoadError: string | null
	sampleLoadingId: string | null
	savedHandlesError: string | null
	savedHandlesLoading: boolean
	savedHandleGroups: SavedHandleGroup[]
	onPickSample: (bundle: LabTestFileBundle) => void
	onRemoveCachedRemote: (remoteFile: RemoteLabFile) => void
	onRemoveSavedHandle: (group: SavedHandleGroup) => void
	onRestoreCachedRemote: (remoteFile: RemoteLabFile) => void
	onRestoreSavedHandle: (group: SavedHandleGroup) => void
	onUrlInputChange: (url: string) => void
	shareAssayUrl: string
}) {
	const { styles } = useTheme()
	const hasPins = savedHandleGroups.length > 0 || cachedRemoteFiles.length > 0
	return (
		<View style={styles.labExplorerRoot}>
			<ScrollView
				showsVerticalScrollIndicator={Platform.OS !== 'web'}
				style={styles.labExplorerScroll}
				contentContainerStyle={styles.labExplorerScrollContent}
				keyboardShouldPersistTaps="handled"
			>
				<View testID="saved-local-files" style={styles.labExplorerSavedBlock}>
					<OMText variant="subtitle" style={styles.labExplorerSectionTitle}>
						My files
					</OMText>
					<OMText variant="caption" style={styles.labExplorerFolderHint}>
						Dropped folders only reopen after reload in Chromium (Chrome, Edge, Brave …). Cached URLs work in
						any browser.
					</OMText>
					{savedHandlesError ? (
						<View style={[styles.errorInlineBlock, styles.labExplorerErrorPad]}>
							<OMIcon name="alert-circle-outline" tone="danger" size={14} />
							<OMText variant="caption" style={styles.errorInline}>
								{savedHandlesError}
							</OMText>
						</View>
					) : null}
					<View style={styles.labExplorerList}>
						{!hasPins && !savedHandlesError ? (
							<OMText variant="caption" style={styles.labExplorerEmpty}>
								Nothing here yet.
							</OMText>
						) : null}
						{savedHandleGroups.map((group) => (
							<View key={group.id} testID="saved-local-file-row" style={styles.labExplorerPinnedRow}>
								<Pressable
									disabled={savedHandlesLoading}
									onPress={() => onRestoreSavedHandle(group)}
									style={[
										styles.labExplorerRowMain,
										savedHandlesLoading ? styles.labExplorerRowMainMuted : null,
									]}
								>
									<OMIcon name="folder-open-outline" tone="accent" size={15} />
									<View style={styles.labExplorerRowText}>
										<OMText
											testID="saved-local-file-title"
											variant="body"
											style={styles.labExplorerRowTitle}
											numberOfLines={1}
										>
											{group.label}
										</OMText>
										<OMText
											testID="saved-local-file-meta"
											variant="caption"
											style={styles.labExplorerRowMeta}
											numberOfLines={2}
										>
											{group.summary} · {group.rows.length} persisted{' '}
											{group.rows.length === 1 ? 'file' : 'files'}
										</OMText>
									</View>
								</Pressable>
								<Pressable
									disabled={savedHandlesLoading}
									onPress={() => onRemoveSavedHandle(group)}
									style={[
										styles.labExplorerRowGhostHit,
										savedHandlesLoading ? styles.labExplorerRowGhostMuted : null,
									]}
									hitSlop={6}
									accessibilityLabel={`Forget saved group ${group.label}`}
								>
									<OMIcon name="trash-outline" tone="muted" size={14} />
								</Pressable>
							</View>
						))}
						{cachedRemoteFiles.map((remoteFile) => (
							<View
								key={remoteFile.sourceUrl}
								testID="saved-local-file-row"
								style={styles.labExplorerPinnedRow}
							>
								<Pressable
									disabled={savedHandlesLoading}
									onPress={() => onRestoreCachedRemote(remoteFile)}
									style={[
										styles.labExplorerRowMain,
										savedHandlesLoading ? styles.labExplorerRowMainMuted : null,
									]}
								>
									<OMIcon name="cloud-download-outline" tone="accent" size={15} />
									<View style={styles.labExplorerRowText}>
										<OMText
											testID="saved-local-file-title"
											variant="body"
											style={styles.labExplorerRowTitle}
											numberOfLines={1}
										>
											{remoteFile.file.name}
										</OMText>
										<OMText
											testID="saved-local-file-meta"
											variant="caption"
											style={styles.labExplorerRowMeta}
											numberOfLines={2}
										>
											Cached URL file · {remoteFile.fileKind} · {humanLabSize(remoteFile.file.size)}
										</OMText>
									</View>
								</Pressable>
								<Pressable
									disabled={savedHandlesLoading}
									onPress={() => onRemoveCachedRemote(remoteFile)}
									style={[
										styles.labExplorerRowGhostHit,
										savedHandlesLoading ? styles.labExplorerRowGhostMuted : null,
									]}
									hitSlop={6}
									accessibilityLabel={`Forget cached file ${remoteFile.file.name}`}
								>
									<OMIcon name="trash-outline" tone="muted" size={14} />
								</Pressable>
							</View>
						))}
					</View>
				</View>

				<View style={styles.labExplorerImportBlock}>
					<OMText variant="subtitle" style={styles.labExplorerSectionTitle}>
						Add data
					</OMText>
					<DropZone dragActive={dragActive} onChoose={onChooseGenomeFiles} />
					<UrlLoadBox
						narrow
						shareUrl={shareAssayUrl}
						shareUrlCopied={assayUrlCopied}
						urlInput={assayUrlInput}
						onCopyShareUrl={onCopyShareAssayUrl}
						onLoadUrl={onLoadAssayUrl}
						onUrlInputChange={onUrlInputChange}
					/>
				</View>

				<View style={[styles.labExplorerSavedBlock, styles.labExplorerSamplesBlock]}>
					<OMText variant="subtitle" style={styles.labExplorerSectionTitle}>
						Sample files
					</OMText>
					<View style={styles.labExplorerList}>
						{sampleBundles.map((bundle) => {
							const loading = sampleLoadingId === bundle.id
							const ctaLabel = loading ? 'Loading…' : bundle.remoteUrl ? 'Download' : 'Import'
							return (
								<Pressable
									key={bundle.id}
									disabled={loading}
									onPress={() => onPickSample(bundle)}
									style={[styles.labExplorerSampleRow, loading ? styles.labExplorerSampleRowMuted : null]}
								>
									<View style={styles.labExplorerSampleGlyph}>
										<OMIcon name="document-text-outline" tone="accent" size={14} />
									</View>
									<View style={styles.labExplorerRowText}>
										<OMText variant="body" style={styles.labExplorerRowTitle} numberOfLines={2}>
											{bundle.title}
										</OMText>
										<OMText variant="caption" style={styles.labExplorerRowMeta} numberOfLines={2}>
											{ASSAY_INPUT_FORMAT_LABELS[bundle.format]} · {bundle.description}
										</OMText>
									</View>
									<OMText variant="caption" style={styles.labExplorerSampleCta}>
										{ctaLabel}
									</OMText>
								</Pressable>
							)
						})}
					</View>
					{sampleLoadError ? (
						<OMText variant="caption" style={[styles.errorInline, styles.labExplorerSampleError]}>
							{sampleLoadError}
						</OMText>
					) : null}
				</View>
			</ScrollView>
		</View>
	)
}

// === Drop zone (sidebar explorer only) =====================================

function DropZone({ dragActive, onChoose }: { dragActive: boolean; onChoose: () => void }) {
	const { styles, palette } = useTheme()
	return (
		<Pressable
			onPress={onChoose}
			style={[styles.explorerDropPanel, dragActive ? styles.explorerDropPanelActive : null]}
		>
			<PlatformSvgUri uri={microscopeIconUri} width={32} height={32} color={palette.accentStrong} />
			<OMText variant="headline" style={styles.explorerDropTitle}>
				Drop a genome
			</OMText>
			<OMText variant="body" style={styles.explorerDropBody}>
				Runs locally. Nothing is uploaded.
			</OMText>
			<OMText variant="caption" style={styles.explorerDropStat}>
				An mpileup on a 17 GB CRAM takes about 1.3 seconds.
			</OMText>
			<View style={styles.explorerDropButton}>
				<OMText variant="subtitle" style={styles.primaryButtonText}>
					Choose files
				</OMText>
			</View>
			<OMText variant="caption" style={styles.explorerDropHint}>
				{'.cram · .vcf.gz · .zip · 23andMe-style .txt. Companion files (.crai, .fa, .fa.fai, .tbi) are paired automatically.'}
			</OMText>
		</Pressable>
	)
}

function UrlLoadBox({
	narrow,
	onCopyShareUrl,
	onLoadUrl,
	onUrlInputChange,
	shareUrl,
	shareUrlCopied,
	urlInput,
}: {
	narrow?: boolean
	onCopyShareUrl: () => void
	onLoadUrl: (url: string) => void
	onUrlInputChange: (url: string) => void
	shareUrl: string
	shareUrlCopied: boolean
	urlInput: string
}) {
	const { palette, styles } = useTheme()
	const placeholder = narrow
		? 'GitHub raw, assay URL, genome zip…'
		: 'Paste a GitHub/raw assay, panel, genome ZIP, or genotype URL…'
	return (
		<View style={[styles.urlLoadBox, narrow ? styles.urlLoadBoxSidebar : null]}>
			<View style={styles.urlLoadHeader}>
				<OMIcon name="link-outline" tone="accent" size={16} />
				<OMText variant="caption" style={styles.urlLoadTitle}>
					Or load from URL
				</OMText>
			</View>
			<View style={[styles.urlLoadRow, narrow ? styles.urlLoadRowSidebar : null]}>
				<TextInput
					value={urlInput}
					onChangeText={onUrlInputChange}
					placeholder={placeholder}
					placeholderTextColor={palette.textFaint}
					style={[styles.urlLoadInput, narrow ? styles.urlLoadInputSidebar : null]}
					autoCapitalize="none"
					autoCorrect={false}
					keyboardType="url"
					returnKeyType="go"
					onSubmitEditing={() => onLoadUrl(urlInput)}
				/>
				<Pressable
					onPress={() => onLoadUrl(urlInput)}
					disabled={!urlInput.trim()}
					style={[
						urlInput.trim() ? styles.urlLoadButton : styles.urlLoadButtonDisabled,
						narrow ? styles.urlLoadButtonSidebar : null,
					]}
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
					<Pressable
						onPress={onCopyShareUrl}
						style={[styles.intentSecondaryButton, narrow ? styles.urlShareButtonSidebar : null]}
					>
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

function GenomeCard({ genome, onClear }: { genome: LabGenomeRef; onClear: () => void }) {
	const { styles, mutedIconTone } = useTheme()
	const complete = isLabGenomeComplete(genome)
	const missing = missingLabGenomeSlots(genome)
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
						{labGenomeDisplayName(genome)}
					</OMText>
					<OMText variant="caption" style={styles.loadedRowMeta}>
						{labGenomeKindLabel(genome)} · {humanLabSize(labGenomeBytesTotal(genome))}
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

function SlotChip({ file, label }: { file?: LabFileRef; label: string }) {
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
	genome: LabGenomeRef
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
				{isLabGenomeComplete(genome)
					? 'Pick an assay to run on this genome.'
					: `Complete this genome first: ${missingLabGenomeSlots(genome).join(' · ')}`}
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
					{[...categories]
						.sort((a, b) => {
							// Surface Panels first; everything else keeps its
							// catalog order. "All" (null) is appended last.
							if (a === 'panel') return -1
							if (b === 'panel') return 1
							return 0
						})
						.map((c) => (
							<CategoryChip
								key={c}
								label={ASSAY_CATEGORY_LABELS[c]}
								active={category === c}
								onPress={() => onCategoryChange(category === c ? null : c)}
							/>
						))}
					<CategoryChip
						label="All"
						active={category === null}
						onPress={() => onCategoryChange(null)}
					/>
				</View>
			) : null}

			{results.length === 0 ? (
				<OMText variant="caption" style={styles.mutedHint}>
					No assays match this search. Try clearing filters or search text.
				</OMText>
			) : (
				<View style={styles.pickerList}>
						{results.map((assay, index) => {
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
								: getLabRunDisabledReasonForRef(genome, assay.language)
							: 'Assay is not compatible with this genome format.'
						const isRunning = runningAssayId === assay.id
						const disabled = anyRunning || !compatible || waitingForRuntime || (isPanel && !panelVariants.length)
							return (
								<Pressable
									key={`${assay.id}-${index}`}
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
	const { trackEvent } = useAnalytics({ includeRouteParams: false, trackAppState: false, trackScreenView: false })
	const { assay, result } = record
	const [resultOpen, setResultOpen] = useState(false)
	const artifactCount = result.status === 'done' ? result.artifacts?.length ?? 0 : 0
	const openResult = useCallback(() => {
		if (result.status === 'done') {
			trackEvent('lab_report_opened', {
				...assayAnalyticsProperties(assay),
				artifactCount,
				artifactNames: (result.artifacts ?? []).map((artifact) => artifact.name),
				htmlReportName: htmlArtifactForResult(result)?.name ?? '',
				resultStatus: result.status,
			})
		}
		setResultOpen(true)
	}, [artifactCount, assay, result, trackEvent])
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
				{result.status === 'done' && artifactCount > 0 ? (
					<Pressable
						accessibilityRole="button"
						onPress={openResult}
						style={styles.textButton}
					>
						<OMText variant="subtitle" style={styles.textButtonText}>
							View result
						</OMText>
					</Pressable>
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

			{result.status === 'done' ? (
				artifactCount > 0 ? (
					<OMText variant="caption" style={styles.runCardHint}>
						{artifactCount} result artifact{artifactCount === 1 ? '' : 's'} saved locally.
					</OMText>
				) : (
					<OMText variant="caption" style={styles.runCardHint}>
						No rust HTML report. Load the assay/panel as a package zip — every run must go through `bioscript report`.
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

			{resultOpen ? (
				<ResultViewer record={record} onClose={() => setResultOpen(false)} />
			) : null}
		</View>
	)
}

function ResultViewer({ record, onClose }: { record: RunRecord; onClose: () => void }) {
	const { trackEvent } = useAnalytics({ includeRouteParams: false, trackAppState: false, trackScreenView: false })
	const { result, assay } = record
	const html = result.status === 'done' ? htmlArtifactForResult(result) : null
	const artifacts = result.status === 'done' ? result.artifacts ?? [] : []
	// Use a blob URL instead of srcDoc so in-document hash navigation
	// (the rust report's #observations / #analysis anchors) works correctly.
	const [htmlBlobUrl, setHtmlBlobUrl] = useState<string | null>(null)
	useEffect(() => {
		if (!html) {
			setHtmlBlobUrl(null)
			return
		}
		const url = URL.createObjectURL(new Blob([html.text], { type: 'text/html' }))
		setHtmlBlobUrl(url)
		return () => URL.revokeObjectURL(url)
	}, [html])
	const openInNewTab = useCallback(() => {
		if (!htmlBlobUrl) return
		trackEvent('lab_report_opened_new_window', {
			...assayAnalyticsProperties(assay),
			artifactCount: artifacts.length,
			htmlReportName: html?.name ?? '',
		})
		window.open(htmlBlobUrl, '_blank', 'noopener,noreferrer')
	}, [artifacts.length, assay, html?.name, htmlBlobUrl, trackEvent])
	// Portal to document.body so the fixed-position overlay escapes the
	// ScrollView's stacking context.
	return createPortal(createElement('div', {
		style: {
			alignItems: 'center',
			background: 'rgba(15, 23, 42, 0.55)',
			bottom: 0,
			display: 'flex',
			justifyContent: 'center',
			left: 0,
			padding: 24,
			position: 'fixed',
			right: 0,
			top: 0,
			zIndex: 60,
		},
		onClick: (event: { target: unknown; currentTarget: unknown }) => {
			if (event.target === event.currentTarget) onClose()
		},
		children: createElement('div', {
			style: {
				background: '#fff',
				borderRadius: 12,
				boxShadow: '0 24px 64px rgba(15,23,42,0.4)',
				display: 'flex',
				flexDirection: 'column',
				height: '92vh',
				maxWidth: 1280,
				overflow: 'hidden',
				width: '100%',
			},
			children: [
				createElement('div', {
					key: 'head',
					style: {
						alignItems: 'center',
						borderBottom: '1px solid #d8dee6',
						display: 'flex',
						gap: 12,
						padding: '12px 16px',
					},
					children: [
						createElement('div', {
							key: 'title',
							style: { flex: 1, fontFamily: 'system-ui, sans-serif', fontSize: 14, fontWeight: 600 },
							children: `RESULT — ${assay.title}`,
						}),
						htmlBlobUrl ? createElement('button', {
							key: 'open',
							onClick: openInNewTab,
							style: {
								background: '#fff',
								border: '1px solid #cbd5df',
								borderRadius: 6,
								color: '#1f2933',
								cursor: 'pointer',
								fontFamily: 'system-ui, sans-serif',
								fontSize: 12,
								padding: '6px 12px',
							},
							children: 'Open in new tab',
						}) : null,
						createElement('button', {
							key: 'close',
							onClick: onClose,
							style: {
								background: '#1f2933',
								border: 'none',
								borderRadius: 6,
								color: '#fff',
								cursor: 'pointer',
								fontFamily: 'system-ui, sans-serif',
								fontSize: 12,
								padding: '6px 12px',
							},
							children: 'Close',
						}),
					],
				}),
				artifacts.length > 0
					? createElement(ArtifactLinks, { key: 'artifacts', artifacts, record })
					: null,
				html && htmlBlobUrl
					? createElement('div', {
							key: 'frame',
							style: { flex: 1, padding: '0 12px 12px' },
							children: createElement('iframe', {
								src: htmlBlobUrl,
								title: html.name,
								sandbox: 'allow-scripts allow-same-origin',
								style: {
									background: '#fff',
									border: '1px solid #cbd5df',
									borderRadius: 6,
									height: '100%',
									width: '100%',
								},
							}),
						})
					: createElement('div', {
							key: 'empty',
							style: {
								color: '#475467',
								fontFamily: 'system-ui, sans-serif',
								fontSize: 12,
								padding: 16,
							},
							children: 'No rust HTML report. Load the assay/panel as a package zip.',
						}),
			],
		}),
	}), document.body)
}

function ClearAllButton() {
	const [confirming, setConfirming] = useState(false)
	const [busy, setBusy] = useState(false)
	const onClick = useCallback(() => setConfirming(true), [])
	const onCancel = useCallback(() => setConfirming(false), [])
	const onConfirm = useCallback(async () => {
		setBusy(true)
		try {
			await clearAllAppStorage()
		} finally {
			window.location.reload()
		}
	}, [])
	return createElement('div', {
		children: [
			createElement('button', {
				key: 'btn',
				onClick,
				style: {
					background: '#fff',
					border: '1px solid #cbd5df',
					borderRadius: 6,
					color: '#1f2933',
					cursor: 'pointer',
					fontFamily: 'system-ui, sans-serif',
					fontSize: 12,
					padding: '6px 12px',
				},
				children: 'Clear all',
			}),
			confirming
				? createPortal(createElement('div', {
						key: 'modal',
						style: {
							alignItems: 'center',
							background: 'rgba(15, 23, 42, 0.55)',
							bottom: 0,
							display: 'flex',
							justifyContent: 'center',
							left: 0,
							position: 'fixed',
							right: 0,
							top: 0,
							zIndex: 70,
						},
						onClick: (event: { target: unknown; currentTarget: unknown }) => {
							if (!busy && event.target === event.currentTarget) onCancel()
						},
						children: createElement('div', {
							style: {
								background: '#fff',
								borderRadius: 12,
								boxShadow: '0 24px 64px rgba(15,23,42,0.4)',
								maxWidth: 420,
								padding: 24,
								width: '100%',
							},
							children: [
								createElement('div', {
									key: 'title',
									style: { fontFamily: 'system-ui, sans-serif', fontSize: 16, fontWeight: 700, marginBottom: 8 },
									children: 'Clear all stored data?',
								}),
								createElement('div', {
									key: 'body',
									style: {
										color: '#475467',
										fontFamily: 'system-ui, sans-serif',
										fontSize: 13,
										lineHeight: 1.4,
										marginBottom: 16,
									},
									children:
										'This wipes cached remote resources, package releases, persisted file handles, and remote-file blobs from this browser. The page will reload and re-fetch wasm/JS bundles. This cannot be undone.',
								}),
								createElement('div', {
									key: 'actions',
									style: { display: 'flex', gap: 8, justifyContent: 'flex-end' },
									children: [
										createElement('button', {
											key: 'cancel',
											onClick: onCancel,
											disabled: busy,
											style: {
												background: '#fff',
												border: '1px solid #cbd5df',
												borderRadius: 6,
												color: '#1f2933',
												cursor: busy ? 'default' : 'pointer',
												fontFamily: 'system-ui, sans-serif',
												fontSize: 12,
												padding: '6px 12px',
											},
											children: 'Cancel',
										}),
										createElement('button', {
											key: 'confirm',
											onClick: onConfirm,
											disabled: busy,
											style: {
												background: '#c53b3b',
												border: 'none',
												borderRadius: 6,
												color: '#fff',
												cursor: busy ? 'default' : 'pointer',
												fontFamily: 'system-ui, sans-serif',
												fontSize: 12,
												fontWeight: 600,
												padding: '6px 12px',
											},
											children: busy ? 'Clearing…' : 'Clear all',
										}),
									],
								}),
							],
						}),
					}), document.body)
				: null,
		],
	})
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
			) : (
				// `runPackageReportBytes` is a single opaque wasm call so we don't
				// know how many variants are left. Show an indeterminate animated
				// bar instead of nothing so users know work is happening.
				<IndeterminateProgressBar accent={palette.accent} />
			)}
		</View>
	)
}

function IndeterminateProgressBar({ accent }: { accent: string }) {
	return createElement('div', {
		style: {
			background: 'transparent',
			borderRadius: 999,
			height: 6,
			marginTop: 6,
			overflow: 'hidden',
			position: 'relative',
			width: '100%',
		},
		children: [
			createElement('style', {
				key: 'kf',
				children: '@keyframes biovault-indeterm{0%{left:-40%;width:40%}50%{left:30%;width:50%}100%{left:100%;width:30%}}',
			}),
			createElement('div', {
				key: 'track',
				style: {
					background: 'rgba(0,0,0,0.06)',
					borderRadius: 999,
					height: '100%',
					left: 0,
					position: 'absolute',
					right: 0,
					top: 0,
				},
			}),
			createElement('div', {
				key: 'fill',
				style: {
					animation: 'biovault-indeterm 1.6s ease-in-out infinite',
					background: accent,
					borderRadius: 999,
					height: '100%',
					position: 'absolute',
					top: 0,
				},
			}),
		],
	})
}

function htmlArtifactForResult(result: RunResult): LabRunArtifact | null {
	const list = result.artifacts ?? []
	const htmls = list.filter((a) => a.mimeType === 'text/html' || a.name.toLowerCase().endsWith('.html'))
	const named = htmls.find((a) => {
		const path = (a.path ?? '').toLowerCase()
		return a.name.toLowerCase() === 'index.html' || path === 'index.html' || path.endsWith('/index.html')
	})
	return named ?? htmls[0] ?? null
}

function ArtifactLinks({ artifacts, record }: { artifacts: LabRunArtifact[]; record: RunRecord }) {
	const { trackEvent } = useAnalytics({ includeRouteParams: false, trackAppState: false, trackScreenView: false })
	return createElement('div', {
		style: { display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 12px' },
		children: [
			createElement('div', {
				key: 'kicker',
				style: {
					color: '#475467',
					fontFamily: 'system-ui, sans-serif',
					fontSize: 11,
					fontWeight: 700,
					letterSpacing: 1,
				},
				children: 'ARTIFACTS',
			}),
			createElement('div', {
				key: 'row',
				style: { display: 'flex', flexWrap: 'wrap', gap: 8 },
				children: artifacts.map((artifact, index) => {
					const blob = new Blob([artifact.text], { type: artifact.mimeType || 'application/octet-stream' })
					const href = URL.createObjectURL(blob)
					return createElement('a', {
						key: `${artifact.path ?? artifact.name}-${index}`,
						href,
						download: artifact.name,
						onClick: () => {
							trackEvent('lab_report_artifact_downloaded', {
								...assayAnalyticsProperties(record.assay),
								artifactIndex: index,
								artifactMimeType: artifact.mimeType ?? '',
								artifactName: artifact.name,
								artifactPath: artifact.path ?? '',
							})
						},
						style: {
							padding: '4px 10px',
							border: '1px solid #cbd5df',
							borderRadius: 6,
							background: '#fff',
							color: '#1f2933',
							fontSize: 12,
							textDecoration: 'none',
							fontFamily: 'system-ui, sans-serif',
						},
						children: artifact.name,
					})
				}),
			}),
		],
	})
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

const CONTACT_EMAIL = 'contact@biovault.net'

function openContactEmail(source: 'header' | 'footer') {
	getAnalytics()?.trackEvent('lab_contact_clicked', { source })
	if (typeof window === 'undefined') return
	const url = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Biovault Lab — feedback / feature request')}`
	window.location.href = url
}

const GITHUB_URL = 'https://github.com/openmined/biovault-app'

function openGithub() {
	getAnalytics()?.trackEvent('lab_github_clicked', { url: GITHUB_URL })
	if (typeof window === 'undefined') return
	window.open(GITHUB_URL, '_blank', 'noopener,noreferrer')
}

function GithubButton({ scheme }: { scheme: 'light' | 'dark' }) {
	const { styles } = useTheme()
	return (
		<Pressable
			onPress={() => openGithub()}
			hitSlop={8}
			style={[
				styles.webThemeButton,
				scheme === 'light' ? styles.webThemeButtonLight : styles.webThemeButtonDark,
			]}
			accessibilityRole="link"
			accessibilityLabel="View Biovault on GitHub"
		>
			<View pointerEvents="none" style={styles.webThemeButtonIcon}>
				<OMIcon name="logo-github" size={16} tone="accent" />
			</View>
			<View pointerEvents="none">
				<OMText
					variant="caption"
					style={[
						styles.webThemeButtonText,
						scheme === 'light' ? styles.webThemeButtonTextLight : styles.webThemeButtonTextDark,
					]}
				>
					GitHub
				</OMText>
			</View>
		</Pressable>
	)
}

function ContactButton({ scheme }: { scheme: 'light' | 'dark' }) {
	const { styles } = useTheme()
	return (
		<Pressable
			onPress={() => openContactEmail('header')}
			hitSlop={8}
			style={[
				styles.webThemeButton,
				scheme === 'light' ? styles.webThemeButtonLight : styles.webThemeButtonDark,
			]}
			accessibilityRole="link"
			accessibilityLabel={`Contact: ${CONTACT_EMAIL}`}
		>
			<View pointerEvents="none" style={styles.webThemeButtonIcon}>
				<OMIcon name="mail-outline" size={16} tone="accent" />
			</View>
			<View pointerEvents="none">
				<OMText
					variant="caption"
					style={[
						styles.webThemeButtonText,
						scheme === 'light' ? styles.webThemeButtonTextLight : styles.webThemeButtonTextDark,
					]}
				>
					Contact
				</OMText>
			</View>
		</Pressable>
	)
}

function FeedbackFooterButton() {
	const { styles, mutedIconTone } = useTheme()
	return (
		<Pressable
			onPress={() => openContactEmail('footer')}
			style={styles.feedbackFooter}
			accessibilityRole="link"
			accessibilityLabel={`Feedback or request a feature — email ${CONTACT_EMAIL}`}
		>
			<OMIcon name="mail-outline" tone={mutedIconTone} size={14} />
			<OMText variant="caption" style={styles.feedbackFooterText}>
				Feedback or Request a Feature
			</OMText>
			<OMText variant="caption" style={styles.feedbackFooterEmail}>
				{CONTACT_EMAIL}
			</OMText>
		</Pressable>
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
			paddingHorizontal: omSpacing.xxxl,
			paddingTop: omSpacing.xl,
			paddingBottom: omSpacing.xxxxl,
			maxWidth: 1440,
			width: '100%',
			alignSelf: 'center',
			gap: omSpacing.l,
		},
		stack: { gap: omSpacing.s },
		siteHeader: {
			width: '100%',
			paddingBottom: omSpacing.l,
			marginBottom: omSpacing.m,
			borderBottomWidth: StyleSheet.hairlineWidth,
			borderBottomColor: p.border,
		},
		heroRow: {
			flexDirection: 'row',
			alignItems: 'flex-start',
			justifyContent: 'space-between',
			gap: omSpacing.xl,
			flexWrap: 'wrap',
		},
		heroTextBlock: {
			flexGrow: 1,
			flexShrink: 1,
			minWidth: 240,
			maxWidth: 720,
			gap: omSpacing.s,
		},
		heroEyebrow: {
			color: p.accentStrong,
			letterSpacing: 1.4,
		},
		heroTitle: {
			color: p.text,
		},
		heroLead: {
			lineHeight: 24,
			marginTop: 2,
			maxWidth: 560,
		},
		headerTools: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: 8,
			flexShrink: 0,
			flexWrap: 'wrap',
		},

		columnKicker: {
			color: p.textFaint,
			letterSpacing: 1.4,
			marginBottom: omSpacing.s,
		},
		splitRow: {
			width: '100%',
			flexDirection: 'row',
			alignItems: 'flex-start',
			gap: omSpacing.xxxl,
		},
		splitPane: {
			minWidth: 0,
		},
		splitPanePrimary: {
			flexGrow: 0,
			flexShrink: 0,
			flexBasis: 392,
			width: '100%',
			maxWidth: 480,
		},
		splitPaneWork: {
			flexGrow: 1,
			flexShrink: 1,
			flexBasis: 0,
			minWidth: 320,
		},
		workspaceShell: {
			flex: 1,
			flexDirection: 'row',
			alignItems: 'stretch',
			minHeight: 0,
		},
		mainWorkspaceScroll: {
			flex: 1,
			minWidth: 0,
		},
		labExplorerRoot: {
			width: LAB_EXPLORER_PANEL_WIDTH,
			flexShrink: 0,
			flexGrow: 0,
			backgroundColor: p.surfaceSolid,
			borderRightWidth: StyleSheet.hairlineWidth,
			borderRightColor: p.border,
		},
		labExplorerScroll: { flex: 1 },
		labExplorerScrollContent: {
			paddingHorizontal: omSpacing.m,
			paddingTop: omSpacing.l,
			paddingBottom: omSpacing.xxxl,
			gap: omSpacing.xl,
		},
		labExplorerSavedBlock: {},
		labExplorerSectionTitle: {
			color: p.text,
			fontWeight: '600',
			fontSize: 15,
		},
		labExplorerFolderHint: {
			color: p.textMuted,
			lineHeight: 18,
			marginTop: omSpacing.xs,
			marginBottom: omSpacing.s,
		},
		labExplorerErrorPad: {
			marginBottom: omSpacing.s,
		},
		labExplorerList: {
			gap: 4,
		},
		labExplorerImportBlock: {
			gap: omSpacing.m,
			marginTop: omSpacing.xs,
		},
		labExplorerSamplesBlock: {
			marginTop: omSpacing.xs,
		},
		labExplorerEmpty: {
			color: p.textFaint,
			lineHeight: 18,
			paddingVertical: omSpacing.xs,
		},
		labExplorerPinnedRow: {
			flexDirection: 'row',
			alignItems: 'center',
			borderRadius: omRadius.m,
			backgroundColor: p.surfaceRaised,
			overflow: 'hidden',
			minHeight: 44,
			borderWidth: StyleSheet.hairlineWidth,
			borderColor: p.border,
		},
		labExplorerRowMain: {
			flex: 1,
			flexDirection: 'row',
			alignItems: 'center',
			gap: 10,
			paddingVertical: 10,
			paddingLeft: omSpacing.m,
			paddingRight: 4,
			minWidth: 0,
			cursor: 'pointer',
			userSelect: 'none',
			WebkitTapHighlightColor: 'transparent',
		} as object,
		labExplorerRowMainMuted: {
			opacity: 0.52,
		},
		labExplorerRowText: {
			flex: 1,
			minWidth: 0,
			gap: 2,
		},
		labExplorerRowTitle: {
			color: p.text,
			fontWeight: '500',
		},
		labExplorerRowMeta: {
			color: p.textMuted,
			lineHeight: 16,
		},
		labExplorerRowGhostHit: {
			alignSelf: 'stretch',
			justifyContent: 'center',
			paddingHorizontal: omSpacing.m,
			cursor: 'pointer',
			WebkitTapHighlightColor: 'transparent',
		} as object,
		labExplorerRowGhostMuted: {
			opacity: 0.4,
		},
		labExplorerSampleRow: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: 10,
			paddingVertical: omSpacing.m,
			paddingHorizontal: omSpacing.m,
			borderRadius: omRadius.m,
			borderWidth: StyleSheet.hairlineWidth,
			borderColor: p.border,
			backgroundColor: p.surface,
			cursor: 'pointer',
			userSelect: 'none',
			WebkitTapHighlightColor: 'transparent',
		} as object,
		labExplorerSampleRowMuted: {
			opacity: 0.52,
		},
		labExplorerSampleGlyph: {
			width: 30,
			height: 30,
			borderRadius: omRadius.m,
			backgroundColor: p.accentSoft,
			alignItems: 'center',
			justifyContent: 'center',
		},
		labExplorerSampleCta: {
			color: p.accentStrong,
			fontWeight: '600',
			flexShrink: 0,
		},
		labExplorerSampleError: {
			marginTop: omSpacing.xs,
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

		// Sidebar genome drop panel (formerly main-column hero zone)
		explorerDropPanel: {
			alignSelf: 'stretch',
			alignItems: 'center',
			gap: omSpacing.s,
			paddingVertical: omSpacing.xl,
			paddingHorizontal: omSpacing.m,
			borderRadius: omRadius.l,
			borderWidth: 2,
			borderStyle: 'dashed',
			borderColor: p.accentBorder,
			backgroundColor: p.accentTint,
			cursor: 'pointer',
			userSelect: 'none',
			WebkitTapHighlightColor: 'transparent',
		} as object,
		explorerDropPanelActive: {
			borderColor: p.accent,
			backgroundColor: p.accentSoft,
		},
		explorerDropTitle: {
			color: p.text,
			textAlign: 'center',
			fontSize: 17,
		},
		explorerDropBody: {
			color: p.text,
			textAlign: 'center',
			lineHeight: 20,
		},
		explorerDropStat: {
			color: p.textMuted,
			textAlign: 'center',
			lineHeight: 18,
			paddingHorizontal: omSpacing.xs,
		},
		explorerDropButton: {
			marginTop: omSpacing.xs,
			paddingHorizontal: omSpacing.xl,
			paddingVertical: omSpacing.m,
			borderRadius: omRadius.full,
			backgroundColor: p.accent,
			borderWidth: 1,
			borderColor: p.accentBorder,
		},
		explorerDropHint: {
			color: p.textFaint,
			textAlign: 'center',
			lineHeight: 18,
			marginTop: omSpacing.xs,
			alignSelf: 'stretch',
			paddingHorizontal: 2,
			fontSize: 11,
		},

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
		urlLoadBoxSidebar: {
			paddingHorizontal: omSpacing.s,
			paddingVertical: omSpacing.m,
			backgroundColor: p.surfaceRaised,
			borderRadius: omRadius.m,
		},
		urlLoadRowSidebar: {
			flexDirection: 'column',
			alignItems: 'stretch',
			gap: omSpacing.xs,
		},
		urlLoadInputSidebar: {
			flexGrow: 0,
			width: '100%',
			alignSelf: 'stretch',
			minHeight: 40,
			fontSize: 13,
		} as object,
		urlLoadButtonSidebar: {
			alignSelf: 'stretch',
			alignItems: 'center',
			justifyContent: 'center',
			width: '100%',
		},
		urlShareButtonSidebar: {
			alignSelf: 'stretch',
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
		intentModalLayer: {
			zIndex: 55,
		},
		intentModalSheet: {
			maxWidth: 620,
			width: '100%',
		},
		intentModalScroll: {
			...(Platform.OS === 'web'
				? ({ maxHeight: '82vh', width: '100%' } as object)
				: { maxHeight: 620, width: '100%' }),
		},
		intentModalScrollContent: {
			padding: omSpacing.m,
			paddingBottom: omSpacing.xl,
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
		feedbackFooter: {
			flexDirection: 'row',
			alignItems: 'center',
			justifyContent: 'center',
			gap: omSpacing.xs,
			marginTop: omSpacing.xs,
			paddingVertical: omSpacing.s,
			cursor: 'pointer',
			userSelect: 'none',
			WebkitTapHighlightColor: 'transparent',
		} as object,
		feedbackFooterText: { color: p.text },
		feedbackFooterEmail: { color: p.accentStrong },

		// drag overlay
		dragOverlay: {
			position: 'fixed' as never,
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
