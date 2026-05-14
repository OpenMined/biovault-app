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
	getCachedGeneratedIndexFile,
	getCachedGeneratedVcfIndexFile,
	putCachedGeneratedIndexFile,
	putCachedGeneratedVcfIndexFile,
} from '@/lib/lab/generated-index-cache'
import {
	ASSAY_CATEGORY_LABELS,
	ASSAY_INPUT_FORMAT_LABELS,
	type AssayCategory,
	getAssayById,
	type LabAssay,
	LAB_ASSAYS,
	LAB_TEST_FILES,
	type LabTestFileBundle,
	loadAssayFile,
	loadTestFileBundle,
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
import { runLabAssayRef, runLabPackageReportRef } from '@/lib/lab/runner'
import {
	createLabAssayRef,
	createLabGenomeRefFromPrimary,
	pairLabGenomeCompanionRef,
	type LabGenomeRef,
} from '@/lib/lab/core/refs'
import { clearAllAppStorage } from '@/lib/clear-app-storage'
import {
	addAssayPackageSourceUrl,
	listAssayPackageSourceUrls,
	removeAssayPackageSourceUrl,
} from '@/lib/assay-package-url-registry'
import {
	deleteRemoteResourceCache,
	listCachedRemotePackages,
	listResolvedCachedRemotePackages,
	listResolvedCachedRemoteResources,
	resolveRemotePackage,
	resolveRemoteResource,
	resourceKindLabel,
	type ResolvedRemoteResource,
} from '@/lib/remote-resource-resolver'
import { getCachedRemoteResource } from '@/lib/remote-resource-cache'
import {
	listAssays as registryListAssays,
	listPanels as registryListPanels,
	resolvePackageForRun,
	upsertAssay as registryUpsertAssay,
	upsertPanel as registryUpsertPanel,
	type RegistryPanel,
	type RegistryOrigin,
} from '@/lib/lab/assay-registry'
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
import {
	generateBamBaiFile,
	generateCramCraiFile,
	generateFastaFaiFile,
	generateVcfTbiFile,
	inspectBytes,
	resolvePackageZipBytes,
	warmupMontyRuntime,
	type BioscriptInspection,
	type BioscriptPackageFile,
	type BioscriptPackageResource,
} from '@/modules/expo-bioscript'
import { omRadius, omSpacing } from '@/styles/brand'
import { LAB_LANDING_PAGE_FILL, labPalettes, type LabPalette } from '@/styles/lab-theme'
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
/** Shared horizontal inset + header band so explorer and main column line up. */
const LAB_COLUMN_GUTTER_X = omSpacing.l
/** Wide browser layout: genome setup left, assays + runs right */
const LAB_WIDE_TWO_COL_MIN = 1100
const LAB_SIDEBAR_DRAWER_MAX = 920
const LAB_COMPACT_HEADER_MAX = 700
const LAB_COLUMN_HEAD_PAD_Y = omSpacing.l
const LAB_CHROME_HEADER_HEIGHT = 136
const LAB_CHROME_FOOTER_HEIGHT = 64
const LAB_GETTING_STARTED_SECTION_GAP = omSpacing.xxxl
const LAB_GETTING_STARTED_VIDEO_EMBED_URL = 'https://www.youtube.com/embed/54oRjs2AcJY'
const FEATURED_CATALOG: LabAssay[] = [
	{
		id: 'featured-pgx-1',
		title: 'PGx-1 Panel',
		subtitle: 'BioScript package',
		description: 'A pharmacogenomics panel covering ~30 variants spanning APOE, MTHFR, CYP2C, BCHE, and more.',
		category: 'panel',
		language: 'yaml',
		url: 'https://github.com/madhavajay/exvitae/blob/main/assays/pgx/pgx-1/pgx-1.yaml',
		inputFormats: ['cram', 'vcf_gz', 'genotype_text', 'zip'],
		tags: ['pgx', 'panel', 'featured'],
	},
	{
		id: 'featured-apol1-risk',
		title: 'APOL1 Risk Assay',
		subtitle: 'BioScript package',
		description: 'APOL1 G1/G2 risk assay covering the defining APOL1 variant sites and derived risk genotype.',
		category: 'risk',
		language: 'yaml',
		url: 'https://github.com/madhavajay/exvitae/blob/main/assays/risk/APOL1/APOL1.yaml',
		inputFormats: ['cram', 'vcf_gz', 'genotype_text', 'zip'],
		tags: ['apol1', 'risk', 'assay', 'featured'],
	},
]

function clearWebLaunchIntentHash() {
	if (Platform.OS !== 'web' || !window.location.hash) return
	const nextUrl = `${window.location.pathname}${window.location.search}`
	window.history.replaceState(window.history.state, document.title, nextUrl)
}

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
type PendingVcfIndexRun = {
	assay: LabAssay
	error?: string
	genome: Extract<LabGenomeRef, { kind: 'vcf' }>
	status: 'confirm' | 'generating'
}
type PendingAlignmentIndexRun = {
	assay?: LabAssay
	error?: string
	genome: Extract<LabGenomeRef, { kind: 'cram' }>
	missing: ('alignment' | 'reference')[]
	status: 'confirm' | 'generating'
}
type SessionLabAssay = LabAssay & {
	analyticsAssayId?: string
	dependencyUrls: string[]
	file: File
	fileRef?: LabFileRef
	packageEntrypoint?: string
	packageFiles?: BioscriptPackageFile[]
	packageSourceUrl?: string
	remoteKind: ResolvedRemoteResource['kind']
	remoteSchema?: string | null
	registryId?: string | null
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

function generatedVcfIndexName(vcfName: string): string {
	return vcfName.toLowerCase().endsWith('.tbi') ? vcfName : `${vcfName}.tbi`
}

function generatedAlignmentIndexName(name: string): string {
	return name.toLowerCase().endsWith('.bam') ? `${name}.bai` : `${name}.crai`
}

function generatedFastaIndexName(name: string): string {
	return `${name}.fai`
}

function fileFromIndexBytes(bytes: Uint8Array, name: string): File {
	const indexBuffer = new ArrayBuffer(bytes.byteLength)
	new Uint8Array(indexBuffer).set(bytes)
	return new File([indexBuffer], name, {
		type: 'application/octet-stream',
		lastModified: Date.now(),
	})
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

function sortAssaysForPicker(assays: LabAssay[]): LabAssay[] {
	return [...assays].sort((left, right) => {
		const leftPanel = assayDisplayKind(left) === 'panel'
		const rightPanel = assayDisplayKind(right) === 'panel'
		if (leftPanel !== rightPanel) return leftPanel ? -1 : 1
		return left.title.localeCompare(right.title)
	})
}

function isSessionLabAssay(assay: LabAssay): assay is SessionLabAssay {
	return 'file' in assay && assay.file instanceof File
}

function assayDisplayKind(assay: LabAssay): 'assay' | 'panel' | 'variant' | 'other' {
	if (isSessionLabAssay(assay)) {
		if (assay.remoteKind === 'python') return 'other'
		const schema = assay.remoteSchema?.toLowerCase() ?? ''
		if (schema.startsWith('bioscript:panel')) return 'panel'
		if (schema.startsWith('bioscript:variant')) return 'variant'
		if (schema.startsWith('bioscript:assay:')) return 'assay'
		if (schema) return 'other'
		if (assay.remoteKind === 'panel') return 'panel'
		if (assay.remoteKind === 'variant') return 'variant'
		if (assay.remoteKind === 'assay') return 'assay'
		return 'other'
	}
	if (assay.category === 'panel') return 'panel'
	return 'assay'
}

function mergeAssayList(assays: LabAssay[]): LabAssay[] {
	// URLs that a session assay arrived via a package release for. Catalog
	// entries with matching `url` are hidden so the resolved package replaces
	// the example entry instead of doubling it.
	const claimedPackageSourceUrls = new Set<string>()
	const sessionPanelTitles = new Set<string>()
	const sessionUrls = new Set<string>()
	for (const assay of assays) {
		if (isSessionLabAssay(assay)) {
			if (assay.packageSourceUrl) claimedPackageSourceUrls.add(normalizeRemoteAssayUrl(assay.packageSourceUrl))
			if (assay.url) sessionUrls.add(normalizeRemoteAssayUrl(assay.url))
			if (assay.remoteKind === 'panel' && assay.title) sessionPanelTitles.add(assay.title)
		}
	}
	const byKey = new Map<string, LabAssay>()
	for (const assay of assays) {
		if (!isSessionLabAssay(assay) && assay.url) {
			const normalized = normalizeRemoteAssayUrl(assay.url)
			if (claimedPackageSourceUrls.has(normalized)) continue
			if (sessionUrls.has(normalized)) continue
			if (assay.category === 'panel' && sessionPanelTitles.has(assay.title)) continue
		}
		const key = assayStableKey(assay)
		byKey.set(key, assay)
	}
	return Array.from(byKey.values())
}

function assayStableKey(assay: LabAssay): string {
	if (isSessionLabAssay(assay)) {
		if (assay.remoteKind === 'panel') return `remote:panel:${assay.title}`
		return `remote:${assay.remoteKind}:${assay.title}`
	}
	if (assay.url) return `url:${normalizeRemoteAssayUrl(assay.url)}`
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

function genomeSidebarMeta(genome: LabGenomeRef): string {
	const base = `${labGenomeKindLabel(genome)} · ${humanLabSize(labGenomeBytesTotal(genome))}`
	if (isLabGenomeComplete(genome)) return base
	const missing = missingLabGenomeSlots(genome)
	if (missing.length === 1) return `${base} · Needs ${missing[0]}`
	return `${base} · Needs ${missing.length} files`
}

function cachedRemoteGenomeMeta(remoteFile: RemoteLabFile): string {
	const label = (() => {
		switch (remoteFile.fileKind) {
			case 'bam': return 'BAM alignment'
			case 'cram': return 'CRAM alignment'
			case 'vcf_gz': return 'VCF (bgzipped)'
			case 'genotype_text': return 'Genotype text'
			case 'zip': return 'Zipped genotype (23andMe etc.)'
			default: return remoteFile.fileKind.replace('_', ' ')
		}
	})()
	return `${label} · ${humanLabSize(remoteFile.file.size)}`
}

function safeGenomicExtension(name: string): string {
	const lower = name.toLowerCase()
	const knownExtensions = [
		'.vcf.gz.tbi',
		'.bam.bai',
		'.cram.crai',
		'.fasta.fai',
		'.fa.fai',
		'.vcf.gz',
		'.fasta',
		'.bam',
		'.bai',
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

function parentPanelsForAssay(assay: LabAssay, assays: SessionLabAssay[]): SessionLabAssay[] {
	if (!isSessionLabAssay(assay)) return []
	return assays.filter(
		(candidate) =>
			candidate.remoteKind === 'panel' &&
			candidate.dependencyUrls?.some((url) => url === assay.url),
	)
}

function relativePathFromBase(baseUrl: string, targetUrl: string): string {
	try {
		const base = new URL(baseUrl)
		const target = new URL(targetUrl)
		if (target.origin !== base.origin) {
			return target.pathname.split('/').pop() ?? 'resource'
		}
		const baseDir = base.pathname.split('/').slice(0, -1).join('/') + '/'
		if (target.pathname.startsWith(baseDir)) {
			return target.pathname.slice(baseDir.length)
		}
		return target.pathname.split('/').pop() ?? 'resource'
	} catch {
		return targetUrl.split('/').pop() ?? 'resource'
	}
}

async function buildSyntheticPackageFromAssay(
	assay: SessionLabAssay,
): Promise<{ entrypoint: string; files: BioscriptPackageFile[] }> {
	const assayContents = await assay.file.text()
	const baseUrl = assay.url
	const entrypoint = assay.file.name || (baseUrl.split('/').pop() ?? 'assay.yaml')
	const files: BioscriptPackageFile[] = [
		{ contents: assayContents, path: entrypoint, source_url: baseUrl },
	]
	const seen = new Set<string>([baseUrl])
	for (const depUrl of assay.dependencyUrls) {
		if (seen.has(depUrl)) continue
		seen.add(depUrl)
		const resource = await resolveRemoteResource(depUrl)
		files.push({
			contents: resource.contents,
			path: relativePathFromBase(baseUrl, depUrl),
			source_url: depUrl,
		})
	}
	return { entrypoint, files }
}

function sessionAssayPackageReady(assay: LabAssay, readyIds?: Set<string>): boolean {
	if (readyIds) {
		const kind = assayDisplayKind(assay)
		if (kind === 'panel' || kind === 'assay') {
			const session = isSessionLabAssay(assay) ? assay : null
			const registryId = session?.registryId
			if (registryId && readyIds.has(`${kind}:${registryId}`)) return true
		}
	}
	if (!isSessionLabAssay(assay)) return false
	if (assay.packageFiles?.length && assay.packageEntrypoint) return true
	return assay.dependencyUrls.length === 0
}

function sessionPackageLooksSynthetic(assay: SessionLabAssay, files: BioscriptPackageFile[] | undefined): boolean {
	if (!files?.length || !assay.dependencyUrls.length) return false
	return files.length <= assay.dependencyUrls.length + 1
}

function sessionAssayFromRegistryPanel(panel: RegistryPanel): SessionLabAssay | null {
	const entrypointFile = panel.files.find((file) => file.path === panel.entrypoint) ?? panel.files[0]
	if (!entrypointFile) return null
	return {
		id: `registry-panel-${panel.id}`,
		title: panel.title,
		subtitle: 'Cached package',
		description: panel.summary ?? 'Panel restored from cached package storage.',
		category: 'panel',
		language: entrypointFile.path.toLowerCase().endsWith('.py') ? 'python' : 'yaml',
		analyticsAssayId: `registry:${panel.id}`,
		url: panel.sourceUrl ?? panel.artifactUrl ?? `registry:${panel.id}`,
		inputFormats: ['cram', 'vcf_gz', 'genotype_text', 'zip'],
		tags: ['remote', 'panel', 'cached-package', ...(panel.version ? [`version:${panel.version}`] : [])],
		file: new File([entrypointFile.contents], entrypointFile.path, {
			type: entrypointFile.path.toLowerCase().endsWith('.py') ? 'text/x-python' : 'application/yaml',
		}),
		dependencyUrls: [],
		packageEntrypoint: panel.entrypoint,
		packageFiles: panel.files,
		packageSourceUrl: panel.sourceUrl ?? undefined,
		remoteKind: 'panel',
		remoteSchema: 'bioscript:panel:1.0',
		registryId: panel.id,
	}
}

function resourceSchemaKind(resource: { schema: string | null; kind: ResolvedRemoteResource['kind'] }): 'panel' | 'assay' | null {
	const schema = resource.schema?.toLowerCase() ?? ''
	if (schema.startsWith('bioscript:panel')) return 'panel'
	if (schema.startsWith('bioscript:assay:')) return 'assay'
	if (resource.kind === 'panel') return 'panel'
	if (resource.kind === 'assay') return 'assay'
	return null
}

function resourceRegistryId(resource: ResolvedRemoteResource): string {
	const fromName = (resource as { name?: string }).name
	if (typeof fromName === 'string' && fromName.trim()) return fromName.trim()
	if (resource.title) return resource.title
	return resource.sha256.slice(0, 16)
}

function packageFileSourceUrl(file: BioscriptPackageFile): string | null {
	const value = (file as BioscriptPackageFile & { sourceUrl?: unknown; source_url?: unknown }).sourceUrl ??
		(file as BioscriptPackageFile & { sourceUrl?: unknown; source_url?: unknown }).source_url
	return typeof value === 'string' && value.length ? value : null
}

function packageEntrypointForSelectedAssay(
	assay: LabAssay,
	defaultEntrypoint: string,
	files: BioscriptPackageFile[] | undefined | null,
): string {
	if (!isSessionLabAssay(assay) || assay.remoteKind !== 'assay' || !files?.length) return defaultEntrypoint
	return files.find((file) => packageFileSourceUrl(file) === assay.url)?.path ?? defaultEntrypoint
}

async function registerPackageWithRegistry(
	pkg: { resources: ResolvedRemoteResource[]; entrypoint: string; files: BioscriptPackageFile[]; sourceUrl: string },
	origin: RegistryOrigin,
	options?: { artifactUrl?: string | null; artifactSha256?: string | null },
): Promise<void> {
	const panelResource = pkg.resources.find((r) => resourceSchemaKind(r) === 'panel')
	const assayResources = pkg.resources.filter((r) => resourceSchemaKind(r) === 'assay')

	const cachedAt = new Date().toISOString()
	const panelId = panelResource ? resourceRegistryId(panelResource) : null
	const memberAssayIds = new Set<string>()

	if (panelResource && panelId) {
		const dependencyUrls = new Set(panelResource.dependencies.map((d) => d.url))
		for (const assay of assayResources) {
			if (!dependencyUrls.has(assay.sourceUrl)) continue
			memberAssayIds.add(resourceRegistryId(assay))
		}
		await registryUpsertPanel({
			id: panelId,
			version: panelResource.version ?? null,
			title: panelResource.title,
			label: panelResource.title,
			summary: panelResource.summary ?? null,
			tags: panelResource.dependencies.map(() => '').filter(Boolean),
			sourceUrl: pkg.sourceUrl,
			artifactUrl: options?.artifactUrl ?? null,
			artifactSha256: options?.artifactSha256 ?? null,
			entrypoint: pkg.entrypoint,
			files: pkg.files,
			memberAssayIds: Array.from(memberAssayIds),
			origin,
			cachedAt,
		})
	}

	for (const assay of assayResources) {
		const assayId = resourceRegistryId(assay)
		const isMember = panelId !== null && memberAssayIds.has(assayId)
		const pathInPackage = pkg.files.find((file) => packageFileSourceUrl(file) === assay.sourceUrl)?.path ?? null
		await registryUpsertAssay({
			id: assayId,
			version: assay.version ?? null,
			title: assay.title,
			summary: assay.summary ?? null,
			parentPanelId: isMember ? panelId : null,
			sourceUrl: isMember ? pkg.sourceUrl : assay.sourceUrl,
			pathInPackage,
			artifactUrl: isMember ? null : (options?.artifactUrl ?? null),
			artifactSha256: isMember ? null : (options?.artifactSha256 ?? null),
			entrypoint: isMember ? null : pkg.entrypoint,
			files: isMember ? null : pkg.files,
			origin,
			cachedAt,
		})
	}
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
		primaryKind !== 'bam' &&
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
		if (kind === 'bai' || kind === 'crai' || kind === 'tbi' || kind === 'fai' || kind === 'fasta') {
			genomeRef = pairLabGenomeCompanionRef([genomeRef], ref)[0] ?? genomeRef
			continue
		}
		if (kind === 'unknown' || kind === 'assay_python' || kind === 'assay_yaml') {
			unknowns.push(file)
		}
	}
	return { genomeRef, unknowns }
}

function isGenomeLabFileKind(kind: LabFileRef['kind']): boolean {
	return (
		kind === 'cram' ||
		kind === 'bam' ||
		kind === 'bai' ||
		kind === 'crai' ||
		kind === 'fasta' ||
		kind === 'fai' ||
		kind === 'vcf_gz' ||
		kind === 'tbi' ||
		kind === 'genotype_text' ||
		kind === 'zip'
	)
}

function summarizeResolvedResource(kind: ResolvedRemoteResource['kind'], dependencyCount: number): string {
	const label = kind === 'unknown' ? 'remote resource' : kind
	if (!dependencyCount) return `This looks like a ${label}. No dependencies were detected.`
	return `This looks like a ${label}. It references ${dependencyCount} ${dependencyCount === 1 ? 'dependency' : 'dependencies'}.`
}

function resolvedFromLocalPackageResource(
	resource: BioscriptPackageResource,
	packageSourceUrl: string,
): ResolvedRemoteResource {
	const resolution = resource.resolution
	return {
		cacheStatus: 'miss',
		cachedAt: new Date().toISOString(),
		contents: resource.contents,
		contentType: null,
		dependencies: resolution.dependencies,
		kind: resolution.kind,
		name: resolution.name,
		previousSha256: null,
		previousVersion: null,
		schema: resolution.schema ?? null,
		sha256: resolution.sha256,
		sourceUrl: resolution.source_url || `${packageSourceUrl}/${resource.path}`,
		summary: summarizeResolvedResource(resolution.kind, resolution.dependencies.length),
		title: resolution.title,
		version: resolution.version ?? null,
	}
}

async function resolveLocalAssayPackageZipRef(
	ref: LabFileRef,
	getFile: (ref: LabFileRef) => File,
): Promise<{
	entrypoint: string
	files: BioscriptPackageFile[]
	resources: ResolvedRemoteResource[]
	sourceUrl: string
} | null> {
	if (ref.kind !== 'zip') return null
	const sourceUrl = `local://${ref.id}/${encodeURIComponent(ref.name)}`
	try {
		const file = getFile(ref)
		const bytes = new Uint8Array(await file.arrayBuffer())
		const pkg = await resolvePackageZipBytes(sourceUrl, ref.name, bytes)
		if (!pkg.resources.length) return null
		return {
			entrypoint: pkg.entrypoint,
			files: pkg.files,
			resources: pkg.resources.map((resource) => resolvedFromLocalPackageResource(resource, sourceUrl)),
			sourceUrl,
		}
	} catch {
		return null
	}
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
			return kind === 'bam' || kind === 'cram' || kind === 'vcf_gz' || kind === 'genotype_text' || kind === 'zip' || kind === 'assay_yaml' || kind === 'assay_python'
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
	const cramGroups = result.filter((group) => group.rows.some((row) => {
		const kind = classifyLabFile(storedHandleName(row))
		return kind === 'bam' || kind === 'cram'
	}))
	const looseCraiGroups = result.filter((group) =>
		group.rows.every((row) => {
			const kind = classifyLabFile(storedHandleName(row))
			return kind === 'bai' || kind === 'crai'
		})
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

function savedHandleGroupMatchesActiveGenome(group: SavedHandleGroup, genome: LabGenomeRef | null): boolean {
	if (!genome) return false
	const pn = genome.primary.name
	if (group.label === pn) return true
	return group.rows.some(
		(row) => row.handles.primary?.name === pn || row.handles.reference?.name === pn,
	)
}

function cachedRemoteMatchesActiveGenome(remote: RemoteLabFile, genome: LabGenomeRef | null): boolean {
	if (!genome) return false
	return remote.file.name === genome.primary.name
}

function sampleBundleMatchesGenome(bundle: LabTestFileBundle, genome: LabGenomeRef): boolean {
	const sampleNames = new Set(bundle.files.map((file) => file.name))
	return sampleNames.has(genome.primary.name)
}

function sampleBundleMatchesCachedRemoteFile(bundle: LabTestFileBundle, remoteFile: RemoteLabFile): boolean {
	if (bundle.remoteUrl && remoteFile.sourceUrl === bundle.remoteUrl) return true
	const sampleNames = new Set(bundle.files.map((file) => file.name))
	return sampleNames.has(remoteFile.file.name)
}

/** Avoid double “selected” rows when cached URL storage or persisted handles share filenames with this session genome. */
function activeGenomeOwnedBySessionRow(activeGenome: LabGenomeRef | null, sessionGenomes: LabGenomeRef[]): boolean {
	return Boolean(activeGenome && sessionGenomes.some((g) => g.id === activeGenome.id))
}

function logPersistentHandleDebug(label: string, payload: Record<string, unknown>) {
	if (typeof console === 'undefined') return
	console.info(`[lab:persistent-handles] ${label}`, payload)
}

function logPersistentHandleWarning(label: string, payload: Record<string, unknown>) {
	if (typeof console === 'undefined') return
	console.warn(`[lab:persistent-handles] ${label}`, payload)
}

/**
 * Cross-session file handles need the File System Access API (Chromium-class
 * browsers, secure context). Without `showOpenFilePicker` we cannot offer the
 * “select again to persist” path, so we skip the modal entirely.
 */
function supportsPersistableLocalFileHandles(): boolean {
	if (typeof window === 'undefined') return false
	if (!window.isSecureContext) return false
	const w = window as typeof window & { showOpenFilePicker?: unknown }
	return typeof w.showOpenFilePicker === 'function' && typeof FileSystemFileHandle !== 'undefined'
}

async function selectPersistentHandlesForPending(
	pending: PendingPersistentHandle[],
): Promise<PendingPersistentHandle[]> {
	if (!supportsPersistableLocalFileHandles()) {
		if (typeof window !== 'undefined' && !window.isSecureContext) {
			throw new Error('File picker handle persistence requires HTTPS or localhost in Chrome.')
		}
		throw new Error('File picker handle persistence is not supported in this browser.')
	}
	const picker = (window as typeof window & {
		showOpenFilePicker: (options?: {
			excludeAcceptAllOption?: boolean
			multiple?: boolean
			types?: {
				accept: Record<string, string[]>
				description: string
			}[]
		}) => Promise<FileSystemFileHandle[]>
	}).showOpenFilePicker

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
	const [forceGettingStarted, setForceGettingStarted] = useState(false)
	const [runs, setRuns] = useState<RunRecord[]>([])
	const [runningAssayId, setRunningAssayId] = useState<string | null>(null)
	const [dragActive, setDragActive] = useState(false)
	const [importGenomeModalOpen, setImportGenomeModalOpen] = useState(false)
	const [query, setQuery] = useState('')
	const [pickerKindFilter, setPickerKindFilter] = useState<'all' | 'panel' | 'assay'>('panel')
	const [assayUrlInput, setAssayUrlInput] = useState('')
	const [assayUrlCopied, setAssayUrlCopied] = useState(false)
	const [sampleLoadingId, setSampleLoadingId] = useState<string | null>(null)
	const [sampleLoadError, setSampleLoadError] = useState<string | null>(null)
	const [sourceViewer, setSourceViewer] = useState<SourceViewerState | null>(null)
	const [runtimeWarmupStatus, setRuntimeWarmupStatus] = useState<RuntimeWarmupStatus>('loading')
	const [remoteIntent, setRemoteIntent] = useState<RemoteIntentState>({ status: 'idle' })
	const remoteIntentRequestSeqRef = useRef(0)
	const [sessionAssays, setSessionAssays] = useState<SessionLabAssay[]>([])
	const [registryReadyIds, setRegistryReadyIds] = useState<Set<string>>(() => new Set())
	const refreshRegistryReady = useCallback(async () => {
		try {
			const [panels, assays] = await Promise.all([registryListPanels(), registryListAssays()])
			const ready = new Set<string>()
			for (const panel of panels) {
				if (panel.entrypoint && panel.files?.length) ready.add(`panel:${panel.id}`)
			}
			for (const assay of assays) {
				if (assay.parentPanelId) {
					const parent = panels.find((p) => p.id === assay.parentPanelId)
					if (parent?.entrypoint && parent.files?.length) ready.add(`assay:${assay.id}`)
				} else if (assay.entrypoint && assay.files?.length) {
					ready.add(`assay:${assay.id}`)
				}
			}
			setRegistryReadyIds(ready)
		} catch (err) {
			console.warn('[lab] registry refresh failed', err)
		}
	}, [])
	useEffect(() => { void refreshRegistryReady() }, [refreshRegistryReady, sessionAssays])
	const [pendingHandles, setPendingHandles] = useState<PendingPersistentHandle[]>([])
	const [handlePersistMessage, setHandlePersistMessage] = useState<string | null>(null)
	const [savedHandles, setSavedHandles] = useState<SavedHandleGroup[]>([])
	const [savedHandlesLoading, setSavedHandlesLoading] = useState(false)
	const [savedHandlesError, setSavedHandlesError] = useState<string | null>(null)
	const [cachedRemoteFiles, setCachedRemoteFiles] = useState<RemoteLabFile[]>([])
	const [cachedRemotePackageArtifactUrls, setCachedRemotePackageArtifactUrls] = useState<Set<string>>(() => new Set())
	const [pendingDemoRunAssayId, setPendingDemoRunAssayId] = useState<string | null>(null)
	const [pendingVcfIndexRun, setPendingVcfIndexRun] = useState<PendingVcfIndexRun | null>(null)
	const [pendingAlignmentIndexRun, setPendingAlignmentIndexRun] = useState<PendingAlignmentIndexRun | null>(null)
	const promptedAlignmentIndexGenomeIdsRef = useRef<Set<string>>(new Set())
	const vcfIndexGenerationSeqRef = useRef(0)
	const alignmentIndexGenerationSeqRef = useRef(0)

	const activeGenomeRef = useMemo(
		() => {
			if (forceGettingStarted) return null
			return genomes.find((g) => g.id === selectedGenomeId) ?? genomes[genomes.length - 1] ?? null
		},
		[forceGettingStarted, genomes, selectedGenomeId],
	)
	const loadedSampleBundleIds = useMemo(() => {
		const ids = new Set<string>()
		for (const bundle of LAB_TEST_FILES) {
			if (
				genomes.some((genome) => sampleBundleMatchesGenome(bundle, genome)) ||
				cachedRemoteFiles.some((remoteFile) => sampleBundleMatchesCachedRemoteFile(bundle, remoteFile))
			) {
				ids.add(bundle.id)
			}
		}
		return ids
	}, [cachedRemoteFiles, genomes])

	const { width: layoutWidth } = useWindowDimensions()
	const useWideSplit = layoutWidth >= LAB_WIDE_TWO_COL_MIN && Boolean(activeGenomeRef)
	const useSidebarDrawer = layoutWidth < LAB_SIDEBAR_DRAWER_MAX
	const useCompactHeader = layoutWidth < LAB_COMPACT_HEADER_MAX
	const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
	const sidebarVisible = useSidebarDrawer ? mobileSidebarOpen : true
	useEffect(() => {
		if (!useSidebarDrawer) setMobileSidebarOpen(false)
	}, [useSidebarDrawer])

	const addResolvedSessionAssays = useCallback((
		resources: ResolvedRemoteResource[],
		packageInfo?: { entrypoint: string; files: BioscriptPackageFile[]; sourceUrl: string },
	) => {
		const assays = resources
			.filter((resource) => resource.kind === 'panel' || resource.kind === 'assay' || resource.kind === 'variant' || resource.kind === 'python')
			.map((resource): SessionLabAssay => {
				const language = resource.kind === 'python' ? 'python' : 'yaml'
				const pathInPackage = packageInfo?.files.find((file) => packageFileSourceUrl(file) === resource.sourceUrl)?.path
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
					packageEntrypoint: resource.kind === 'assay' && pathInPackage ? pathInPackage : packageInfo?.entrypoint,
					packageFiles: packageInfo?.files,
					packageSourceUrl: packageInfo?.sourceUrl,
					remoteKind: resource.kind,
					remoteSchema: resource.schema,
					registryId: resourceRegistryId(resource),
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

	const ingestLocalAssayRef = useCallback((ref: LabFileRef) => {
		const file = fileAdapterRef.current.getFile(ref)
		const language = ref.kind === 'assay_python' ? 'python' : 'yaml'
		const localAssay: SessionLabAssay = {
			id: `local-${ref.id}`,
			title: ref.name,
			subtitle: 'Local assay file',
			description: 'Assay imported from your computer for this browser session.',
			category: language === 'python' ? 'risk' : 'pharmacogenomics',
			language,
			url: `local://${ref.id}/${encodeURIComponent(ref.name)}`,
			inputFormats: ['cram', 'vcf_gz', 'genotype_text', 'zip'],
			tags: ['local', language, safeGenomicExtension(ref.name).replace(/^\./, '')],
			file,
			fileRef: ref,
			dependencyUrls: [],
			remoteKind: language === 'python' ? 'python' : 'assay',
		}
		setSessionAssays((prev) => {
			const byName = prev.filter((assay) => !(isSessionLabAssay(assay) && assay.url.startsWith('local://') && assay.title === ref.name))
			return [...byName, localAssay].sort((left, right) => left.title.localeCompare(right.title))
		})
	}, [])

	const ingestRef = useCallback((ref: LabFileRef) => {
		const file = fileAdapterRef.current.getFile(ref)
		const kind = ref.kind
		if (kind === 'unknown') {
			setUnknowns((prev) => [...prev, createUnknownEntry(file)])
			return
		}
		if (kind === 'assay_python' || kind === 'assay_yaml') {
			ingestLocalAssayRef(ref)
			return
		}
		if (kind === 'bam' || kind === 'cram' || kind === 'vcf_gz' || kind === 'genotype_text' || kind === 'zip') {
			const genomeRef = createLabGenomeRefFromPrimary(ref)
			if (!genomeRef) return
			setGenomes((prev) => [...prev, genomeRef])
			setSelectedGenomeId(genomeRef.id)
			return
		}
		setGenomes((prev) => pairLabGenomeCompanionRef(prev, ref))
	}, [ingestLocalAssayRef])

	const ingestManyRefs = useCallback(
		(refs: LabFileRef[], eventProperties?: Record<string, unknown>) => {
			void (async () => {
				const ordered = sortLabFileRefsForIngestion(refs)
				const localPackageRefs = new Set<string>()
				for (const ref of ordered) {
					const pkg = await resolveLocalAssayPackageZipRef(ref, fileAdapterRef.current.getFile)
					if (!pkg) continue
					localPackageRefs.add(ref.id)
					addResolvedSessionAssays(pkg.resources, {
						entrypoint: pkg.entrypoint,
						files: pkg.files,
						sourceUrl: pkg.sourceUrl,
					})
					void registerPackageWithRegistry(pkg, 'local-drop').catch((err) =>
						console.warn('[lab] registry upsert (local zip) failed', err),
					)
				}
				const assayRefs = ordered.filter((ref) => ref.kind === 'assay_python' || ref.kind === 'assay_yaml')
				const genomeRefs = ordered.filter(
					(ref) =>
						!localPackageRefs.has(ref.id) &&
						ref.kind !== 'assay_python' &&
						ref.kind !== 'assay_yaml' &&
						isGenomeLabFileKind(ref.kind),
				)
				const otherRefs = ordered.filter(
					(ref) => !localPackageRefs.has(ref.id) && !assayRefs.includes(ref) && !genomeRefs.includes(ref),
				)
				trackEvent('lab_files_added', {
					fileKinds: ordered.map((ref) => localPackageRefs.has(ref.id) ? 'assay_zip' : ref.kind),
					fileSources: ordered.map((ref) => ref.source),
					totalFiles: ordered.length,
					...eventProperties,
				})
				for (const ref of assayRefs) ingestLocalAssayRef(ref)
				const primaryCount = genomeRefs.filter((ref) => isPrimaryGenomeFileKind(ref.kind)).length
				if (primaryCount === 1) {
					const bundle = buildGenomeBundleFromRefs(genomeRefs, fileAdapterRef.current.getFile)
					if (bundle) {
						setGenomes((prev) => [
							...prev.filter((genome) => genome.primary.name !== bundle.genomeRef.primary.name),
							bundle.genomeRef,
						])
						setSelectedGenomeId(bundle.genomeRef.id)
						if (bundle.unknowns.length) {
							setUnknowns((prev) => [...prev, ...bundle.unknowns.map(createUnknownEntry)])
						}
						for (const ref of otherRefs) ingestRef(ref)
						return
					}
				}
				for (const ref of genomeRefs) ingestRef(ref)
				for (const ref of otherRefs) ingestRef(ref)
			})().catch((error) => {
				console.error('[lab] failed to ingest files', error)
			})
		},
		[addResolvedSessionAssays, ingestLocalAssayRef, ingestRef, trackEvent],
	)

	const ingestMany = useCallback(
		(files: File[], source: LabFileRef['source'] = 'local', eventProperties?: Record<string, unknown>) => {
			ingestManyRefs(fileAdapterRef.current.fromPlatformFiles(files, source), eventProperties)
		},
		[ingestManyRefs],
	)

	const mergePendingHandleOffers = useCallback((handles: PendingPersistentHandle[]) => {
		if (!handles.length) return
		if (!supportsPersistableLocalFileHandles()) {
			logPersistentHandleDebug('skipped persistent-handle prompt (browser unsupported)', {
				isSecureContext: typeof window !== 'undefined' ? window.isSecureContext : undefined,
			})
			return
		}
		setPendingHandles((prev) => {
			const byName = new Map(prev.map((item) => [item.fileName, item]))
			for (const handle of handles) byName.set(handle.fileName, handle)
			return Array.from(byName.values())
		})
		setHandlePersistMessage(null)
	}, [])

	useEffect(() => {
		if (supportsPersistableLocalFileHandles()) return
		setPendingHandles([])
		setHandlePersistMessage(null)
	}, [])

	const buildPendingHandlesForLocalFiles = useCallback(
		async (
			files: File[],
			refs: LabFileRef[],
			items: DataTransferItemList | undefined,
			logLabel: 'drop' | 'picker',
		): Promise<PendingPersistentHandle[]> => {
			const genomeRefs: LabFileRef[] = []
			for (const ref of refs) {
				if (!isGenomeLabFileKind(ref.kind)) continue
				const packageZip = await resolveLocalAssayPackageZipRef(ref, fileAdapterRef.current.getFile)
				if (packageZip) continue
				genomeRefs.push(ref)
			}
			const persistableNames = new Set(genomeRefs.map((ref) => ref.name))
			const groupPlan = buildLabFileGroupPlan(genomeRefs)
			const handles: PendingPersistentHandle[] = []
			const handledNames = new Set<string>()
			const itemList = Array.from(items ?? [])
			if (logLabel === 'drop') {
				logPersistentHandleDebug('drop received', {
					fileNames: files.map((file) => file.name),
					itemCount: itemList.length,
					hasGetAsFileSystemHandle: itemList.map((item) =>
						typeof (item as DataTransferItem & { getAsFileSystemHandle?: unknown }).getAsFileSystemHandle ===
						'function',
					),
				})
			} else {
				logPersistentHandleDebug('picker received', {
					fileNames: files.map((file) => file.name),
				})
			}
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
							if (!persistableNames.has(handle.name)) continue
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
				if (!persistableNames.has(file.name)) continue
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
			return handles
		},
		[],
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
			const [files, packages] = await Promise.all([
				listCachedRemoteLabFiles(),
				listResolvedCachedRemotePackages(),
			])
			const packageUrls = new Set<string>(packages.map((pkg) => pkg.artifactUrl))
			for (const url of listAssayPackageSourceUrls()) packageUrls.add(url)
			await Promise.all(files.map(async (file) => {
				if (file.fileKind !== 'zip') return
				try {
					const bytes = new Uint8Array(await file.file.arrayBuffer())
					const pkg = await resolvePackageZipBytes(file.sourceUrl, file.file.name, bytes)
					if (!pkg.resources.length) return
					packageUrls.add(file.sourceUrl)
					addAssayPackageSourceUrl(file.sourceUrl)
				} catch {
					// Ordinary genome ZIPs can fail package resolution; keep them visible.
				}
			}))
			setCachedRemoteFiles(files)
			setCachedRemotePackageArtifactUrls(packageUrls)
		} catch (error) {
			logPersistentHandleWarning('remote file cache refresh failed', {
				error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
			})
		}
	}, [])

	const ingestDroppedItems = useCallback(
		async (items: DataTransferItemList | undefined, fallbackFiles: File[]) => {
			const files = fallbackFiles
			if (!files.length) return
			const refs = fileAdapterRef.current.fromPlatformFiles(files, 'local')
			ingestManyRefs(refs)
			const handles = await buildPendingHandlesForLocalFiles(files, refs, items, 'drop')
			mergePendingHandleOffers(handles)
		},
		[ingestManyRefs, buildPendingHandlesForLocalFiles, mergePendingHandleOffers],
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
			onActiveChange: (active) => {
				setDragActive(active)
				if (active) setImportGenomeModalOpen(true)
			},
			onFiles: (files, items) => {
				setImportGenomeModalOpen(true)
				if (!files.length) return
				setImportGenomeModalOpen(false)
				void ingestDroppedItems(items, files).catch((error) => {
					const message = error instanceof Error ? error.message : String(error)
					setSavedHandlesError(`Could not import dropped files. ${message}`)
				})
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
		const failedMessage = failed.length ? ` Failed: ${failed.join(' · ')}` : ''
		if (saved > 0 && !failed.length && !retryWithPicker.length) {
			setPendingHandles([])
			setHandlePersistMessage(null)
		} else {
			setPendingHandles(retryWithPicker)
			setHandlePersistMessage(
				retryWithPicker.length
					? `Chrome could not keep access from the drop. Choose the same ${retryWithPicker.length === 1 ? 'file' : 'files'} to remember ${retryWithPicker.length === 1 ? 'it' : 'them'}.${failedMessage}`
					: saved
						? `Remembered ${saved} ${saved === 1 ? 'file' : 'files'}, but some files need attention.${failedMessage}`
						: `Files were not remembered.${failedMessage}`,
			)
		}
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
		if (!files.length) return
		const refs = fileAdapterRef.current.fromPlatformFiles(files, 'local')
		ingestManyRefs(refs)
		const handles = await buildPendingHandlesForLocalFiles(files, refs, undefined, 'picker')
		mergePendingHandleOffers(handles)
	}, [ingestManyRefs, buildPendingHandlesForLocalFiles, mergePendingHandleOffers])

	const removeUnknown = useCallback((id: string) => {
		setUnknowns((prev) => prev.filter((u) => u.id !== id))
	}, [])

	const clearUnknowns = useCallback(() => {
		setUnknowns([])
	}, [])

	const pickSample = useCallback(
		async (bundle: LabTestFileBundle) => {
			if (bundle.remoteUrl) {
				setSampleLoadingId(bundle.id)
				setSampleLoadError(null)
				trackEvent('lab_sample_genome_remote_requested', {
					...demoBundleAnalyticsProperties(bundle),
					bundleId: bundle.id,
				})
				try {
					const remoteFile = await fetchRemoteLabFile(bundle.remoteUrl)
					ingestMany([remoteFile.file], 'bundled', demoBundleAnalyticsProperties(bundle))
					if (remoteFile.cacheStatus === 'stored' || remoteFile.cacheStatus === 'hit') {
						await refreshCachedRemoteFiles()
					}
					trackEvent('lab_sample_genome_loaded', {
						...demoBundleAnalyticsProperties(bundle),
						bundleId: bundle.id,
						cacheStatus: remoteFile.cacheStatus,
						fileKind: remoteFile.fileKind,
						totalFiles: 1,
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
		[ingestMany, refreshCachedRemoteFiles, trackEvent],
	)

	useEffect(() => {
		let cancelled = false
		void Promise.all([
			listResolvedCachedRemoteResources(),
			listResolvedCachedRemotePackages(),
		])
			.then(async ([resources, packages]) => {
				if (cancelled) return
				for (const pkg of packages) {
					addResolvedSessionAssays(pkg.resources, { entrypoint: pkg.entrypoint, files: pkg.files, sourceUrl: pkg.sourceUrl })
					void registerPackageWithRegistry(pkg, 'url', { artifactUrl: pkg.artifactUrl ?? null }).catch((err) =>
						console.warn('[lab] registry upsert (rehydrate) failed', err),
					)
				}
				try {
					const registryPanels = await registryListPanels()
					const restoredPanels = registryPanels
						.map(sessionAssayFromRegistryPanel)
						.filter((panel): panel is SessionLabAssay => Boolean(panel))
					if (restoredPanels.length) {
						setSessionAssays((prev) => {
							const byKey = new Map(prev.map((assay) => [assayStableKey(assay), assay]))
							for (const panel of restoredPanels) {
								if (!byKey.has(assayStableKey(panel))) byKey.set(assayStableKey(panel), panel)
							}
							return Array.from(byKey.values()).sort((left, right) => left.title.localeCompare(right.title))
						})
					}
				} catch (err) {
					console.warn('[lab] registry panel rehydrate failed', err)
				}
				// Even when listResolvedCachedRemotePackages drops a package because
				// some inner resources were evicted from localStorage, the raw
				// package metadata (incl. resourceUrls → packageSourceUrl mapping)
				// is still present. Re-attach packageSourceUrl/entrypoint/files to
				// the individually rehydrated resources so the run path can recover
				// the release URL instead of mistaking the inner manifest for a
				// package-release.
				const rawPackages = listCachedRemotePackages()
				const fullyResolvedSourceUrls = new Set(packages.flatMap((pkg) => pkg.resources.map((r) => r.sourceUrl)))
				const resourceUrlToRawPkg = new Map<string, typeof rawPackages[number]>()
				for (const pkg of rawPackages) {
					for (const url of pkg.resourceUrls) resourceUrlToRawPkg.set(url, pkg)
				}
				const orphanedResources = resources.filter((resource) => !fullyResolvedSourceUrls.has(resource.sourceUrl))
				for (const resource of orphanedResources) {
					const rawPkg = resourceUrlToRawPkg.get(resource.sourceUrl)
					if (!rawPkg) continue
					addResolvedSessionAssays([resource], {
						entrypoint: rawPkg.entrypoint,
						files: rawPkg.files ?? [],
						sourceUrl: rawPkg.sourceUrl,
					})
				}
				const stillOrphaned = orphanedResources.filter((resource) => !resourceUrlToRawPkg.has(resource.sourceUrl))
				if (stillOrphaned.length) addResolvedSessionAssays(stillOrphaned)
				logPersistentHandleDebug('remote cache rehydrated', {
					count: resources.length,
					packageCount: packages.length,
					resources: resources.map((resource) => ({
						kind: resource.kind,
						sourceUrl: resource.sourceUrl,
						title: resource.title,
					})),
				})
				// For standalone-loaded assays/panels (not part of a package zip),
				// rebuild synthesized packageFiles from individually cached deps so
				// the Run button stays available across refreshes.
				const eligible = resources.filter(
					(resource) =>
						(resource.kind === 'assay' || resource.kind === 'panel') &&
						resource.dependencies.length > 0 &&
						!packages.some((pkg) => pkg.resources.some((r) => r.sourceUrl === resource.sourceUrl)),
				)
				for (const resource of eligible) {
					if (cancelled) return
					const depRecords = await Promise.all(
						resource.dependencies.map((dep) => getCachedRemoteResource(dep.url)),
					)
					if (depRecords.some((record) => !record)) continue
					const entrypoint = resource.name || (resource.sourceUrl.split('/').pop() ?? 'assay.yaml')
					const files: BioscriptPackageFile[] = [
						{ contents: resource.contents, path: entrypoint, source_url: resource.sourceUrl },
					]
					resource.dependencies.forEach((dep, i) => {
						const record = depRecords[i]
						if (!record) return
						files.push({
							contents: record.contents,
							path: relativePathFromBase(resource.sourceUrl, dep.url),
							source_url: dep.url,
						})
					})
					if (cancelled) return
					setSessionAssays((prev) => prev.map((entry) => entry.url === resource.sourceUrl ? {
						...entry,
						packageEntrypoint: entrypoint,
						packageFiles: files,
						packageSourceUrl: resource.sourceUrl,
					} : entry))
				}
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
		if (assay.registryId) {
			const kind = assayDisplayKind(assay)
			try {
				if (kind === 'panel') {
					const { removePanel: registryRemovePanel } = await import('@/lib/lab/assay-registry')
					await registryRemovePanel(assay.registryId)
				} else if (kind === 'assay') {
					const { removeAssay: registryRemoveAssay } = await import('@/lib/lab/assay-registry')
					await registryRemoveAssay(assay.registryId)
				}
			} catch (err) {
				console.warn('[lab] registry remove failed', err)
			}
			await refreshRegistryReady()
		}
		setSessionAssays((prev) => prev.filter((item) => item.url !== assay.url))
		trackEvent('lab_remote_resource_cache_deleted', {
			kind: assay.remoteKind,
			sourceUrl: assay.url,
		})
	}, [refreshRegistryReady, trackEvent])

	const dismissRemoteIntent = useCallback(() => {
		remoteIntentRequestSeqRef.current += 1
		clearWebLaunchIntentHash()
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
		const requestSeq = remoteIntentRequestSeqRef.current + 1
		remoteIntentRequestSeqRef.current = requestSeq
		const isCurrentRemoteIntent = () => remoteIntentRequestSeqRef.current === requestSeq
		setRemoteIntent({ intent, status: isRemoteLabFile ? 'file-loading' : 'resolving' })
		trackEvent('lab_remote_intent_fetch_requested', { ...demoProperties, source: intent.source, url: intent.url })
		try {
			if (isRemoteLabFile) {
				const remoteFile = await fetchRemoteLabFile(intent.url)
				if (!isCurrentRemoteIntent()) return
				if (remoteFile.fileKind === 'zip') {
					try {
						const bytes = new Uint8Array(await remoteFile.file.arrayBuffer())
						const pkg = await resolvePackageZipBytes(intent.url, remoteFile.file.name, bytes)
						if (pkg?.resources?.length) {
							addAssayPackageSourceUrl(intent.url)
						} else {
							removeAssayPackageSourceUrl(intent.url)
						}
					} catch {
						removeAssayPackageSourceUrl(intent.url)
					}
				}
				ingestMany([remoteFile.file], demoBundle ? 'bundled' : 'url', demoProperties)
				if (remoteFile.cacheStatus === 'stored' || remoteFile.cacheStatus === 'hit') {
					await refreshCachedRemoteFiles()
				}
				if (!isCurrentRemoteIntent()) return
				setAssayUrlInput('')
				setForceGettingStarted(false)
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
			if (!isCurrentRemoteIntent()) return
			if (resource.schema === 'bioscript:package-release:1.0') {
				const pkg = await resolveRemotePackage(intent.url)
				if (!isCurrentRemoteIntent()) return
				addResolvedSessionAssays(pkg.resources, { entrypoint: pkg.entrypoint, files: pkg.files, sourceUrl: pkg.sourceUrl })
				await registerPackageWithRegistry(pkg, 'url', { artifactUrl: pkg.artifactUrl ?? null })
				const entrypointResource =
					pkg.resources.find((candidate) => candidate.sourceUrl.endsWith(`/${pkg.entrypoint}`)) ??
					pkg.resources[0]
				if (!entrypointResource) {
					throw new Error(`Package ${pkg.name ?? pkg.sourceUrl} did not contain runnable BioScript resources.`)
				}
				setAssayUrlInput('')
				setForceGettingStarted(false)
				clearWebLaunchIntentHash()
				setRemoteIntent({ status: 'idle' })
				trackEvent('lab_remote_package_resolved', {
					...demoProperties,
					resourceCount: pkg.resources.length,
					source: intent.source,
					url: intent.url,
				})
				return
			}
			addResolvedSessionAssays([resource])
			if (!isCurrentRemoteIntent()) return
			setAssayUrlInput('')
			setForceGettingStarted(false)
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
			if (!isCurrentRemoteIntent()) return
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
		removeAssayPackageSourceUrl(remoteFile.sourceUrl)
		await refreshCachedRemoteFiles()
		trackEvent('lab_remote_file_cache_deleted', {
			fileKind: remoteFile.fileKind,
			sourceUrl: remoteFile.sourceUrl,
		})
	}, [refreshCachedRemoteFiles, trackEvent])

	const removeSessionGenome = useCallback(async (genome: LabGenomeRef) => {
		const relatedNames = new Set(genomeRelatedFileNames(genome))
		const matchedRemotes = cachedRemoteFiles.filter((remote) => relatedNames.has(remote.file.name))
		const matchedSavedHandleRows = savedHandles.flatMap((group) =>
			group.rows.filter((row) =>
				(row.handles.primary?.name && relatedNames.has(row.handles.primary.name)) ||
				(row.handles.reference?.name && relatedNames.has(row.handles.reference.name)) ||
				relatedNames.has(group.label),
			),
		)
		setGenomes((prev) => prev.filter((g) => g.id !== genome.id))
		setSelectedGenomeId((prev) => (prev === genome.id ? null : prev))
		if (matchedRemotes.length > 0) {
			await Promise.all(matchedRemotes.map((remote) => deleteCachedRemoteLabFile(remote.sourceUrl)))
			await refreshCachedRemoteFiles()
		}
		if (matchedSavedHandleRows.length > 0) {
			await Promise.all(matchedSavedHandleRows.map((row) => deleteHandles(row.documentId)))
			await refreshSavedHandles()
		}
		trackEvent('lab_session_genome_removed', {
			cachedRemotesCleared: matchedRemotes.length,
			savedHandlesCleared: matchedSavedHandleRows.length,
			genomeKind: genome.kind,
		})
	}, [cachedRemoteFiles, refreshCachedRemoteFiles, refreshSavedHandles, savedHandles, trackEvent])

	const resolveRemoteDependencies = useCallback(async () => {
		if (remoteIntent.status !== 'resolved' && remoteIntent.status !== 'dependency-error') return
		const { intent, resource } = remoteIntent
		const requestSeq = remoteIntentRequestSeqRef.current + 1
		remoteIntentRequestSeqRef.current = requestSeq
		const isCurrentRemoteIntent = () => remoteIntentRequestSeqRef.current === requestSeq
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
			if (!isCurrentRemoteIntent()) return
			addResolvedSessionAssays([resource, ...dependencies])
			if (!isCurrentRemoteIntent()) return
			setRemoteIntent({ dependencies, intent, resource, status: 'resolved' })
			trackEvent('lab_remote_dependencies_resolved', {
				dependencyCount: dependencies.length,
				kind: resource.kind,
				url: intent.url,
			})
		} catch (error) {
			if (!isCurrentRemoteIntent()) return
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

			if (isSessionLabAssay(catalogAssay) && catalogAssay.packageFiles?.length) {
				return catalogAssay.packageFiles.map((file) => ({
					language: file.path.toLowerCase().endsWith('.py') ? ('python' as const) : ('yaml' as const),
					name: file.path,
					source: file.source_url,
					text: file.contents,
				}))
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

	const downloadAssayPackage = useCallback(async (catalogAssay: LabAssay) => {
		if (!isSessionLabAssay(catalogAssay)) {
			if (catalogAssay.url) loadAssayUrl(catalogAssay.url)
			return
		}
		if (sessionAssayPackageReady(catalogAssay)) return
		if (!catalogAssay.dependencyUrls.length) {
			// Nothing to fetch — fall back to package-release fetch.
			if (catalogAssay.url) loadAssayUrl(catalogAssay.url)
			return
		}
		try {
			setRunningAssayId(catalogAssay.id)
			const synth = await buildSyntheticPackageFromAssay(catalogAssay)
			setSessionAssays((prev) => prev.map((entry) => (
				entry.id === catalogAssay.id || entry.url === catalogAssay.url
			) ? {
				...entry,
				packageEntrypoint: synth.entrypoint,
				packageFiles: synth.files,
				packageSourceUrl: catalogAssay.url,
			} : entry))
		} catch (error) {
			console.warn('[lab] downloadAssayPackage failed', error)
		} finally {
			setRunningAssayId(null)
		}
	}, [loadAssayUrl])

	const runAssayNow = useCallback(
		async (catalogAssay: LabAssay, genomeForRun: LabGenomeRef) => {
			if (!isLabGenomeComplete(genomeForRun)) return
			if (runningAssayId) return
			if (!isAssayCompatible(catalogAssay, genomeForRun)) return
			if (runtimeWarmupStatus === 'loading' && assayNeedsWebRuntime(catalogAssay, genomeForRun)) return

			try {
				setRunningAssayId(catalogAssay.id)
				const runId = `run-${Date.now()}-${Math.floor(Math.random() * 1000)}`
				const sourceFiles = await buildAssaySourceFiles(catalogAssay)
				setRuns((prev) => [
					{
						id: runId,
						assay: catalogAssay,
						genomeName: labGenomeDisplayName(genomeForRun),
						sourceFiles,
						startedAt: Date.now(),
						result: { status: 'running' },
					},
					...prev,
				])
				trackEvent('lab_run_started', {
					...assayAnalyticsProperties(catalogAssay),
					assayLanguage: catalogAssay.language,
					genomeKind: genomeForRun.kind,
				})
				try {
					const primaryFile = fileAdapterRef.current.getFile(genomeForRun.primary)
					const bytes = new Uint8Array(await primaryFile.arrayBuffer())
					const inspection = await inspectBytes(primaryFile.name, bytes, { detectSex: true })
					trackEvent('using_file_heuristics', fileHeuristicAnalyticsProperties(genomeForRun, inspection))
				} catch (inspectionError) {
					trackEvent('using_file_heuristics', {
						error: inspectionError instanceof Error ? inspectionError.message : String(inspectionError),
						fileExtension: safeGenomicExtension(genomeForRun.primary.name),
						genomeKind: genomeForRun.kind,
						inputFormat: labGenomeInputFormat(genomeForRun),
						relatedFileExtensions: genomeRelatedFileExtensions(genomeForRun),
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
				if (packageEntrypoint) {
					packageEntrypoint = packageEntrypointForSelectedAssay(catalogAssay, packageEntrypoint, packageFiles)
				}
				// First try the registry — for an assay that's a panel member, the
				// parent panel's files are the authoritative bundle for the runner.
				if ((!packageFiles?.length || !packageEntrypoint) && session?.registryId) {
					const kind = assayDisplayKind(catalogAssay)
					if (kind === 'panel' || kind === 'assay') {
						try {
							const bundle = await resolvePackageForRun(kind, session.registryId)
							if (bundle) {
								packageEntrypoint = packageEntrypointForSelectedAssay(catalogAssay, bundle.entrypoint, bundle.files)
								packageFiles = bundle.files
							}
						} catch (err) {
							console.warn('[lab] registry resolvePackageForRun failed', err)
						}
					}
				}
				// If the user is running a catalog entry that hasn't been resolved
				// to a package yet (or whose cache was cleared / refresh raced the
				// rehydrate effect), resolve on-the-fly so they don't need a
				// separate "Load" click. resolveRemotePackage handles both
				// package-release manifests and panel/assay YAMLs that declare a
				// `package: { artifact: ... }` field, so we don't gate on schema.
				// Prefer the original package-release URL (`packageSourceUrl`) over
				// the inner-resource URL so panel/assay manifests inside a zip don't
				// get incorrectly treated as standalone package-release manifests.
				const featuredPackageUrl = FEATURED_CATALOG.find((assay) => assay.title === catalogAssay.title)?.url
				const releaseFetchUrl = session?.packageSourceUrl || featuredPackageUrl || catalogAssay.url
				if (session && packageEntrypoint && sessionPackageLooksSynthetic(session, packageFiles) && releaseFetchUrl) {
					try {
						const pkg = await resolveRemotePackage(releaseFetchUrl)
						addResolvedSessionAssays(pkg.resources, { entrypoint: pkg.entrypoint, files: pkg.files, sourceUrl: pkg.sourceUrl })
						void registerPackageWithRegistry(pkg, 'url', { artifactUrl: pkg.artifactUrl ?? null }).catch((err) =>
							console.warn('[lab] registry upsert (replace synthetic package) failed', err),
						)
						packageEntrypoint = packageEntrypointForSelectedAssay(catalogAssay, pkg.entrypoint, pkg.files)
						packageFiles = pkg.files
					} catch (resolveError) {
						console.warn('[lab] replace synthetic package failed', resolveError)
					}
				}
				if ((!packageFiles?.length || !packageEntrypoint) && releaseFetchUrl) {
					try {
						const pkg = await resolveRemotePackage(releaseFetchUrl)
						addResolvedSessionAssays(pkg.resources, { entrypoint: pkg.entrypoint, files: pkg.files, sourceUrl: pkg.sourceUrl })
						void registerPackageWithRegistry(pkg, 'url', { artifactUrl: pkg.artifactUrl ?? null }).catch((err) =>
							console.warn('[lab] registry upsert (auto-resolve) failed', err),
						)
						packageEntrypoint = packageEntrypointForSelectedAssay(catalogAssay, pkg.entrypoint, pkg.files)
						packageFiles = pkg.files
					} catch (resolveError) {
						console.warn('[lab] auto-resolve package failed', resolveError)
					}
				}
				// Fallback: for a standalone assay/panel loaded by URL, the catalog
				// entry doesn't carry a package archive — synthesize one by fetching
				// the manifest's declared dependencies (cached via resolveRemoteResource).
				if ((!packageFiles?.length || !packageEntrypoint) && session && session.dependencyUrls.length) {
					try {
						const synth = await buildSyntheticPackageFromAssay(session)
						addResolvedSessionAssays([], {
							entrypoint: synth.entrypoint,
							files: synth.files,
							sourceUrl: session.url,
						})
						setSessionAssays((prev) => prev.map((entry) => entry.id === session.id ? {
							...entry,
							packageEntrypoint: synth.entrypoint,
							packageFiles: synth.files,
							packageSourceUrl: session.url,
						} : entry))
						packageEntrypoint = synth.entrypoint
						packageFiles = synth.files
					} catch (synthError) {
						console.warn('[lab] synthetic package build failed', synthError)
					}
				}
				const success: LabRunSuccess =
					packageFiles?.length && packageEntrypoint
						? await (async () => {
								try {
									const firstRun = await runLabPackageReportRef(
										genomeForRun,
										packageEntrypoint,
										packageFiles,
										fileAdapterRef.current,
										onProgress,
									)
									const textOutput = firstRun.result.textOutput ?? ''
									const artifactCount = firstRun.result.artifacts?.length ?? 0
									const shouldRetryStalePackage =
										artifactCount === 0 &&
										releaseFetchUrl &&
										(/Unable to fetch remote file \(\d+\)\./.test(textOutput) ||
											textOutput.includes('package file not found:'))
									if (!shouldRetryStalePackage) return firstRun
									const pkg = await resolveRemotePackage(releaseFetchUrl, { bypassCache: true })
									addResolvedSessionAssays(pkg.resources, {
										entrypoint: pkg.entrypoint,
										files: pkg.files,
										sourceUrl: pkg.sourceUrl,
									})
									void registerPackageWithRegistry(pkg, 'url', { artifactUrl: pkg.artifactUrl ?? null }).catch((err) =>
										console.warn('[lab] registry upsert (run stale-package retry) failed', err),
									)
									return runLabPackageReportRef(
										genomeForRun,
										packageEntrypointForSelectedAssay(catalogAssay, pkg.entrypoint, pkg.files),
										pkg.files,
										fileAdapterRef.current,
										onProgress,
									)
								} catch (error) {
									const message = error instanceof Error ? error.message : String(error)
									if (!catalogAssay.url || !message.includes('package file not found:')) throw error
									const retryFetchUrl = releaseFetchUrl || catalogAssay.url
									const pkg = await resolveRemotePackage(retryFetchUrl, { bypassCache: true })
									addResolvedSessionAssays(pkg.resources, {
										entrypoint: pkg.entrypoint,
										files: pkg.files,
										sourceUrl: pkg.sourceUrl,
									})
									void registerPackageWithRegistry(pkg, 'url', { artifactUrl: pkg.artifactUrl ?? null }).catch((err) =>
										console.warn('[lab] registry upsert (run retry) failed', err),
									)
									return runLabPackageReportRef(
										genomeForRun,
										packageEntrypointForSelectedAssay(catalogAssay, pkg.entrypoint, pkg.files),
										pkg.files,
										fileAdapterRef.current,
										onProgress,
									)
								}
							})()
						: session?.fileRef
							? await runLabAssayRef(
									genomeForRun,
									createLabAssayRef(session.fileRef, session.language, session.url),
									fileAdapterRef.current,
								)
							: (() => {
									throw new Error(
										'This assay was not loaded as a package — load it as a .zip so the rust report path runs.',
									)
								})()
				setRuns((prev) =>
					prev.map((r) => (r.id === runId ? { ...r, result: success.result } : r)),
				)
				trackEvent('lab_report_generated', {
					...assayAnalyticsProperties(catalogAssay),
					artifactCount: success.result.artifacts?.length ?? 0,
					artifactNames: (success.result.artifacts ?? []).map((artifact) => artifact.name),
					genomeKind: genomeForRun.kind,
					htmlReportName: htmlArtifactForResult(success.result)?.name ?? '',
					resultKind: success.kind,
				})
				trackEvent('lab_run_completed', {
					...assayAnalyticsProperties(catalogAssay),
					genomeKind: genomeForRun.kind,
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
					genomeKind: genomeForRun.kind,
					error: msg,
				})
			} finally {
				setRunningAssayId(null)
			}
		},
		[addResolvedSessionAssays, buildAssaySourceFiles, runningAssayId, runtimeWarmupStatus, trackEvent],
	)

	const runAssay = useCallback(
		(catalogAssay: LabAssay) => {
			if (!activeGenomeRef || !isLabGenomeComplete(activeGenomeRef)) return
			if (activeGenomeRef.kind === 'cram' && (!activeGenomeRef.crai || !activeGenomeRef.fai)) {
				void (async () => {
					let indexedGenome: Extract<LabGenomeRef, { kind: 'cram' }> = activeGenomeRef
					const cachedFiles: File[] = []
					const alignmentIndexSuffix = indexedGenome.primary.kind === 'bam' ? 'bai' : 'crai'
					if (!indexedGenome.crai) {
						const cached = await getCachedGeneratedIndexFile(indexedGenome.primary, alignmentIndexSuffix)
						if (cached) cachedFiles.push(cached)
					}
					if (indexedGenome.fasta && !indexedGenome.fai) {
						const cached = await getCachedGeneratedIndexFile(indexedGenome.fasta, 'fai')
						if (cached) cachedFiles.push(cached)
					}
					if (cachedFiles.length) {
						const refs = fileAdapterRef.current.fromPlatformFiles(cachedFiles, 'local')
						for (const ref of refs) {
							const nextGenome = pairLabGenomeCompanionRef([indexedGenome], ref)[0]
							if (nextGenome?.kind === 'cram') indexedGenome = nextGenome
						}
						setGenomes((prev) =>
							prev.map((genome) => (genome.id === indexedGenome.id ? indexedGenome : genome)),
						)
						setSelectedGenomeId(indexedGenome.id)
						if (indexedGenome.crai && indexedGenome.fai) {
							await runAssayNow(catalogAssay, indexedGenome)
							return
						}
					}
					const missing: PendingAlignmentIndexRun['missing'] = []
					if (!indexedGenome.crai) missing.push('alignment')
					if (indexedGenome.fasta && !indexedGenome.fai) missing.push('reference')
					setPendingAlignmentIndexRun({ assay: catalogAssay, genome: indexedGenome, missing, status: 'confirm' })
				})()
				return
			}
			if (activeGenomeRef.kind === 'vcf' && !activeGenomeRef.tbi) {
				void (async () => {
					const cachedIndexFile = await getCachedGeneratedVcfIndexFile(activeGenomeRef.primary)
					if (cachedIndexFile) {
						const [cachedIndexRef] = fileAdapterRef.current.fromPlatformFiles([cachedIndexFile], 'local')
						if (cachedIndexRef) {
							const indexedGenome: LabGenomeRef = { ...activeGenomeRef, tbi: cachedIndexRef }
							setGenomes((prev) =>
								prev.map((genome) => (genome.id === indexedGenome.id ? indexedGenome : genome)),
							)
							setSelectedGenomeId(indexedGenome.id)
							await runAssayNow(catalogAssay, indexedGenome)
							return
						}
					}
					setPendingVcfIndexRun({ assay: catalogAssay, genome: activeGenomeRef, status: 'confirm' })
				})()
				return
			}
			void runAssayNow(catalogAssay, activeGenomeRef)
		},
		[activeGenomeRef, runAssayNow],
	)

	const cancelPendingVcfIndexRun = useCallback(() => {
		vcfIndexGenerationSeqRef.current += 1
		setPendingVcfIndexRun(null)
	}, [])

	const confirmPendingVcfIndexRun = useCallback(() => {
		const pending = pendingVcfIndexRun
		if (!pending || pending.status === 'generating') return
		const generationSeq = vcfIndexGenerationSeqRef.current + 1
		vcfIndexGenerationSeqRef.current = generationSeq
		void (async () => {
			setPendingVcfIndexRun({ ...pending, error: undefined, status: 'generating' })
			try {
				const vcfFile = fileAdapterRef.current.getFile(pending.genome.primary)
				const indexBytes = await generateVcfTbiFile(vcfFile)
				if (vcfIndexGenerationSeqRef.current !== generationSeq) return
				const indexFile = fileFromIndexBytes(indexBytes, generatedVcfIndexName(vcfFile.name))
				await putCachedGeneratedVcfIndexFile(pending.genome.primary, indexFile)
				if (vcfIndexGenerationSeqRef.current !== generationSeq) return
				const [indexRef] = fileAdapterRef.current.fromPlatformFiles([indexFile], 'local')
				if (!indexRef) throw new Error('Could not attach generated index file.')
				const indexedGenome: LabGenomeRef = { ...pending.genome, tbi: indexRef }
				if (vcfIndexGenerationSeqRef.current !== generationSeq) return
				setGenomes((prev) =>
					prev.map((genome) => (genome.id === indexedGenome.id ? indexedGenome : genome)),
				)
				setSelectedGenomeId(indexedGenome.id)
				setPendingVcfIndexRun(null)
				await runAssayNow(pending.assay, indexedGenome)
			} catch (error) {
				if (vcfIndexGenerationSeqRef.current !== generationSeq) return
				setPendingVcfIndexRun({
					...pending,
					error: error instanceof Error ? error.message : String(error),
					status: 'confirm',
				})
			}
		})()
	}, [pendingVcfIndexRun, runAssayNow])

	const cancelPendingAlignmentIndexRun = useCallback(() => {
		alignmentIndexGenerationSeqRef.current += 1
		setPendingAlignmentIndexRun(null)
	}, [])

	const promptGenerateAlignmentIndexes = useCallback((genome: Extract<LabGenomeRef, { kind: 'cram' }>) => {
		const missing: PendingAlignmentIndexRun['missing'] = []
		if (!genome.crai) missing.push('alignment')
		if (genome.fasta && !genome.fai) missing.push('reference')
		if (!missing.length) return
		setPendingAlignmentIndexRun({ genome, missing, status: 'confirm' })
	}, [])

	useEffect(() => {
		if (!activeGenomeRef || activeGenomeRef.kind !== 'cram' || pendingAlignmentIndexRun) return
		if (activeGenomeRef.crai && (!activeGenomeRef.fasta || activeGenomeRef.fai)) return
		if (promptedAlignmentIndexGenomeIdsRef.current.has(activeGenomeRef.id)) return
		promptedAlignmentIndexGenomeIdsRef.current.add(activeGenomeRef.id)
		promptGenerateAlignmentIndexes(activeGenomeRef)
	}, [activeGenomeRef, pendingAlignmentIndexRun, promptGenerateAlignmentIndexes])

	const confirmPendingAlignmentIndexRun = useCallback(() => {
		const pending = pendingAlignmentIndexRun
		if (!pending || pending.status === 'generating' || !pending.missing.length) return
		const generationSeq = alignmentIndexGenerationSeqRef.current + 1
		alignmentIndexGenerationSeqRef.current = generationSeq
		void (async () => {
			setPendingAlignmentIndexRun({ ...pending, error: undefined, status: 'generating' })
			try {
				const generatedFiles: File[] = []
				if (pending.missing.includes('alignment')) {
					const alignmentFile = fileAdapterRef.current.getFile(pending.genome.primary)
					const bytes = pending.genome.primary.kind === 'bam'
						? await generateBamBaiFile(alignmentFile)
						: await generateCramCraiFile(alignmentFile)
					if (alignmentIndexGenerationSeqRef.current !== generationSeq) return
					const indexFile = fileFromIndexBytes(bytes, generatedAlignmentIndexName(alignmentFile.name))
					await putCachedGeneratedIndexFile(pending.genome.primary, pending.genome.primary.kind === 'bam' ? 'bai' : 'crai', indexFile)
					generatedFiles.push(indexFile)
				}
				if (pending.missing.includes('reference')) {
					if (!pending.genome.fasta) throw new Error('Reference FASTA is required before generating .fai.')
					const fastaFile = fileAdapterRef.current.getFile(pending.genome.fasta)
					const bytes = await generateFastaFaiFile(fastaFile)
					if (alignmentIndexGenerationSeqRef.current !== generationSeq) return
					const indexFile = fileFromIndexBytes(bytes, generatedFastaIndexName(fastaFile.name))
					await putCachedGeneratedIndexFile(pending.genome.fasta, 'fai', indexFile)
					generatedFiles.push(indexFile)
				}
				if (alignmentIndexGenerationSeqRef.current !== generationSeq) return
				const refs = fileAdapterRef.current.fromPlatformFiles(generatedFiles, 'local')
				let indexedGenome: LabGenomeRef = pending.genome
				for (const ref of refs) {
					indexedGenome = pairLabGenomeCompanionRef([indexedGenome], ref)[0] ?? indexedGenome
				}
				if (alignmentIndexGenerationSeqRef.current !== generationSeq) return
				setGenomes((prev) =>
					prev.map((genome) => (genome.id === indexedGenome.id ? indexedGenome : genome)),
				)
				setSelectedGenomeId(indexedGenome.id)
				setPendingAlignmentIndexRun(null)
				if (pending.assay) {
					await runAssayNow(pending.assay, indexedGenome)
				}
			} catch (error) {
				if (alignmentIndexGenerationSeqRef.current !== generationSeq) return
				setPendingAlignmentIndexRun({
					...pending,
					error: error instanceof Error ? error.message : String(error),
					status: 'confirm',
				})
			}
		})()
	}, [pendingAlignmentIndexRun, runAssayNow])

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

	useEffect(() => {
		if (!pendingDemoRunAssayId) return
		if (!activeGenomeRef || !isLabGenomeComplete(activeGenomeRef)) return
		if (runningAssayId) return
		const assay = getAssayById(pendingDemoRunAssayId)
		if (!assay) {
			setPendingDemoRunAssayId(null)
			return
		}
		if (!isAssayCompatible(assay, activeGenomeRef)) return
		if (runtimeWarmupStatus === 'loading' && assayNeedsWebRuntime(assay, activeGenomeRef)) return
		setPendingDemoRunAssayId(null)
		void runAssay(assay)
	}, [activeGenomeRef, pendingDemoRunAssayId, runningAssayId, runAssay, runtimeWarmupStatus])

	// Auto-scroll to latest run when it starts / completes
	const scrollRef = useRef<ScrollView>(null)
	const runsYRef = useRef<number>(0)
	const gettingStartedYRef = useRef<number>(0)
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

	const searchResults = useMemo(
		() => {
			const filtered = searchSessionAssays(mergeAssayList([...FEATURED_CATALOG, ...sessionAssays]), query, null).filter((assay) => {
				const kind = assayDisplayKind(assay)
				if (kind === 'variant' || kind === 'other') return false
				if (pickerKindFilter === 'panel') return kind === 'panel'
				if (pickerKindFilter === 'assay') return kind === 'assay'
				return true
			})
			return sortAssaysForPicker(filtered)
		},
		[pickerKindFilter, query, sessionAssays],
	)
	const latestRun = runs[0] ?? null
	const previousRuns = runs.slice(1)
	const firstDemoBundle = LAB_TEST_FILES[0]
	const firstDemoAssay = firstDemoBundle
		? LAB_ASSAYS.find((assay) => assay.inputFormats.includes(firstDemoBundle.format)) ?? null
		: null
	const demoRunPending = Boolean(
		pendingDemoRunAssayId ||
		(firstDemoBundle && sampleLoadingId === firstDemoBundle.id),
	)
	const startDemoRun = useCallback(() => {
		if (!firstDemoBundle || !firstDemoAssay) return
		setForceGettingStarted(false)
		setPendingDemoRunAssayId(firstDemoAssay.id)
		void pickSample(firstDemoBundle)
	}, [firstDemoAssay, firstDemoBundle, pickSample])
	const openGettingStarted = useCallback(() => {
		setForceGettingStarted(true)
		scrollRef.current?.scrollTo({ y: 0, animated: true })
	}, [])
	const selectSessionGenome = useCallback((id: string | null) => {
		setSelectedGenomeId(id)
		if (id) setForceGettingStarted(false)
	}, [])
	const toggleSidebar = useCallback(() => {
		setMobileSidebarOpen((value) => !value)
	}, [])
	const closeSidebarDrawer = useCallback(() => setMobileSidebarOpen(false), [])

	const showGettingStartedView = !activeGenomeRef || forceGettingStarted
	const assayCatalogSubtitle = 'Search or import assays. Run availability updates for the active genome.'
	const assayPaneHeader = showGettingStartedView ? null : (
		<View style={styles.workbenchPaneHead}>
			<OMText variant="subtitle" style={styles.pickerSectionTitle}>
				Assay catalog
			</OMText>
			<OMText variant="caption" style={styles.pickerIntro}>
				{assayCatalogSubtitle}
			</OMText>
		</View>
	)
	const resultsPaneHeader = (
		<View style={styles.workbenchPaneHead}>
			<OMText variant="subtitle" style={styles.pickerSectionTitle}>
				Results
			</OMText>
			<OMText variant="caption" style={styles.pickerIntro}>
				For the active genome.
			</OMText>
		</View>
	)
	const assayBlocks = !showGettingStartedView ? (
		<AssayPicker
			genome={activeGenomeRef}
			kindFilter={pickerKindFilter}
			onKindFilterChange={setPickerKindFilter}
			registryReadyIds={registryReadyIds}
			query={query}
			onQueryChange={setQuery}
			onImportUrl={(url) => {
				setAssayUrlInput(url)
				loadAssayUrl(url)
				setQuery('')
			}}
			results={searchResults}
			onForgetRemoteAssay={forgetRemoteAssay}
			runningAssayId={runningAssayId}
			runtimeWarmupStatus={runtimeWarmupStatus}
			sessionAssays={sessionAssays}
			onRun={runAssay}
			onDownload={(assay) => {
				void downloadAssayPackage(assay)
			}}
			onViewSource={(assay) => {
				void openAssaySource(assay)
			}}
		/>
	) : (
		<>
			<View
				onLayout={(e) => {
					gettingStartedYRef.current = e.nativeEvent.layout.y
				}}
			>
				<LabGettingStartedPanel
					showIntro={false}
					demoRunPending={demoRunPending}
					onTryDemoRun={firstDemoBundle && firstDemoAssay ? startDemoRun : undefined}
					assayTitle={firstDemoAssay?.title}
					sampleTitle={firstDemoBundle?.title}
				/>
			</View>
		</>
	)
	const resultBlocks = (
		<View
			style={styles.runsAnchor}
			onLayout={(e) => {
				runsYRef.current = e.nativeEvent.layout.y
			}}
		>
			{latestRun ? (
				<View style={styles.resultSection}>
					<OMText variant="caption" style={styles.sectionKicker}>
						Latest result
					</OMText>
					<RunCard
						record={latestRun}
						onViewSource={() => {
							setSourceViewer({ files: latestRun.sourceFiles, title: latestRun.assay.title })
						}}
					/>
				</View>
			) : (
				<View style={styles.resultsEmptyCard}>
					<OMText variant="headline" style={styles.resultsEmptyTitle}>
						No results yet
					</OMText>
					<OMText variant="body" style={styles.resultsEmptyText}>
						Run an assay to see progress, reports, artifacts, and recent runs here.
					</OMText>
				</View>
			)}
			{previousRuns.length > 0 ? (
				<View style={styles.resultSection}>
					<OMText variant="caption" style={styles.sectionKicker}>
						Recent runs
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
	)
	const labWorkBlocks = (
		<>
			{assayPaneHeader}
			{assayBlocks}
			{activeGenomeRef ? (
				<>
					{resultsPaneHeader}
					{resultBlocks}
				</>
			) : null}
		</>
	)
	const labSidebar = (
		<LabExplorerSidebar
			activeGenome={activeGenomeRef}
			sessionGenomes={genomes}
			onSelectSessionGenome={selectSessionGenome}
			onRemoveSessionGenome={removeSessionGenome}
			cachedRemoteFiles={cachedRemoteFiles}
			cachedRemotePackageArtifactUrls={cachedRemotePackageArtifactUrls}
			dragActive={dragActive}
			onChooseGenomeFiles={() => setImportGenomeModalOpen(true)}
			onRequestClose={useSidebarDrawer ? closeSidebarDrawer : undefined}
			savedHandlesError={savedHandlesError}
			savedHandlesLoading={savedHandlesLoading}
			savedHandleGroups={savedHandles}
			scheme={scheme}
			onRemoveCachedRemote={removeCachedRemoteFile}
			onRemoveSavedHandle={removeSavedHandle}
			onRestoreCachedRemote={restoreCachedRemoteFile}
			onRestoreSavedHandle={restoreSavedHandle}
		/>
	)

	return (
		<ThemeCtx.Provider value={themeValue}>
			<SafeAreaView style={styles.safe} edges={['top']}>
				{dragActive ? <DragOverlay /> : null}

				<View style={styles.workspaceShell}>
					{sidebarVisible ? (
						useSidebarDrawer ? (
							<View style={styles.labExplorerDrawerLayer}>
								<Pressable
									accessibilityLabel="Close data sidebar"
									accessibilityRole="button"
									onPress={closeSidebarDrawer}
									style={styles.labExplorerDrawerBackdrop}
								/>
								<View style={styles.labExplorerDrawerPanel}>{labSidebar}</View>
							</View>
						) : (
							labSidebar
						)
					) : null}
					<ScrollView
						ref={scrollRef}
						style={[styles.scroll, styles.mainWorkspaceScroll]}
						contentContainerStyle={styles.content}
					>
						<View style={[styles.siteHeader, showGettingStartedView ? styles.siteHeaderGettingStarted : null]}>
							<View
								style={[
									styles.heroRow,
									showGettingStartedView ? styles.heroRowGettingStarted : null,
									useCompactHeader ? styles.heroRowCompact : null,
								]}
							>
								<View
									style={[
										styles.heroTextBlock,
										showGettingStartedView ? styles.heroTextBlockGettingStarted : null,
									]}
								>
									{activeGenomeRef ? (
										<>
											<OMText variant="h4" style={styles.heroTitle} numberOfLines={1}>
												{labGenomeDisplayName(activeGenomeRef)}
											</OMText>
											<View style={styles.heroMetaRow}>
												<OMText variant="body" style={[styles.heroLead, { color: palette.textMuted }]}>
													{labGenomeKindLabel(activeGenomeRef)} ·{' '}
													{humanLabSize(labGenomeBytesTotal(activeGenomeRef))}
												</OMText>
												<OMText
													variant="caption"
													style={
														isLabGenomeComplete(activeGenomeRef)
															? styles.heroGenomeStatusOk
															: styles.heroGenomeStatusWarn
													}
												>
													{isLabGenomeComplete(activeGenomeRef)
														? 'Genome complete'
														: `Missing ${missingLabGenomeSlots(activeGenomeRef).join(' · ')}`}
												</OMText>
											</View>
											{activeGenomeRef.kind === 'cram' || activeGenomeRef.kind === 'vcf' ? (
												<GenomeSlotStrip
													genome={activeGenomeRef}
													onGenerateIndexes={
														activeGenomeRef.kind === 'cram' ? () => promptGenerateAlignmentIndexes(activeGenomeRef) : undefined
													}
												/>
											) : null}
										</>
									) : showGettingStartedView ? (
										<>
											<OMText variant="h4" style={styles.heroTitle} numberOfLines={1}>
												Getting Started
											</OMText>
											<OMText variant="body" style={styles.heroLead}>
												Add a genome from the sidebar, then select an assay to run from the catalog.
											</OMText>
										</>
									) : null}
								</View>
								<View style={styles.heroHeaderAside}>
									<View style={styles.headerTools}>
										{useSidebarDrawer ? (
											<SidebarToggleButton
												open={mobileSidebarOpen}
												onPress={toggleSidebar}
											/>
										) : null}
										<View style={styles.headerNavCluster}>
											<GettingStartedButton active={showGettingStartedView} compact={useCompactHeader} onPress={openGettingStarted} />
											<GithubButton compact={useCompactHeader} />
											<ContactButton compact={useCompactHeader} />
										</View>
									</View>
								</View>
							</View>
						</View>

						{useWideSplit ? (
							<View style={styles.workbenchGrid}>
								<View style={[styles.workbenchPane, styles.workbenchAssayPane]}>
									{assayPaneHeader}
									{assayBlocks}
								</View>
								{showGettingStartedView ? null : (
									<View style={[styles.workbenchPane, styles.workbenchResultsPane]}>
										{resultsPaneHeader}
										{resultBlocks}
									</View>
								)}
							</View>
						) : (
							labWorkBlocks
						)}
						<View style={styles.resultsPaneFooter}>
							<PrivacyFootnote />
							<FeedbackFooterButton />
						</View>
					</ScrollView>
				</View>
				<UnknownFilesAlert unknowns={unknowns} onDismissAll={clearUnknowns} onRemove={removeUnknown} />
				<PersistentHandlePrompt
					message={handlePersistMessage}
					pendingHandles={pendingHandles}
					onDismiss={() => {
						setPendingHandles([])
						setHandlePersistMessage(null)
					}}
					onSave={persistDroppedHandles}
				/>
				<RemoteIntentCard
					state={remoteIntent}
					onDismiss={dismissRemoteIntent}
					onFetch={fetchRemoteIntent}
					onResolveDependencies={resolveRemoteDependencies}
				/>
				{sourceViewer ? (
					<SourceViewer viewer={sourceViewer} onClose={() => setSourceViewer(null)} />
				) : null}
				{pendingVcfIndexRun ? (
					<VcfIndexPrompt
						state={pendingVcfIndexRun}
						onCancel={cancelPendingVcfIndexRun}
						onConfirm={confirmPendingVcfIndexRun}
					/>
				) : null}
				{pendingAlignmentIndexRun ? (
					<AlignmentIndexPrompt
						state={pendingAlignmentIndexRun}
						onCancel={cancelPendingAlignmentIndexRun}
						onConfirm={confirmPendingAlignmentIndexRun}
					/>
				) : null}
				<ImportGenomeModal
					assayUrlCopied={assayUrlCopied}
					assayUrlInput={assayUrlInput}
					dragActive={dragActive}
					open={importGenomeModalOpen}
					sampleBundles={LAB_TEST_FILES}
					loadedSampleBundleIds={loadedSampleBundleIds}
					sampleLoadError={sampleLoadError}
					sampleLoadingId={sampleLoadingId}
					shareAssayUrl={shareAssayUrl}
					onChooseGenomeFiles={() => {
						setImportGenomeModalOpen(false)
						openPicker()
					}}
					onClose={() => setImportGenomeModalOpen(false)}
					onCopyShareAssayUrl={copyShareAssayUrl}
					onLoadAssayUrl={loadAssayUrl}
					onPickSample={pickSample}
					onUrlInputChange={setAssayUrlInput}
				/>
			</SafeAreaView>
		</ThemeCtx.Provider>
	)
}

function LabModalChrome({
	accessibilityLabel,
	children,
	contentStyle,
	layerStyle,
	onBackdropDismiss,
	panelStyle,
	scroll = false,
	scrollContentStyle,
}: {
	accessibilityLabel?: string
	children: ReactNode
	contentStyle?: object
	layerStyle?: object
	onBackdropDismiss: () => void
	panelStyle?: object
	scroll?: boolean
	scrollContentStyle?: object
}) {
	const { styles } = useTheme()
	const { width } = useWindowDimensions()
	const fullScreen = width < LAB_SIDEBAR_DRAWER_MAX
	return (
		<View style={[styles.sourceOverlay, fullScreen ? styles.sourceOverlayFullScreen : null, styles.labModalLayer, layerStyle]}>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel="Close dialog"
				onPress={onBackdropDismiss}
				style={styles.sourceBackdrop}
			/>
			<View
				accessibilityLabel={accessibilityLabel}
				accessibilityViewIsModal
				accessible
				style={[styles.sourcePanel, fullScreen ? styles.sourcePanelFullScreen : null, panelStyle]}
			>
				{scroll ? (
					<ScrollView
						contentContainerStyle={scrollContentStyle}
						keyboardShouldPersistTaps="handled"
						nestedScrollEnabled
						style={contentStyle}
					>
						{children}
					</ScrollView>
				) : (
					children
				)}
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

	let body: ReactNode = null

	if (state.status === 'pending' || state.status === 'resolving' || state.status === 'file-loading' || state.status === 'error') {
		const busy = state.status === 'resolving' || state.status === 'file-loading'
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
					<Pressable
						accessibilityRole="button"
						accessibilityLabel="Close shared resource dialog"
						onPress={onDismiss}
						style={({ hovered, pressed }) => [
							styles.intentClose,
							hovered && styles.buttonHover,
							pressed && styles.buttonPressed,
						]}
					>
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
					<Pressable
						accessibilityRole="button"
						onPress={onDismiss}
						style={({ hovered, pressed }) => [
							styles.intentSecondaryButton,
							hovered && styles.buttonHover,
							pressed && styles.buttonPressed,
						]}
					>
						<OMText variant="subtitle" style={styles.intentSecondaryText}>
							{busy ? 'Cancel' : 'Ignore'}
						</OMText>
					</Pressable>
					<Pressable
						accessibilityRole="button"
						onPress={onFetch}
						disabled={busy}
						style={({ hovered, pressed }) => [
							styles.intentPrimaryButton,
							hovered && !busy && styles.buttonHover,
							pressed && !busy && styles.buttonPressed,
						]}
					>
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
					<Pressable
						accessibilityRole="button"
						accessibilityLabel="Close shared resource dialog"
						onPress={onDismiss}
						style={({ hovered, pressed }) => [
							styles.intentClose,
							hovered && styles.buttonHover,
							pressed && styles.buttonPressed,
						]}
					>
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
					<Pressable
						accessibilityRole="button"
						onPress={onDismiss}
						style={({ hovered, pressed }) => [
							styles.intentPrimaryButton,
							hovered && styles.buttonHover,
							pressed && styles.buttonPressed,
						]}
					>
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
					<Pressable
						accessibilityRole="button"
						accessibilityLabel="Close shared resource dialog"
						onPress={onDismiss}
						style={({ hovered, pressed }) => [
							styles.intentClose,
							hovered && styles.buttonHover,
							pressed && styles.buttonPressed,
						]}
					>
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
					<Pressable
						accessibilityRole="button"
						onPress={onDismiss}
						disabled={resolvingDeps}
						style={({ hovered, pressed }) => [
							styles.intentSecondaryButton,
							hovered && !resolvingDeps && styles.buttonHover,
							pressed && !resolvingDeps && styles.buttonPressed,
						]}
					>
						<OMText variant="subtitle" style={styles.intentSecondaryText}>
							Done
						</OMText>
					</Pressable>
					{resource.dependencies.length ? (
						<Pressable
							accessibilityRole="button"
							onPress={onResolveDependencies}
							disabled={resolvingDeps}
							style={({ hovered, pressed }) => [
								styles.intentPrimaryButton,
								hovered && !resolvingDeps && styles.buttonHover,
								pressed && !resolvingDeps && styles.buttonPressed,
							]}
						>
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
		<LabModalChrome
			accessibilityLabel="Shared resource dialog"
			contentStyle={styles.intentModalScroll}
			layerStyle={styles.intentModalLayer}
			onBackdropDismiss={onDismiss}
			panelStyle={styles.intentModalSheet}
			scroll
			scrollContentStyle={styles.intentModalScrollContent}
		>
			{body}
		</LabModalChrome>
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
	if (!supportsPersistableLocalFileHandles()) return null
	if (!pendingHandles.length && !message) return null
	return (
		<LabModalChrome
			accessibilityLabel="Persistent file access dialog"
			layerStyle={styles.persistentHandleModalLayer}
			onBackdropDismiss={onDismiss}
			panelStyle={styles.persistentHandleModalPanel}
		>
			<View style={styles.persistentHandleModalChrome}>
				<View style={styles.intentHeader}>
					<View style={styles.intentIcon}>
						<OMIcon name="folder-open-outline" tone="accent" size={18} />
					</View>
					<View style={styles.intentText}>
						<OMText variant="caption" style={styles.intentKicker}>
							REMEMBER FILES
						</OMText>
						<OMText variant="headline" style={styles.intentTitle}>
							Remember these files?
						</OMText>
						<OMText variant="caption" style={styles.intentUrl}>
							{message ??
								`BioVault can ask Chrome to keep access to ${pendingHandles.length === 1 ? 'this file' : 'these files'} so you can reopen ${pendingHandles.length === 1 ? 'it' : 'them'} after refresh.`}
						</OMText>
					</View>
					<Pressable
						onPress={onDismiss}
						style={({ hovered, pressed }) => [
							styles.intentClose,
							hovered && styles.buttonHover,
							pressed && styles.buttonPressed,
						]}
					>
						<OMIcon name="close-outline" tone={mutedIconTone} size={16} />
					</Pressable>
				</View>
				{pendingHandles.length ? (
					<View style={styles.intentDependencyList}>
						{pendingHandles.slice(0, 6).map((item) => (
							<OMText key={item.id} variant="caption" style={styles.intentDependency}>
								{item.fileName}
								{item.needsPicker || !item.handle ? ' (choose again to remember)' : ''}
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
						<Pressable
							onPress={onDismiss}
							style={({ hovered, pressed }) => [
								styles.intentSecondaryButton,
								hovered && styles.buttonHover,
								pressed && styles.buttonPressed,
							]}
						>
							<OMText variant="subtitle" style={styles.intentSecondaryText}>
								Not now
							</OMText>
						</Pressable>
						<Pressable
							onPress={onSave}
							style={({ hovered, pressed }) => [
								styles.intentPrimaryButton,
								hovered && styles.buttonHover,
								pressed && styles.buttonPressed,
							]}
						>
							<OMText variant="subtitle" style={styles.primaryButtonText}>
								{pendingHandles.some((item) => item.needsPicker || !item.handle)
									? 'Choose files'
									: 'Remember'}
							</OMText>
						</Pressable>
					</View>
				) : null}
			</View>
		</LabModalChrome>
	)
}

function ImportGenomeModal({
	assayUrlCopied,
	assayUrlInput,
	dragActive,
	onChooseGenomeFiles,
	onClose,
	onCopyShareAssayUrl,
	onLoadAssayUrl,
	onPickSample,
	onUrlInputChange,
	open,
	loadedSampleBundleIds,
	sampleBundles,
	sampleLoadError,
	sampleLoadingId,
	shareAssayUrl,
}: {
	assayUrlCopied: boolean
	assayUrlInput: string
	dragActive: boolean
	onChooseGenomeFiles: () => void
	onClose: () => void
	onCopyShareAssayUrl: () => void
	onLoadAssayUrl: (url: string) => void
	onPickSample: (bundle: LabTestFileBundle) => void
	onUrlInputChange: (url: string) => void
	open: boolean
	loadedSampleBundleIds: Set<string>
	sampleBundles: LabTestFileBundle[]
	sampleLoadError: string | null
	sampleLoadingId: string | null
	shareAssayUrl: string
}) {
	const { styles, mutedIconTone, palette } = useTheme()
	if (!open) return null
	return (
		<LabModalChrome
			accessibilityLabel="Import genome dialog"
			onBackdropDismiss={onClose}
			panelStyle={[styles.importGenomeModalPanel, dragActive ? styles.importGenomeModalPanelActive : null] as object}
		>
			<View style={[styles.importGenomeModalChrome, dragActive ? styles.importGenomeModalChromeActive : null]}>
				<View style={styles.intentHeader}>
					<View style={styles.intentIcon}>
						<OMIcon name="cloud-upload-outline" tone="accent" size={18} />
					</View>
					<View style={styles.intentText}>
						<OMText variant="caption" style={styles.intentKicker}>
							IMPORT GENOME
						</OMText>
						<OMText variant="headline" style={styles.intentTitle}>
							Add genome data
						</OMText>
						<OMText variant="caption" style={styles.intentUrl}>
							Choose local files, paste a URL, or drop genome files anywhere in this dialog.
						</OMText>
					</View>
					<Pressable
						onPress={onClose}
						style={({ hovered, pressed }) => [
							styles.intentClose,
							hovered && styles.buttonHover,
							pressed && styles.buttonPressed,
						]}
					>
						<OMIcon name="close-outline" tone={mutedIconTone} size={16} />
					</Pressable>
				</View>

				<Pressable
					onPress={onChooseGenomeFiles}
					style={({ hovered, pressed }) => [
						styles.importGenomeDropArea,
						dragActive ? styles.importGenomeDropAreaActive : null,
						hovered && styles.buttonHover,
						pressed && styles.buttonPressed,
					]}
					accessibilityRole="button"
					accessibilityLabel="Choose genome files"
				>
					<PlatformSvgUri uri={microscopeIconUri} width={26} height={26} color={dragActive ? '#fff' : '#53bea9'} />
					<OMText variant="subtitle" style={styles.importGenomeDropTitle}>
						{dragActive ? 'Release anywhere in this dialog to import' : 'Drop files here or click to choose'}
					</OMText>
					<OMText variant="caption" style={styles.importGenomeDropBody}>
						BAM/CRAM references are required. Indexes for BAM/CRAM/VCF are optional.
					</OMText>
				</Pressable>

				<View style={styles.importGenomeActionGrid}>
					<View style={styles.importGenomeSampleCard}>
						<View style={styles.importGenomeSectionHead}>
							<OMText variant="caption" style={styles.labExplorerSectionTitle}>
								Sample data
							</OMText>
							<OMText variant="caption" style={styles.importGenomeSectionHint}>
								Try assays without finding your own genome file first.
							</OMText>
						</View>
						<View style={styles.labExplorerList}>
							{sampleBundles.map((bundle) => {
								const loading = sampleLoadingId === bundle.id
								const loaded = loadedSampleBundleIds.has(bundle.id)
								return (
									<Pressable
										key={bundle.id}
										disabled={loading || loaded}
										onPress={() => {
											onPickSample(bundle)
											onClose()
										}}
										style={[styles.labExplorerSampleRow, loading || loaded ? styles.labExplorerSampleRowMuted : null]}
										accessibilityLabel={
											loading
												? `Loading ${bundle.title}`
												: bundle.remoteUrl
													? `Download ${bundle.title}`
													: `Import ${bundle.title}`
										}
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
										{loaded ? null : loading ? (
											<ActivityIndicator size="small" color={palette.accent} />
										) : (
											<OMIcon
												name={bundle.remoteUrl ? 'cloud-download-outline' : 'add-circle-outline'}
												tone="accent"
												size={18}
											/>
										)}
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
					<View style={styles.importGenomeUrlCard}>
						<UrlLoadBox
							narrow={false}
							shareUrl={shareAssayUrl}
							shareUrlCopied={assayUrlCopied}
							urlInput={assayUrlInput}
							onCopyShareUrl={onCopyShareAssayUrl}
							onLoadUrl={(url) => {
								onLoadAssayUrl(url)
								onClose()
							}}
							onUrlInputChange={onUrlInputChange}
						/>
					</View>
				</View>
			</View>
		</LabModalChrome>
	)
}

function LabExplorerSidebar({
	activeGenome,
	cachedRemoteFiles,
	cachedRemotePackageArtifactUrls,
	dragActive,
	onChooseGenomeFiles,
	onRemoveCachedRemote,
	onRemoveSavedHandle,
	onRemoveSessionGenome,
	onRequestClose,
	onRestoreCachedRemote,
	onRestoreSavedHandle,
	onSelectSessionGenome,
	savedHandlesError,
	savedHandlesLoading,
	savedHandleGroups,
	scheme,
	sessionGenomes,
}: {
	activeGenome: LabGenomeRef | null
	sessionGenomes: LabGenomeRef[]
	onSelectSessionGenome: (id: string | null) => void
	cachedRemoteFiles: RemoteLabFile[]
	cachedRemotePackageArtifactUrls: Set<string>
	dragActive: boolean
	onChooseGenomeFiles: () => void
	savedHandlesError: string | null
	savedHandlesLoading: boolean
	savedHandleGroups: SavedHandleGroup[]
	onRemoveCachedRemote: (remoteFile: RemoteLabFile) => void
	onRemoveSavedHandle: (group: SavedHandleGroup) => void
	onRemoveSessionGenome: (genome: LabGenomeRef) => void
	onRequestClose?: () => void
	onRestoreCachedRemote: (remoteFile: RemoteLabFile) => void
	onRestoreSavedHandle: (group: SavedHandleGroup) => void
	scheme: 'light' | 'dark'
}) {
	const { styles, mutedIconTone } = useTheme()
	const sessionPrimaryNames = useMemo(() => new Set(sessionGenomes.map((g) => g.primary.name)), [sessionGenomes])
	/** Cached fetch rows duplicate session rows when the same primary is already loaded; keep them out of the picker list. */
	const cachedRemotePickers = useMemo(() => {
		return cachedRemoteFiles.filter(
			(r) =>
				isGenomeLabFileKind(r.fileKind) &&
				!cachedRemotePackageArtifactUrls.has(r.sourceUrl) &&
				!sessionPrimaryNames.has(r.file.name),
		)
	}, [cachedRemoteFiles, cachedRemotePackageArtifactUrls, sessionPrimaryNames])
	/** Hide a remembered local-file group when the same primary is already loaded as a session genome. */
	const filteredSavedHandleGroups = useMemo(() => {
		return savedHandleGroups.filter((group) => {
			if (sessionPrimaryNames.has(group.label)) return false
			return !group.rows.some((row) =>
				(row.handles.primary?.name && sessionPrimaryNames.has(row.handles.primary.name)) ||
				(row.handles.reference?.name && sessionPrimaryNames.has(row.handles.reference.name)),
			)
		})
	}, [savedHandleGroups, sessionPrimaryNames])
	const activeIsSessionRow = activeGenomeOwnedBySessionRow(activeGenome, sessionGenomes)
	return (
		<View style={[styles.labExplorerRoot, onRequestClose ? styles.labExplorerRootInDrawer : null]}>
			{onRequestClose ? (
				<View style={styles.labExplorerChromeHead}>
					<Pressable
						accessibilityLabel="Close data sidebar"
						accessibilityRole="button"
						hitSlop={8}
						onPress={onRequestClose}
						style={styles.labExplorerChromeClose}
					>
						<OMIcon name="close-outline" tone="muted" size={18} />
					</Pressable>
				</View>
			) : null}
			<View style={styles.labExplorerTopAction}>
				<ImportGenomeButton dragActive={dragActive} onPress={onChooseGenomeFiles} />
			</View>
			<ScrollView
				showsVerticalScrollIndicator={Platform.OS !== 'web'}
				style={styles.labExplorerScroll}
				contentContainerStyle={styles.labExplorerScrollContent}
				keyboardShouldPersistTaps="handled"
			>
				<View testID="saved-local-files" style={styles.labExplorerSavedBlock}>
					{savedHandlesError ? (
						<View style={[styles.errorInlineBlock, styles.labExplorerErrorPad]}>
							<OMIcon name="alert-circle-outline" tone="danger" size={14} />
							<OMText variant="caption" style={styles.errorInline}>
								{savedHandlesError}
							</OMText>
						</View>
					) : null}
					<View style={styles.labExplorerList}>
						{sessionGenomes.map((genome) => {
							const rowSelected = Boolean(activeGenome && activeGenome.id === genome.id)
							const rowComplete = isLabGenomeComplete(genome)
							return (
								<View
									key={genome.id}
									testID="session-genome-row"
									style={[
										styles.labExplorerPinnedRow,
										rowSelected ? styles.labExplorerPinnedRowSelected : null,
									]}
								>
									<Pressable
										disabled={savedHandlesLoading}
										onPress={() => {
											onSelectSessionGenome(genome.id)
											onRequestClose?.()
										}}
										style={[
											styles.labExplorerRowMain,
											savedHandlesLoading ? styles.labExplorerRowMainMuted : null,
										]}
										accessibilityLabel={`Select genome ${labGenomeDisplayName(genome)}`}
									>
										<OMIcon name="layers-outline" tone={rowSelected ? 'accent' : mutedIconTone} size={15} />
										<View style={styles.labExplorerRowText}>
											<OMText variant="body" style={styles.labExplorerRowTitle} numberOfLines={1}>
												{labGenomeDisplayName(genome)}
											</OMText>
											<OMText
												variant="caption"
												style={[styles.labExplorerRowMeta, rowComplete ? null : styles.labExplorerRowMetaWarn]}
												numberOfLines={1}
											>
												{genomeSidebarMeta(genome)}
											</OMText>
										</View>
									</Pressable>
									<Pressable
										disabled={savedHandlesLoading}
										onPress={() => onRemoveSessionGenome(genome)}
										style={[
											styles.labExplorerRowGhostHit,
											savedHandlesLoading ? styles.labExplorerRowGhostMuted : null,
										]}
										hitSlop={6}
										accessibilityLabel={`Remove genome ${labGenomeDisplayName(genome)}`}
									>
										<OMIcon name="trash-outline" tone={mutedIconTone} size={15} />
									</Pressable>
								</View>
							)
						})}
						{filteredSavedHandleGroups.map((group) => {
							const pinnedSelected =
								Boolean(activeGenome) &&
								savedHandleGroupMatchesActiveGenome(group, activeGenome) &&
								!activeIsSessionRow
							return (
							<View
								key={group.id}
								testID="saved-local-file-row"
								style={[
									styles.labExplorerPinnedRow,
									pinnedSelected ? styles.labExplorerPinnedRowSelected : null,
								]}
							>
								<Pressable
									disabled={savedHandlesLoading}
									onPress={() => {
										onRestoreSavedHandle(group)
										onRequestClose?.()
									}}
									style={[
										styles.labExplorerRowMain,
										savedHandlesLoading ? styles.labExplorerRowMainMuted : null,
									]}
								>
									<OMIcon name="folder-open-outline" tone={pinnedSelected ? 'accent' : mutedIconTone} size={15} />
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
											numberOfLines={1}
										>
											Remembered local {group.rows.length === 1 ? 'file' : 'files'} · {group.summary}
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
									<OMIcon name="trash-outline" tone={mutedIconTone} size={15} />
								</Pressable>
							</View>
							)
						})}
						{cachedRemotePickers.map((remoteFile) => {
							const cachedSelected =
								Boolean(activeGenome) &&
								cachedRemoteMatchesActiveGenome(remoteFile, activeGenome) &&
								!activeIsSessionRow
							return (
							<View
								key={remoteFile.sourceUrl}
								testID="saved-local-file-row"
								style={[
									styles.labExplorerPinnedRow,
									cachedSelected ? styles.labExplorerPinnedRowSelected : null,
								]}
							>
								<Pressable
									disabled={savedHandlesLoading}
									onPress={() => {
										onRestoreCachedRemote(remoteFile)
										onRequestClose?.()
									}}
									style={[
										styles.labExplorerRowMain,
										savedHandlesLoading ? styles.labExplorerRowMainMuted : null,
									]}
								>
									<OMIcon name="layers-outline" tone={cachedSelected ? 'accent' : mutedIconTone} size={15} />
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
											numberOfLines={1}
										>
											{cachedRemoteGenomeMeta(remoteFile)}
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
									<OMIcon name="trash-outline" tone={mutedIconTone} size={15} />
								</Pressable>
							</View>
							)
						})}
					</View>
				</View>

			</ScrollView>
			<View style={styles.labExplorerFooter}>
				<SidebarSettingsMenu />
				<WebThemeToggle scheme={scheme} />
			</View>
		</View>
	)
}

// === Drop zone (sidebar explorer only) =====================================

function ImportGenomeButton({ dragActive, onPress }: { dragActive: boolean; onPress: () => void }) {
	const { styles, palette } = useTheme()
	return (
		<Pressable
			onPress={onPress}
			style={({ hovered, pressed }) => [
				styles.explorerDropPanel,
				dragActive ? styles.explorerDropPanelActive : null,
				hovered && styles.buttonHover,
				pressed && styles.buttonPressed,
			]}
		>
			<PlatformSvgUri uri={microscopeIconUri} width={20} height={20} color={palette.accent} />
			<View style={styles.explorerDropTitleCluster}>
				<OMText variant="subtitle" style={styles.explorerDropTitle}>
					Import genome
				</OMText>
				<OMText variant="caption" style={styles.explorerDropSubtitle}>
					Files, URL, or drag and drop
				</OMText>
			</View>
		</Pressable>
	)
}

function UrlLoadBox({
	composer,
	narrow,
	onCopyShareUrl,
	onLoadUrl,
	onUrlInputChange,
	shareUrl,
	shareUrlCopied,
	urlInput,
}: {
	composer?: boolean
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
		? 'Text, ZIP SNP array, or VCF URL…'
		: 'Paste a text, ZIP SNP array, or VCF URL…'
	const sampleZipUrl = LAB_TEST_FILES.find((bundle) => bundle.id === 'biovault-23andme-sample')?.remoteUrl
	const hasUrl = Boolean(urlInput.trim())
	const boxStyle = [
		styles.urlLoadBox,
		narrow && composer ? styles.urlLoadBoxComposer : null,
		narrow && !composer ? styles.urlLoadBoxSidebar : null,
	]
	const loadButtonStyles =
		narrow && composer
			? [
					styles.urlLoadButtonComposerOutline,
					hasUrl ? styles.urlLoadButtonComposerOutlineActive : styles.urlLoadButtonComposerOutlineDisabled,
				]
			: [hasUrl ? styles.urlLoadButton : styles.urlLoadButtonDisabled, narrow ? styles.urlLoadButtonSidebar : null]

	const loadLabelStyle =
		narrow && composer
			? hasUrl
				? styles.urlLoadButtonComposerOutlineLabel
				: styles.urlLoadButtonComposerOutlineLabelMuted
			: hasUrl
				? styles.pickerActionText
				: styles.pickerActionMutedText
	return (
		<View style={boxStyle}>
			<View style={[styles.urlLoadHeader, composer && narrow ? styles.urlLoadHeaderComposer : null]}>
				<OMIcon name="link-outline" tone={composer && narrow ? 'muted' : 'accent'} size={composer ? 14 : 16} />
				<OMText
					variant="caption"
					style={[styles.urlLoadTitle, composer && narrow ? styles.urlLoadTitleComposer : null]}
				>
					{narrow ? 'Load from URL' : 'Or load from URL'}
				</OMText>
			</View>
			<View style={[styles.urlLoadRow, narrow ? styles.urlLoadRowSidebar : null]}>
				<TextInput
					value={urlInput}
					onChangeText={onUrlInputChange}
					placeholder={placeholder}
					placeholderTextColor={palette.textFaint}
					style={[
						styles.urlLoadInput,
						narrow && composer ? styles.urlLoadInputComposer : null,
						narrow && !composer ? styles.urlLoadInputSidebar : null,
					]}
					autoCapitalize="none"
					autoCorrect={false}
					keyboardType="url"
					returnKeyType="go"
					onSubmitEditing={() => onLoadUrl(urlInput)}
				/>
				<Pressable
					onPress={() => onLoadUrl(urlInput)}
					disabled={!urlInput.trim()}
					style={({ hovered, pressed }) => [
						loadButtonStyles,
						hovered && hasUrl && styles.buttonHover,
						pressed && hasUrl && styles.buttonPressed,
					]}
				>
					<OMText variant="subtitle" style={loadLabelStyle}>
						Load
					</OMText>
				</Pressable>
			</View>
			{narrow && composer ? null : (
				<View style={styles.urlLoadHelpBlock}>
					<OMText variant="caption" style={styles.pickerIntro}>
						Paste a URL to a text or zip SNP array, or VCF to download into the browser.
					</OMText>
					{sampleZipUrl ? (
						<OMText variant="caption" style={styles.urlLoadExampleText} selectable>
							Example: {sampleZipUrl}
						</OMText>
					) : null}
				</View>
			)}
			{shareUrl ? (
				<View style={[styles.shareLinkBox, composer && narrow ? styles.shareLinkBoxComposer : null]}>
					<OMText variant="caption" style={styles.urlLoadTitle}>
						Shareable lab link
					</OMText>
					<OMText variant="caption" style={styles.shareLinkText} selectable>
						{shareUrl}
					</OMText>
					<Pressable
						onPress={onCopyShareUrl}
						style={({ hovered, pressed }) => [
							styles.intentSecondaryButton,
							narrow ? styles.urlShareButtonSidebar : null,
							hovered && styles.buttonHover,
							pressed && styles.buttonPressed,
						]}
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

// === Genome companion file slots (site header) =============================

function GenomeSlotStrip({
	genome,
	onGenerateIndexes,
}: {
	genome: LabGenomeRef
	onGenerateIndexes?: () => void
}) {
	const { styles } = useTheme()
	if (genome.kind !== 'cram' && genome.kind !== 'vcf') return null
	const canGenerateIndexes = genome.kind === 'cram' && Boolean(onGenerateIndexes) && (!genome.crai || (genome.fasta && !genome.fai))
	return (
		<View style={styles.heroGenomeSlotStrip} accessibilityRole="none">
			<View style={[styles.slotGrid, styles.heroGenomeSlotGrid]}>
				{genome.kind === 'cram' ? (
					<>
						<SlotChip label={genome.primary.kind === 'bam' ? '.bam' : '.cram'} file={genome.primary} />
						<SlotChip label={genome.primary.kind === 'bam' ? '.bam.bai optional' : '.cram.crai optional'} file={genome.crai} />
						<SlotChip label=".fa" file={genome.fasta} />
						<SlotChip label=".fa.fai optional" file={genome.fai} />
					</>
				) : (
					<>
						<SlotChip label=".vcf.gz" file={genome.primary} />
						<SlotChip label=".vcf.gz.tbi optional" file={genome.tbi} />
					</>
				)}
				{canGenerateIndexes ? (
					<Pressable
						accessibilityRole="button"
						onPress={() => onGenerateIndexes?.()}
						style={({ hovered, pressed }) => [
							styles.slotGenerateButton,
							hovered && styles.buttonHover,
							pressed && styles.buttonPressed,
						]}
					>
						<OMIcon name="construct-outline" tone="accent" size={14} />
						<OMText variant="caption" style={styles.slotGenerateButtonText}>
							Generate indexes
						</OMText>
					</Pressable>
				) : null}
			</View>
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
	genome,
	kindFilter,
	onDownload,
	onForgetRemoteAssay,
	onImportUrl,
	onKindFilterChange,
	onQueryChange,
	onRun,
	onViewSource,
	query,
	registryReadyIds,
	results,
	runningAssayId,
	sessionAssays,
	runtimeWarmupStatus,
}: {
	genome: LabGenomeRef
	kindFilter: 'all' | 'panel' | 'assay'
	onDownload: (assay: LabAssay) => void
	onForgetRemoteAssay: (assay: LabAssay) => void
	onImportUrl: (url: string) => void
	onKindFilterChange: (kind: 'all' | 'panel' | 'assay') => void
	onQueryChange: (q: string) => void
	onRun: (assay: LabAssay) => void
	onViewSource: (assay: LabAssay) => void
	query: string
	registryReadyIds: Set<string>
	results: LabAssay[]
	runningAssayId: string | null
	sessionAssays: SessionLabAssay[]
	runtimeWarmupStatus: RuntimeWarmupStatus
}) {
	const { palette, styles } = useTheme()
	const anyRunning = Boolean(runningAssayId)
	const trimmedQuery = query.trim()
	const queryIsUrl = /^https?:\/\//i.test(trimmedQuery)
	const showRuntimeWarmupNotice =
		isLabGenomeComplete(genome) &&
		runtimeWarmupStatus === 'loading' &&
		results.some((assay) => isAssayCompatible(assay, genome) && assayNeedsWebRuntime(assay, genome))
	const renderAssayRow = (
		assay: LabAssay,
		index: number,
		options: { inPanelGroup?: boolean; parentPanel?: SessionLabAssay } = {},
	) => {
		const displayKind = assayDisplayKind(assay)
		const isPanel = isSessionLabAssay(assay) && displayKind === 'panel'
		const isRemote = isSessionLabAssay(assay)
		const packageReady = sessionAssayPackageReady(assay, registryReadyIds)
		const panelVariants = isPanel ? panelVariantAssays(assay, sessionAssays) : []
		const parentPanels = options.parentPanel ? [options.parentPanel] : (!isPanel ? parentPanelsForAssay(assay, sessionAssays) : [])
		const lockedByParent = parentPanels.length > 0
		const compatible = isAssayCompatible(assay, genome)
		const waitingForRuntime =
			compatible &&
			runtimeWarmupStatus === 'loading' &&
			assayNeedsWebRuntime(assay, genome)
		const disabledReason = compatible
			? isPanel
				? panelVariants.length
					? `${panelVariants.length} panel assays ready.`
					: packageReady
						? 'Cached package ready.'
					: 'Fetch panel dependencies first.'
				: waitingForRuntime
				? 'Runtime is loading.'
				: getLabRunDisabledReasonForRef(genome, assay.language)
			: 'Assay is not compatible with this genome format.'
		const isRunning = runningAssayId === assay.id
		const disabled = anyRunning || !compatible || waitingForRuntime || (isPanel && !panelVariants.length && !packageReady)
		return (
			<Pressable
				key={`${assay.id}-${index}`}
				testID="assay-result-row"
				accessibilityLabel={`View assay ${assay.title}`}
				onPress={() => onViewSource(assay)}
				style={[
					styles.pickerRow,
					displayKind === 'panel' ? styles.pickerRowPanel : null,
					options.inPanelGroup ? styles.pickerRowInPanelGroup : null,
					!compatible ? styles.pickerRowIncompatible : null,
					disabled && !isRunning && !isPanel ? styles.pickerRowDisabled : null,
				]}
			>
				<View style={styles.pickerText}>
						<View style={styles.assayTitleRow}>
							<OMText variant="body" style={styles.pickerTitle} numberOfLines={1}>
								{assay.title}
							</OMText>
						</View>
					<OMText variant="caption" style={styles.pickerMeta} numberOfLines={1}>
						{assay.inputFormats.map((f) => ASSAY_INPUT_FORMAT_LABELS[f]).join(' / ')}
						{isRemote ? ' · Cached remote' : ''}
						{disabledReason ? ` · ${disabledReason}` : ''}
					</OMText>
					{parentPanels.length && !options.inPanelGroup ? (
						<OMText variant="caption" style={styles.pickerMeta} numberOfLines={1}>
							Part of: {parentPanels.map((panel) => panel.title).join(', ')}
						</OMText>
					) : null}
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
						{isRemote && !lockedByParent ? (
							<Pressable
								accessibilityLabel={`Forget assay ${assay.title}`}
								accessibilityRole="button"
								onPress={(event) => {
									event.stopPropagation?.()
									void onForgetRemoteAssay(assay)
								}}
								style={({ hovered, pressed }) => [
									styles.assayGhostAction,
									hovered && styles.buttonHover,
									pressed && styles.buttonPressed,
								]}
								hitSlop={6}
							>
								<OMIcon name="trash-outline" tone="danger" color={palette.dangerText} size={15} />
							</Pressable>
						) : null}
						<Pressable
							accessibilityLabel={
								packageReady
									? `Run ${assay.title}`
									: `Download ${assay.title}`
							}
							accessibilityRole="button"
							disabled={disabled}
							onPress={(event) => {
								event.stopPropagation?.()
								if (!packageReady) {
									onDownload(assay)
								} else {
									onRun(assay)
								}
							}}
							style={({ hovered, pressed }) => [
								!disabled || isRunning ? styles.pickerAction : styles.pickerActionMuted,
								hovered && !disabled && styles.buttonHover,
								pressed && !disabled && styles.buttonPressed,
							]}
						>
							{compatible && !packageReady ? (
								<OMIcon
									name="cloud-download-outline"
									tone={!disabled || isRunning ? 'inverse' : 'muted'}
									color={!disabled || isRunning ? palette.invertText : undefined}
									size={16}
								/>
							) : null}
							<OMText
								variant="subtitle"
								style={!disabled || isRunning ? styles.pickerActionText : styles.pickerActionMutedText}
							>
								{!compatible
									? 'Unavailable'
									: !packageReady
										? 'Download'
										: isPanel
											? 'Run panel'
											: 'Run assay'}
							</OMText>
						</Pressable>
					</View>
				)}
			</Pressable>
		)
	}

	return (
		<View style={styles.pickerSection}>
			{showRuntimeWarmupNotice ? (
				<View style={styles.runtimeWarmupNotice}>
					<ActivityIndicator size="small" color={palette.accent} />
					<OMText variant="caption" style={styles.runtimeWarmupText}>
						Preparing local runtime. Runs will unlock automatically.
					</OMText>
				</View>
			) : null}

			<View style={styles.searchBox}>
				<OMIcon name="search-outline" tone="muted" size={16} />
				<TextInput
					value={query}
					onChangeText={onQueryChange}
					placeholder="Search assays or import from URL…"
					placeholderTextColor={palette.textFaint}
					style={styles.searchInput}
					returnKeyType={queryIsUrl ? 'go' : 'search'}
					onSubmitEditing={() => {
						if (queryIsUrl) onImportUrl(trimmedQuery)
					}}
				/>
				{queryIsUrl ? (
					<Pressable
						accessibilityLabel="Import assay from URL"
						accessibilityRole="button"
						onPress={() => onImportUrl(trimmedQuery)}
						style={({ hovered, pressed }) => [
							styles.searchImportButton,
							hovered && styles.buttonHover,
							pressed && styles.buttonPressed,
						]}
					>
						<OMIcon name="cloud-download-outline" tone="inverse" size={15} />
						<OMText variant="subtitle" style={styles.searchImportButtonText}>
							Get
						</OMText>
					</Pressable>
				) : query ? (
					<Pressable
						onPress={() => onQueryChange('')}
						style={({ hovered, pressed }) => [
							styles.clearBtn,
							hovered && styles.buttonHover,
							pressed && styles.buttonPressed,
						]}
					>
						<OMIcon name="close-circle" tone="muted" size={16} />
					</Pressable>
				) : null}
			</View>

			<View style={styles.pickerFilterRow}>
				{(['panel', 'assay', 'all'] as const).map((kind) => {
					const active = kindFilter === kind
					const label = kind === 'all' ? 'All' : kind === 'panel' ? 'Panels' : 'Assays'
					return (
						<Pressable
							key={kind}
							accessibilityRole="button"
							accessibilityState={{ selected: active }}
							onPress={() => onKindFilterChange(kind)}
							style={[styles.pickerFilterChip, active ? styles.pickerFilterChipActive : null]}
						>
							<OMText
								variant="caption"
								style={[styles.pickerFilterChipText, active ? styles.pickerFilterChipTextActive : null]}
							>
								{label}
							</OMText>
						</Pressable>
					)
				})}
			</View>

			{results.length === 0 ? (
				<OMText variant="caption" style={styles.mutedHint}>
					No assays match this search. Try clearing search text.
				</OMText>
			) : kindFilter === 'assay' ? (
				(() => {
					const groups = new Map<string, { panel: SessionLabAssay | null; assays: LabAssay[] }>()
					for (const assay of results) {
						const parents = parentPanelsForAssay(assay, sessionAssays)
						if (parents.length === 0) {
							const entry = groups.get('__standalone__') ?? { panel: null, assays: [] }
							entry.assays.push(assay)
							groups.set('__standalone__', entry)
						} else {
							for (const parent of parents) {
								const entry = groups.get(parent.id) ?? { panel: parent, assays: [] }
								entry.assays.push(assay)
								groups.set(parent.id, entry)
							}
						}
					}
					const orderedGroups = Array.from(groups.values()).sort((a, b) => {
						if (a.panel && !b.panel) return -1
						if (!a.panel && b.panel) return 1
						return (a.panel?.title ?? '').localeCompare(b.panel?.title ?? '')
					})
					return (
						<View style={styles.pickerList}>
							{orderedGroups.map((group, groupIndex) => (
								<View key={group.panel?.id ?? '__standalone__'} style={styles.panelAssayGroup}>
									<View style={styles.panelAssayGroupHeader}>
										<OMIcon
											name={group.panel ? 'layers-outline' : 'flask-outline'}
											tone="accent"
											size={14}
										/>
										<OMText variant="caption" style={styles.panelAssayGroupTitle}>
											{group.panel ? `Part of ${group.panel.title}` : 'Standalone assays'}
										</OMText>
									</View>
									<View style={styles.panelAssayGroupChildren}>
										{group.assays.map((assay, assayIndex) =>
											renderAssayRow(assay, groupIndex * 1000 + assayIndex, {
												inPanelGroup: true,
												parentPanel: group.panel ?? undefined,
											}),
										)}
									</View>
								</View>
							))}
						</View>
					)
				})()
			) : (
				<View style={styles.pickerList}>
					{results.map((assay, index) => renderAssayRow(assay, index))}
				</View>
			)}
		</View>
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
				<View style={{ flex: 1, gap: 2 }}>
					<OMText variant="caption" style={styles.runCardKicker}>
						{ASSAY_CATEGORY_LABELS[assay.category]}
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
						style={({ hovered, pressed }) => [
							styles.textButton,
							styles.resultPrimaryButton,
							hovered && styles.buttonHover,
							pressed && styles.buttonPressed,
						]}
					>
						<OMText variant="subtitle" style={styles.resultPrimaryButtonText}>
							View result
						</OMText>
					</Pressable>
				) : null}
				<Pressable
					accessibilityRole="button"
					onPress={onViewSource}
					style={({ hovered, pressed }) => [
						styles.textButton,
						hovered && styles.buttonHover,
						pressed && styles.buttonPressed,
					]}
				>
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
							onMouseEnter: (event: { currentTarget: HTMLButtonElement }) => {
								event.currentTarget.style.opacity = '0.9'
							},
							onMouseDown: (event: { currentTarget: HTMLButtonElement }) => {
								event.currentTarget.style.transform = 'scale(0.98)'
							},
							onMouseUp: (event: { currentTarget: HTMLButtonElement }) => {
								event.currentTarget.style.transform = 'scale(1)'
							},
							onMouseLeave: (event: { currentTarget: HTMLButtonElement }) => {
								event.currentTarget.style.opacity = '1'
								event.currentTarget.style.transform = 'scale(1)'
							},
							style: {
								background: '#fff',
								border: '1px solid #cbd5df',
								borderRadius: 6,
								color: '#1f2933',
								cursor: 'pointer',
								fontFamily: 'system-ui, sans-serif',
								fontSize: 12,
								padding: '6px 12px',
								transition: 'opacity 140ms ease, transform 120ms ease, background-color 140ms ease, border-color 140ms ease',
							},
							children: 'Open in new tab',
						}) : null,
						createElement('button', {
							key: 'close',
							onClick: onClose,
							onMouseEnter: (event: { currentTarget: HTMLButtonElement }) => {
								event.currentTarget.style.opacity = '0.9'
							},
							onMouseDown: (event: { currentTarget: HTMLButtonElement }) => {
								event.currentTarget.style.transform = 'scale(0.98)'
							},
							onMouseUp: (event: { currentTarget: HTMLButtonElement }) => {
								event.currentTarget.style.transform = 'scale(1)'
							},
							onMouseLeave: (event: { currentTarget: HTMLButtonElement }) => {
								event.currentTarget.style.opacity = '1'
								event.currentTarget.style.transform = 'scale(1)'
							},
							style: {
								background: '#1f2933',
								border: 'none',
								borderRadius: 6,
								color: '#fff',
								cursor: 'pointer',
								fontFamily: 'system-ui, sans-serif',
								fontSize: 12,
								padding: '6px 12px',
								transition: 'opacity 140ms ease, transform 120ms ease, background-color 140ms ease, border-color 140ms ease',
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

/** Mounted on the fullscreen clear-data dialog portaled under `document.body`. Lab header popover skips outside-dismiss when this subtree is clicked. */
const CLEAR_STORAGE_CONFIRM_MODAL_DOM_ID = 'biovault-clear-storage-modal'

function ClearAllButton() {
	const { palette } = useTheme()
	const [confirming, setConfirming] = useState(false)
	const [busy, setBusy] = useState(false)
	const onClick = useCallback(() => setConfirming(true), [])
	const onCancel = useCallback(() => setConfirming(false), [])
	useEffect(() => {
		if (!confirming || typeof document === 'undefined') return
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== 'Escape' || busy) return
			e.preventDefault()
			onCancel()
		}
		document.addEventListener('keydown', onKey)
		return () => document.removeEventListener('keydown', onKey)
	}, [confirming, busy, onCancel])
	const onConfirm = useCallback(async () => {
		setBusy(true)
		try {
			await clearAllAppStorage()
		} finally {
			window.location.reload()
		}
	}, [])
	return createElement('div', {
		style: { alignSelf: 'stretch' },
		children: [
			createElement('button', {
				key: 'btn',
				type: 'button',
				onClick,
				onMouseEnter: (event: { currentTarget: HTMLButtonElement }) => {
					event.currentTarget.style.opacity = '0.9'
				},
				onMouseDown: (event: { currentTarget: HTMLButtonElement }) => {
					event.currentTarget.style.transform = 'scale(0.98)'
				},
				onMouseUp: (event: { currentTarget: HTMLButtonElement }) => {
					event.currentTarget.style.transform = 'scale(1)'
				},
				onMouseLeave: (event: { currentTarget: HTMLButtonElement }) => {
					event.currentTarget.style.opacity = '1'
					event.currentTarget.style.transform = 'scale(1)'
				},
				style: {
					alignSelf: 'stretch',
					background: palette.surfaceRaised,
					border: `1px solid ${palette.borderStrong}`,
					borderRadius: 8,
					color: palette.dangerText,
					cursor: 'pointer',
					fontFamily: 'system-ui, sans-serif',
					fontSize: 13,
					fontWeight: 600,
					padding: '10px 12px',
					transition: 'opacity 140ms ease, transform 120ms ease, background-color 140ms ease, border-color 140ms ease',
					width: '100%',
				},
				children: 'Clear all stored data…',
			}),
			confirming
				? createPortal(createElement('div', {
						key: 'modal',
						id: CLEAR_STORAGE_CONFIRM_MODAL_DOM_ID,
						style: {
							alignItems: 'center',
							background: palette.overlayBg,
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
								background: palette.surfaceSolid,
								borderRadius: 12,
								border: `1px solid ${palette.border}`,
								color: palette.text,
								maxWidth: 420,
								padding: 24,
								width: '100%',
							},
							children: [
								createElement('div', {
									key: 'title',
									style: {
										fontFamily: 'system-ui, sans-serif',
										fontSize: 16,
										fontWeight: 700,
										marginBottom: 8,
										color: palette.text,
									},
									children: 'Clear all stored data?',
								}),
								createElement('div', {
									key: 'body',
									style: {
										color: palette.textMuted,
										fontFamily: 'system-ui, sans-serif',
										fontSize: 13,
										lineHeight: 1.4,
										marginBottom: 16,
									},
									children:
										'This wipes Biovault data in this browser: web app tables (imports, preferences, runs), cached remote resources and packages, downloaded remote lab blobs, persisted file handles, feed notification database, and local analytics identifiers. The page reloads afterward. Built-in HTTP cache and other websites are unaffected. This cannot be undone.',
								}),
								createElement('div', {
									key: 'actions',
									style: { display: 'flex', gap: 8, justifyContent: 'flex-end' },
									children: [
										createElement('button', {
											key: 'cancel',
											type: 'button',
											onClick: onCancel,
											disabled: busy,
											onMouseEnter: (event: { currentTarget: HTMLButtonElement }) => {
												if (!busy) event.currentTarget.style.opacity = '0.9'
											},
											onMouseDown: (event: { currentTarget: HTMLButtonElement }) => {
												if (!busy) event.currentTarget.style.transform = 'scale(0.98)'
											},
											onMouseUp: (event: { currentTarget: HTMLButtonElement }) => {
												event.currentTarget.style.transform = 'scale(1)'
											},
											onMouseLeave: (event: { currentTarget: HTMLButtonElement }) => {
												event.currentTarget.style.opacity = '1'
												event.currentTarget.style.transform = 'scale(1)'
											},
											style: {
												background: palette.surfaceRaised,
												border: `1px solid ${palette.borderStrong}`,
												borderRadius: 6,
												color: palette.text,
												cursor: busy ? 'default' : 'pointer',
												fontFamily: 'system-ui, sans-serif',
												fontSize: 12,
												padding: '6px 12px',
												transition: 'opacity 140ms ease, transform 120ms ease, background-color 140ms ease, border-color 140ms ease',
											},
											children: 'Cancel',
										}),
										createElement('button', {
											key: 'confirm',
											type: 'button',
											onClick: onConfirm,
											disabled: busy,
											onMouseEnter: (event: { currentTarget: HTMLButtonElement }) => {
												if (!busy) event.currentTarget.style.opacity = '0.9'
											},
											onMouseDown: (event: { currentTarget: HTMLButtonElement }) => {
												if (!busy) event.currentTarget.style.transform = 'scale(0.98)'
											},
											onMouseUp: (event: { currentTarget: HTMLButtonElement }) => {
												event.currentTarget.style.transform = 'scale(1)'
											},
											onMouseLeave: (event: { currentTarget: HTMLButtonElement }) => {
												event.currentTarget.style.opacity = '1'
												event.currentTarget.style.transform = 'scale(1)'
											},
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
												transition: 'opacity 140ms ease, transform 120ms ease, background-color 140ms ease, border-color 140ms ease',
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

function VcfIndexPrompt({
	onCancel,
	onConfirm,
	state,
}: {
	onCancel: () => void
	onConfirm: () => void
	state: PendingVcfIndexRun
}) {
	const { styles, mutedIconTone } = useTheme()
	const busy = state.status === 'generating'
	const fileName = state.genome.primary.name
	return (
		<LabModalChrome
			accessibilityLabel="Generate VCF index"
			layerStyle={styles.vcfIndexPromptLayer}
			onBackdropDismiss={onCancel}
			panelStyle={styles.vcfIndexPromptPanel}
		>
			<View style={styles.vcfIndexPromptChrome} accessibilityRole="alert">
				<View style={styles.unknownAlertHeadRow}>
					<View style={styles.unknownNoteHead}>
						<OMIcon name="alert-circle-outline" tone={mutedIconTone} size={18} />
						<OMText variant="subtitle" style={styles.vcfIndexPromptTitle}>
							No index for {fileName}
						</OMText>
					</View>
					<Pressable
						accessibilityLabel="Cancel index generation"
						accessibilityRole="button"
						onPress={onCancel}
						style={({ hovered, pressed }) => [
							styles.intentClose,
							hovered && styles.buttonHover,
							pressed && styles.buttonPressed,
						]}
					>
						<OMIcon name="close-outline" tone={mutedIconTone} size={16} />
					</Pressable>
				</View>
				<OMText variant="body" style={styles.vcfIndexPromptBody}>
					Do you want to generate {generatedVcfIndexName(fileName)} now?
				</OMText>
				{state.error ? (
					<OMText variant="caption" style={styles.vcfIndexPromptError}>
						{state.error}
					</OMText>
				) : null}
				<View style={styles.intentActions}>
					<Pressable
						accessibilityRole="button"
						onPress={onCancel}
						style={({ hovered, pressed }) => [
							styles.intentSecondaryButton,
							hovered && styles.buttonHover,
							pressed && styles.buttonPressed,
						]}
					>
						<OMText variant="subtitle" style={styles.intentSecondaryText}>
							Cancel
						</OMText>
					</Pressable>
					<Pressable
						accessibilityRole="button"
						onPress={onConfirm}
						disabled={busy}
						style={({ hovered, pressed }) => [
							styles.intentPrimaryButton,
							hovered && !busy && styles.buttonHover,
							pressed && !busy && styles.buttonPressed,
						]}
					>
						{busy ? <ActivityIndicator color="#fff" size="small" /> : null}
						<OMText variant="subtitle" style={styles.primaryButtonText}>
							{busy ? 'Generating' : 'Generate index'}
						</OMText>
					</Pressable>
				</View>
			</View>
		</LabModalChrome>
	)
}

function AlignmentIndexPrompt({
	onCancel,
	onConfirm,
	state,
}: {
	onCancel: () => void
	onConfirm: () => void
	state: PendingAlignmentIndexRun
}) {
	const { styles, mutedIconTone } = useTheme()
	const busy = state.status === 'generating'
	const fileName = state.genome.primary.name
	const names = [
		state.missing.includes('alignment') ? generatedAlignmentIndexName(state.genome.primary.name) : null,
		state.missing.includes('reference') && state.genome.fasta ? generatedFastaIndexName(state.genome.fasta.name) : null,
	].filter((name): name is string => Boolean(name))
	const canGenerate = state.missing.length > 0
	const bodyText = names.length
		? `Do you want to generate ${names.join(' and ')} now?`
		: state.error ?? 'This alignment format is not available for browser assay runs yet.'
	const titleText = canGenerate ? `Missing indexes for ${fileName}` : 'Browser assay run unavailable'
	return (
		<LabModalChrome
			accessibilityLabel="Generate alignment indexes"
			layerStyle={styles.vcfIndexPromptLayer}
			onBackdropDismiss={onCancel}
			panelStyle={styles.vcfIndexPromptPanel}
		>
			<View style={styles.vcfIndexPromptChrome} accessibilityRole="alert">
				<View style={styles.unknownAlertHeadRow}>
					<View style={styles.unknownNoteHead}>
						<OMIcon name="alert-circle-outline" tone={mutedIconTone} size={18} />
						<OMText variant="subtitle" style={styles.vcfIndexPromptTitle}>
							{titleText}
						</OMText>
					</View>
					<Pressable
						accessibilityLabel="Cancel index generation"
						accessibilityRole="button"
						onPress={onCancel}
						style={({ hovered, pressed }) => [
							styles.intentClose,
							hovered && styles.buttonHover,
							pressed && styles.buttonPressed,
						]}
					>
						<OMIcon name="close-outline" tone={mutedIconTone} size={16} />
					</Pressable>
				</View>
				<OMText variant="body" style={styles.vcfIndexPromptBody}>
					{bodyText}
				</OMText>
				{state.error && names.length ? (
					<OMText variant="caption" style={styles.vcfIndexPromptError}>
						{state.error}
					</OMText>
				) : null}
				<View style={styles.intentActions}>
					<Pressable
						accessibilityRole="button"
						onPress={onCancel}
						style={({ hovered, pressed }) => [
							styles.intentSecondaryButton,
							hovered && styles.buttonHover,
							pressed && styles.buttonPressed,
						]}
					>
						<OMText variant="subtitle" style={styles.intentSecondaryText}>
							{canGenerate ? 'Cancel' : 'Close'}
						</OMText>
					</Pressable>
					{canGenerate ? (
						<Pressable
							accessibilityRole="button"
							onPress={onConfirm}
							disabled={busy}
							style={({ hovered, pressed }) => [
								styles.intentPrimaryButton,
								hovered && !busy && styles.buttonHover,
								pressed && !busy && styles.buttonPressed,
							]}
						>
							{busy ? <ActivityIndicator color="#fff" size="small" /> : null}
							<OMText variant="subtitle" style={styles.primaryButtonText}>
								{busy ? 'Generating' : 'Generate indexes'}
							</OMText>
						</Pressable>
					) : null}
				</View>
			</View>
		</LabModalChrome>
	)
}

// === Unknown files alert (modal) ===========================================

function UnknownFilesAlert({
	onDismissAll,
	onRemove,
	unknowns,
}: {
	onDismissAll: () => void
	onRemove: (id: string) => void
	unknowns: UnknownEntry[]
}) {
	const { styles, mutedIconTone } = useTheme()
	if (!unknowns.length) return null
	return (
		<LabModalChrome
			accessibilityLabel="Unknown files alert"
			layerStyle={styles.unknownFilesAlertLayer}
			onBackdropDismiss={onDismissAll}
			panelStyle={styles.unknownFilesAlertPanel}
		>
			<View style={styles.unknownAlertChrome} accessibilityRole="alert">
				<View style={styles.unknownAlertHeadRow}>
					<View style={styles.unknownNoteHead}>
						<OMIcon name="alert-circle-outline" tone={mutedIconTone} size={18} />
						<OMText variant="subtitle" style={styles.unknownNoteTitle}>
							Couldn’t use {unknowns.length} file{unknowns.length === 1 ? '' : 's'}
						</OMText>
					</View>
					<Pressable
						accessibilityLabel="Dismiss alert"
						accessibilityRole="button"
						onPress={onDismissAll}
						style={({ hovered, pressed }) => [
							styles.intentClose,
							hovered && styles.buttonHover,
							pressed && styles.buttonPressed,
						]}
					>
						<OMIcon name="close-outline" tone={mutedIconTone} size={16} />
					</Pressable>
				</View>
				<View style={styles.unknownAlertRows}>
					{unknowns.map((u) => (
						<View key={u.id} style={styles.unknownRow}>
							<OMText variant="caption" style={styles.unknownRowName} numberOfLines={2}>
								{u.file.name}
							</OMText>
							<Pressable
								onPress={() => onRemove(u.id)}
								style={({ hovered, pressed }) => [
									styles.textButton,
									hovered && styles.buttonHover,
									pressed && styles.buttonPressed,
								]}
							>
								<OMText variant="subtitle" style={styles.textButtonText}>
									Remove
								</OMText>
							</Pressable>
						</View>
					))}
				</View>
			</View>
		</LabModalChrome>
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
		<LabModalChrome accessibilityLabel="Source files dialog" onBackdropDismiss={onClose}>
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
				<Pressable
					accessibilityRole="button"
					onPress={onClose}
					style={({ hovered, pressed }) => [
						styles.iconButton,
						hovered && styles.buttonHover,
						pressed && styles.buttonPressed,
					]}
				>
					<OMIcon name="close-outline" tone="muted" size={18} />
				</Pressable>
			</View>

			{viewer.files.length > 1 ? (
				<ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sourceTabsScroll}>
					<View style={styles.sourceTabs}>
						{viewer.files.map((file, index) => {
							const basename = file.name.split('/').pop() || file.name
							const active = selectedIndex === index
							return (
								<Pressable
									key={`${file.name}-${index}`}
									onPress={() => setSelectedIndex(index)}
									style={({ hovered, pressed }) => [
										styles.sourceTab,
										active ? styles.sourceTabActive : null,
										hovered && styles.buttonHover,
										pressed && styles.buttonPressed,
									]}
									accessibilityLabel={file.name}
								>
									<OMText
										variant="caption"
										style={active ? styles.sourceTabTextActive : styles.sourceTabText}
										ellipsizeMode="middle"
										numberOfLines={1}
									>
										{basename}
									</OMText>
								</Pressable>
							)
						})}
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
						<ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sourcePathScroll}>
							<OMText variant="caption" style={styles.runCardHint} selectable>
								{selected.source}
							</OMText>
						</ScrollView>
					) : null}
					<ScrollView style={styles.sourceCodeScroll}>
						<ScrollView horizontal>
							<HighlightedSourceCode file={selected} />
						</ScrollView>
					</ScrollView>
				</View>
			) : null}
		</LabModalChrome>
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

function WebVideoPlayer({ src, title }: { src: string; title: string }) {
	const { styles } = useTheme()
	if (Platform.OS !== 'web') return null

	return (
		<View style={styles.gettingStartedVideoPlayerHost}>
			{createElement('iframe', {
				allow:
					'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
				allowFullScreen: true,
				frameBorder: '0',
				referrerPolicy: 'strict-origin-when-cross-origin',
				src,
				style: {
					display: 'block',
					height: '100%',
					width: '100%',
					border: '0',
				},
				title,
			})}
		</View>
	)
}

function HowItWorksCard({
	body,
	title,
}: {
	body: string
	title: string
}) {
	const { styles } = useTheme()
	return (
		<View style={styles.howItWorksCard}>
			<OMText variant="subtitle" style={styles.howItWorksTitle}>
				{title}
			</OMText>
			<OMText variant="body" style={styles.howItWorksText}>
				{body}
			</OMText>
		</View>
	)
}

function LabGettingStartedPanel({
	assayTitle,
	demoRunPending = false,
	layout = 'page',
	onTryDemoRun,
	sampleTitle,
	showIntro: showIntroProp,
}: {
	assayTitle?: string
	demoRunPending?: boolean
	layout?: 'modal' | 'page'
	onTryDemoRun?: () => void
	sampleTitle?: string
	showIntro?: boolean
}) {
	const { palette, styles } = useTheme()
	const showIntro = showIntroProp ?? layout === 'page'
	return (
		<View style={styles.gettingStartedWrap}>
			<View style={styles.gettingStartedHeroGrid}>
				<View style={styles.gettingStartedPrimaryColumn}>
					{showIntro ? (
						<View style={styles.gettingStartedIntroBlock}>
							<OMText variant="h4" style={styles.gettingStartedTitle}>
								Getting Started
							</OMText>
							<OMText variant="body" style={styles.gettingStartedLead}>
								Add a genome from the sidebar, then select an assay to run from the catalog.
							</OMText>
						</View>
					) : null}

					{onTryDemoRun ? (
						<View style={styles.tryNowBlock}>
							<View style={styles.tryNowBody}>
								<OMText variant="headline" style={styles.tryNowTitle}>
									Run the sample workflow
								</OMText>
								<OMText variant="body" style={styles.tryNowText}>
									{demoRunPending
										? 'Preparing the sample genome and assay run. Nothing is uploaded.'
										: `Load ${sampleTitle ?? 'sample data'} and queue ${assayTitle ?? 'a demo assay'}. Nothing is uploaded.`}
								</OMText>
							</View>
							<Pressable
								onPress={onTryDemoRun}
								disabled={demoRunPending}
								style={({ hovered, pressed }) => [
									styles.intentPrimaryButton,
									styles.tryNowButton,
									hovered && !demoRunPending && styles.buttonHover,
									pressed && styles.gettingStartedBtnPressed,
									demoRunPending && styles.gettingStartedBtnDisabled,
								]}
								accessibilityRole="button"
								accessibilityLabel="Load sample data and run a demo assay locally"
							>
								{demoRunPending ? (
									<ActivityIndicator size="small" color="#fff" />
								) : (
									<OMIcon name="flask-outline" size={18} color={palette.pageBg === LAB_LANDING_PAGE_FILL ? '#ffffff' : undefined} tone="inverse" />
								)}
								<OMText variant="subtitle" style={[styles.primaryButtonText, styles.tryNowButtonText]}>
									{demoRunPending ? 'Loading sample...' : 'Run Example'}
								</OMText>
							</Pressable>
						</View>
					) : null}
				</View>

				<View style={styles.gettingStartedVideoBlock}>
					<View style={styles.gettingStartedVideoFrame}>
						{Platform.OS === 'web' ? (
							<WebVideoPlayer
								src={LAB_GETTING_STARTED_VIDEO_EMBED_URL}
								title="BioVault Lab walkthrough"
							/>
						) : null}
					</View>
				</View>
			</View>

			<View style={styles.howItWorksSection}>
				<View style={styles.howItWorksGrid}>
					<HowItWorksCard
						title="Local by default"
						body="Genome files are processed in your browser and are not uploaded to run assays."
					/>
					<HowItWorksCard
						title="WASM runtime"
						body="BioScript and genomics readers run through WebAssembly with worker-backed execution."
					/>
					<HowItWorksCard
						title="You control files"
						body="Use local files, cached remote resources, or sample data, then clear storage from settings."
					/>
				</View>
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

function SidebarToggleButton({
	open,
	onPress,
}: {
	open: boolean
	onPress: () => void
}) {
	const { styles, mutedIconTone, palette } = useTheme()
	return (
		<Pressable
			accessibilityLabel={open ? 'Close data sidebar' : 'Open data sidebar'}
			accessibilityRole="button"
			accessibilityState={{ expanded: open }}
			hitSlop={8}
			onPress={onPress}
			style={({ hovered, pressed }) => [
				styles.headerSidebarToggle,
				open ? styles.headerSidebarToggleOpen : null,
				hovered && styles.buttonHover,
				pressed && styles.headerSettingsTriggerPressed,
			]}
		>
			<OMIcon
				name={open ? 'close-outline' : 'folder-outline'}
				size={22}
				tone={open ? 'accent' : mutedIconTone}
				color={open ? palette.accentStrong : undefined}
			/>
		</Pressable>
	)
}

function GettingStartedButton({
	active = false,
	compact = false,
	onPress,
}: {
	active?: boolean
	compact?: boolean
	onPress: () => void
}) {
	const { styles, mutedIconTone, palette } = useTheme()
	const iconTone = active ? 'accent' : mutedIconTone
	return (
		<Pressable
			onPress={onPress}
			hitSlop={8}
			style={({ hovered, pressed }) => [
				styles.headerNavLink,
				compact ? styles.headerNavLinkCompact : null,
				active ? styles.headerNavLinkActive : null,
				hovered && styles.buttonHover,
				pressed && styles.headerNavLinkPressed,
			]}
			accessibilityRole="button"
			accessibilityState={{ selected: active }}
			accessibilityLabel="Open the getting started guide"
		>
			<View pointerEvents="none" style={styles.headerNavLinkIcon}>
				<OMIcon name="book-outline" size={18} tone={iconTone} />
			</View>
			{compact ? null : (
				<View pointerEvents="none">
					<OMText
						variant="caption"
						style={[styles.headerNavLinkLabel, active ? { color: palette.accent } : null]}
					>
						Getting Started
					</OMText>
				</View>
			)}
		</Pressable>
	)
}

function GithubButton({ compact = false }: { compact?: boolean }) {
	const { styles, mutedIconTone } = useTheme()
	return (
		<Pressable
			onPress={() => openGithub()}
			hitSlop={8}
			style={({ hovered, pressed }) => [
				styles.headerNavLink,
				compact ? styles.headerNavLinkCompact : null,
				hovered && styles.buttonHover,
				pressed && styles.headerNavLinkPressed,
			]}
			accessibilityRole="link"
			accessibilityLabel="View Biovault on GitHub"
		>
			<View pointerEvents="none" style={styles.headerNavLinkIcon}>
				<OMIcon name="logo-github" size={18} tone={mutedIconTone} />
			</View>
			{compact ? null : (
				<View pointerEvents="none">
					<OMText variant="caption" style={styles.headerNavLinkLabel}>
						GitHub
					</OMText>
				</View>
			)}
		</Pressable>
	)
}

function ContactButton({ compact = false }: { compact?: boolean }) {
	const { styles, mutedIconTone } = useTheme()
	return (
		<Pressable
			onPress={() => openContactEmail('header')}
			hitSlop={8}
			style={({ hovered, pressed }) => [
				styles.headerNavLink,
				compact ? styles.headerNavLinkCompact : null,
				hovered && styles.buttonHover,
				pressed && styles.headerNavLinkPressed,
			]}
			accessibilityRole="link"
			accessibilityLabel={`Contact: ${CONTACT_EMAIL}`}
		>
			<View pointerEvents="none" style={styles.headerNavLinkIcon}>
				<OMIcon name="mail-outline" size={18} tone={mutedIconTone} />
			</View>
			{compact ? null : (
				<View pointerEvents="none">
					<OMText variant="caption" style={styles.headerNavLinkLabel}>
						Contact
					</OMText>
				</View>
			)}
		</Pressable>
	)
}

function SidebarSettingsMenu() {
	const { styles, mutedIconTone, palette } = useTheme()
	const [open, setOpen] = useState(false)
	const wrapRef = useRef<View | null>(null)

	const close = useCallback(() => setOpen(false), [])
	const toggle = useCallback(() => setOpen((v) => !v), [])

	useEffect(() => {
		if (!open || typeof document === 'undefined') return
		const el = wrapRef.current as unknown as HTMLElement | null
		const onDocMouseDown = (e: MouseEvent) => {
			if (!(e.target instanceof Node)) return
			const clearModalRoot = document.getElementById(CLEAR_STORAGE_CONFIRM_MODAL_DOM_ID)
			if (clearModalRoot?.contains(e.target)) return
			if (el && !el.contains(e.target)) close()
		}
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return
			if (document.getElementById(CLEAR_STORAGE_CONFIRM_MODAL_DOM_ID)) return
			close()
		}
		document.addEventListener('mousedown', onDocMouseDown)
		window.addEventListener('keydown', onKeyDown)
		return () => {
			document.removeEventListener('mousedown', onDocMouseDown)
			window.removeEventListener('keydown', onKeyDown)
		}
	}, [open, close])

	return (
		<View ref={wrapRef} style={styles.sidebarSettingsWrap} collapsable={false}>
			<Pressable
				onPress={toggle}
				hitSlop={8}
				style={({ hovered, pressed }) => [
					styles.sidebarSettingsTrigger,
					open && styles.sidebarSettingsTriggerOpen,
					hovered && styles.buttonHover,
					pressed && styles.headerSettingsTriggerPressed,
				]}
				accessibilityRole="button"
				accessibilityState={{ expanded: open }}
				accessibilityLabel="Lab settings: theme and clear stored data"
			>
				<OMIcon
					name="settings-outline"
					size={16}
					tone={open ? 'accent' : mutedIconTone}
					color={open ? palette.accentStrong : undefined}
				/>
				<OMText
					variant="caption"
					style={[styles.sidebarSettingsLabel, open ? { color: palette.accentStrong } : null]}
				>
					Settings
				</OMText>
			</Pressable>
			{open ? (
				<View style={styles.sidebarSettingsPopover}>
					<View style={styles.headerSettingsPopoverSection}>
						<OMText variant="caption" style={styles.headerSettingsPopoverKicker}>
							Data
						</OMText>
						<ClearAllButton />
					</View>
				</View>
			) : null}
		</View>
	)
}

function FeedbackFooterButton() {
	const { styles, mutedIconTone } = useTheme()
	return (
		<Pressable
			onPress={() => openContactEmail('footer')}
			style={({ hovered, pressed }) => [
				styles.feedbackFooter,
				hovered && styles.buttonHover,
				pressed && styles.buttonPressed,
			]}
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
	const { styles, mutedIconTone } = useTheme()
	const { icon, label } =
		scheme === 'light'
			? { icon: 'sunny-outline' as const, label: 'Light' }
			: { icon: 'moon-outline' as const, label: 'Dark' }

	return (
		<Pressable
			onPress={() => toggleColorSchemePreferenceSync(scheme)}
			hitSlop={8}
			style={({ hovered, pressed }) => [
				styles.webThemeButton,
				scheme === 'light' ? styles.webThemeButtonLight : styles.webThemeButtonDark,
				hovered && styles.buttonHover,
				pressed && styles.buttonPressed,
			]}
			accessibilityRole="button"
			accessibilityLabel={`Color theme: ${label}. Press to toggle.`}
		>
			<View pointerEvents="none" style={styles.webThemeButtonIcon}>
				<OMIcon name={icon} size={14} tone={mutedIconTone} />
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
	const buttonMotion = Platform.OS === 'web'
		? ({
				transitionProperty: 'opacity, transform, background-color, border-color, color',
				transitionDuration: '140ms',
				transitionTimingFunction: 'ease',
			} as object)
		: {}
	const buttonHover = Platform.OS === 'web' ? ({ opacity: 0.9 } as object) : {}
	const buttonPressed = Platform.OS === 'web'
		? ({ opacity: 0.76, transform: [{ scale: 0.98 }] } as object)
		: ({ opacity: 0.76 } as object)
	return StyleSheet.create({
		safe: {
			flex: 1,
			backgroundColor: p.pageBg,
		},
		buttonHover,
		buttonPressed,
		scroll: { flex: 1 },
		content: {
			paddingHorizontal: LAB_COLUMN_GUTTER_X,
			paddingTop: 0,
			paddingBottom: 0,
			maxWidth: 1440,
			width: '100%',
			alignSelf: 'flex-start',
			gap: 0,
			minHeight: '100%',
		},
		stack: { gap: omSpacing.s },
		siteHeader: {
			width: '100%',
			minHeight: LAB_CHROME_HEADER_HEIGHT,
			paddingTop: 0,
			paddingBottom: 0,
			paddingHorizontal: LAB_COLUMN_GUTTER_X,
			marginBottom: 0,
			marginHorizontal: -LAB_COLUMN_GUTTER_X,
			borderBottomWidth: 0,
			borderBottomColor: 'transparent',
			justifyContent: 'center',
			// Popover hangs below this block; raise stacking so ASSAYS/main content siblings
			// in the ScrollView can't sit on top and eat clicks (Clear-all felt "dead").
			...(Platform.OS === 'web' ? ({ position: 'relative', zIndex: 20 } as object) : {}),
		},
		siteHeaderGettingStarted: {
			minHeight: LAB_CHROME_HEADER_HEIGHT,
			paddingTop: 0,
			paddingBottom: 0,
			marginBottom: 0,
			borderBottomWidth: 0,
			justifyContent: 'center',
		},
		heroRow: {
			flexDirection: 'row',
			alignItems: 'center',
			justifyContent: 'space-between',
			gap: omSpacing.l,
			flexWrap: 'nowrap',
		},
		heroRowGettingStarted: {
			alignItems: 'center',
			justifyContent: 'space-between',
			gap: omSpacing.m,
		},
		heroRowCompact: {
			flexDirection: 'row',
			alignItems: 'center',
			justifyContent: 'space-between',
			gap: 8,
			flexWrap: 'nowrap',
		},
		heroRowStacked: {
			flexDirection: 'column-reverse',
			alignItems: 'stretch',
			gap: omSpacing.m,
		},
		heroTextBlock: {
			flexGrow: 1,
			flexShrink: 1,
			minWidth: 0,
			maxWidth: 760,
			gap: 3,
		},
		heroTextBlockGettingStarted: {
			justifyContent: 'center',
			minHeight: 0,
			maxWidth: 'none' as any,
		},
		mainChromeTitle: {
			color: p.textFaint,
			fontSize: 11,
			fontWeight: '600',
			letterSpacing: 0.7,
			lineHeight: 15,
			textTransform: 'uppercase',
		},
		heroEyebrow: {
			color: p.accent,
			letterSpacing: 0,
			fontWeight: '700',
			fontSize: 12,
			textTransform: 'uppercase',
		},
		heroEyebrowMuted: {
			color: p.textFaint,
			fontSize: 11,
			fontWeight: '600',
			letterSpacing: 0.4,
			lineHeight: 15,
		},
		heroBrandEyebrow: {
			color: p.textFaint,
			fontSize: 12,
			fontWeight: '600',
			letterSpacing: 0.4,
		},
		heroTitle: {
			color: p.text,
			fontSize: 24,
			lineHeight: 30,
			fontWeight: '700',
			...(Platform.OS === 'web' ? ({ overflowWrap: 'anywhere' } as object) : {}),
		},
		heroMetaRow: {
			flexDirection: 'row',
			alignItems: 'center',
			flexWrap: 'wrap',
			columnGap: omSpacing.s,
			rowGap: 0,
			minWidth: 0,
		},
		heroLead: {
			color: p.textMuted,
			lineHeight: 17,
			marginTop: 0,
			maxWidth: 560,
			fontSize: 12,
		},
		heroGenomeStatusOk: {
			color: p.accentStrong,
			fontSize: 11,
			lineHeight: 17,
			marginTop: 0,
			letterSpacing: 0.2,
			fontWeight: '600',
		},
		heroGenomeStatusWarn: {
			color: p.warningText,
			fontSize: 11,
			marginTop: 0,
			lineHeight: 17,
			letterSpacing: 0.2,
			fontWeight: '600',
		},
		heroHeaderAside: {
			flexDirection: 'row',
			alignItems: 'center',
			flexWrap: 'nowrap',
			justifyContent: 'flex-end',
			columnGap: omSpacing.m,
			rowGap: omSpacing.s,
			maxWidth: '100%',
			flexShrink: 0,
			flexGrow: 0,
		},
		headerTools: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: 6,
			flexShrink: 0,
			flexWrap: 'nowrap',
		},
		headerSidebarToggle: {
			...buttonMotion,
			width: 34,
			height: 34,
			borderRadius: omRadius.m,
			borderWidth: StyleSheet.hairlineWidth,
			borderColor: p.border,
			backgroundColor: p.surfaceRaised,
			alignItems: 'center',
			justifyContent: 'center',
			cursor: 'pointer',
			userSelect: 'none',
			WebkitTapHighlightColor: 'transparent',
		} as object,
		headerSidebarToggleOpen: {
			backgroundColor: p.accentTint,
			borderColor: p.accentBorder,
		},
		headerNavCluster: {
			flexDirection: 'row',
			alignItems: 'center',
			flexShrink: 0,
			flexWrap: 'nowrap',
			columnGap: 8,
			rowGap: 4,
			marginLeft: 0,
		},
		headerNavLink: {
			...buttonMotion,
			flexDirection: 'row',
			alignItems: 'center',
			gap: 6,
			minHeight: 34,
			paddingHorizontal: 11,
			paddingVertical: 0,
			borderRadius: omRadius.m,
			borderWidth: StyleSheet.hairlineWidth,
			borderColor: p.border,
			backgroundColor: p.surfaceRaised,
			cursor: 'pointer',
			userSelect: 'none',
			WebkitTapHighlightColor: 'transparent',
		} as object,
		headerNavLinkCompact: {
			width: 36,
			height: 34,
			minHeight: 34,
			paddingHorizontal: 0,
			justifyContent: 'center',
		},
		headerNavLinkPressed: {
			opacity: 0.72,
		} as object,
		headerNavLinkActive: {
			backgroundColor: p.accentTint,
			borderColor: p.accentBorder,
		} as object,
		headerNavLinkIcon: {
			justifyContent: 'center',
		},
		headerNavLinkLabel: {
			color: p.text,
			fontSize: 11,
			fontWeight: '600',
		},
		headerSettingsWrap: {
			position: 'relative',
			zIndex: 40,
			flexShrink: 0,
			marginLeft: 4,
		} as object,
		headerSettingsTrigger: {
			...buttonMotion,
			width: 40,
			height: 40,
			borderRadius: omRadius.full,
			borderWidth: 1,
			borderColor: p.border,
			backgroundColor: 'transparent',
			alignItems: 'center',
			justifyContent: 'center',
			cursor: 'pointer',
			userSelect: 'none',
			WebkitTapHighlightColor: 'transparent',
		} as object,
		headerSettingsTriggerOpen: {
			backgroundColor: p.surfaceRaised,
			borderColor: p.borderStrong,
		},
		headerSettingsTriggerPressed: {
			opacity: 0.85,
		} as object,
		headerSettingsPopover: {
			position: 'absolute',
			top: 44,
			right: 0,
			zIndex: 30,
			minWidth: 248,
			paddingVertical: omSpacing.m,
			paddingHorizontal: omSpacing.m,
			gap: omSpacing.m,
			backgroundColor: p.surfaceSolid,
			borderWidth: StyleSheet.hairlineWidth,
			borderColor: p.border,
			borderRadius: omRadius.m,
		} as object,
		headerSettingsPopoverSection: {
			gap: omSpacing.s,
			alignSelf: 'stretch',
		},
		headerSettingsPopoverKicker: {
			color: p.textFaint,
			letterSpacing: 1,
			fontWeight: '600',
			textTransform: 'uppercase',
			fontSize: 10,
		},
		sidebarSettingsWrap: {
			position: 'relative',
			zIndex: 40,
			flexGrow: 0,
			flexShrink: 0,
			width: 126,
			minWidth: 0,
		} as object,
		sidebarSettingsTrigger: {
			...buttonMotion,
			flexDirection: 'row',
			alignItems: 'center',
			justifyContent: 'center',
			gap: 7,
			height: 36,
			width: '100%',
			paddingHorizontal: 10,
			paddingVertical: 0,
			borderRadius: omRadius.s,
			borderWidth: StyleSheet.hairlineWidth,
			borderColor: p.border,
			backgroundColor: p.surfaceRaised,
			cursor: 'pointer',
			userSelect: 'none',
			WebkitTapHighlightColor: 'transparent',
		} as object,
		sidebarSettingsTriggerOpen: {
			backgroundColor: p.accentTint,
			borderColor: p.accentBorder,
		},
		sidebarSettingsLabel: {
			color: p.text,
			fontSize: 11,
			lineHeight: 15,
			fontWeight: '600',
		},
		sidebarSettingsPopover: {
			position: 'absolute',
			left: 0,
			bottom: 42,
			zIndex: 30,
			minWidth: 248,
			paddingVertical: omSpacing.m,
			paddingHorizontal: omSpacing.m,
			gap: omSpacing.m,
			backgroundColor: p.surfaceSolid,
			borderWidth: StyleSheet.hairlineWidth,
			borderColor: p.border,
			borderRadius: omRadius.m,
		} as object,

		gettingStartedWrap: {
			alignSelf: 'stretch',
			flexGrow: 1,
			marginBottom: 0,
			gap: LAB_GETTING_STARTED_SECTION_GAP,
			maxWidth: 1520,
			padding: 0,
			borderRadius: 0,
			borderWidth: 0,
			backgroundColor: 'transparent',
			justifyContent: 'flex-start',
			...(Platform.OS === 'web' ? ({ minHeight: 'min(680px, calc(100vh - 230px))' } as object) : {}),
		},
		gettingStartedHeroGrid: {
			alignSelf: 'stretch',
			flexDirection: 'column',
			alignItems: 'stretch',
			rowGap: LAB_GETTING_STARTED_SECTION_GAP,
			flexGrow: 0,
		},
		gettingStartedPrimaryColumn: {
			alignSelf: 'stretch',
			gap: omSpacing.l,
		},
		gettingStartedIntroBlock: {
			gap: 8,
			maxWidth: 640,
		},
		landingDivider: {
			height: 0,
			backgroundColor: 'transparent',
			alignSelf: 'stretch',
			marginVertical: 0,
		},
		landingSectionTitle: {
			color: p.text,
			fontSize: 14,
			lineHeight: 18,
			fontWeight: '700',
			marginBottom: omSpacing.s,
			letterSpacing: 0,
		},
		gettingStartedTitle: {
			color: p.text,
			fontSize: 24,
			lineHeight: 30,
			fontWeight: '700',
		},
		gettingStartedLead: {
			color: p.textMuted,
			lineHeight: 22,
			fontSize: 15,
			maxWidth: 620,
		},
		landingOverviewKicker: {
			color: p.textFaint,
			fontSize: 11,
			fontWeight: '600',
			letterSpacing: 0.8,
			textTransform: 'uppercase',
			marginBottom: 0,
		},
		landingFootnote: {
			color: p.textFaint,
			marginTop: omSpacing.m,
			lineHeight: 18,
			fontStyle: 'italic',
		},
		tryNowBlock: {
			alignSelf: 'stretch',
			flexDirection: 'column',
			alignItems: 'flex-start',
			gap: omSpacing.m,
			minHeight: 0,
			paddingVertical: 0,
			paddingHorizontal: 0,
			borderRadius: 0,
			borderWidth: 0,
			borderColor: 'transparent',
			backgroundColor: 'transparent',
		},
		tryNowBody: {
			flex: 1,
			minWidth: 0,
			gap: 4,
		},
		tryNowTitle: {
			color: p.text,
			fontSize: 18,
			lineHeight: 23,
			fontWeight: '700',
		},
		tryNowText: {
			color: p.textMuted,
			lineHeight: 21,
			fontSize: 14,
			maxWidth: 560,
		},
		tryNowButton: {
			alignSelf: 'flex-start',
			marginTop: 0,
			minHeight: 38,
			paddingHorizontal: omSpacing.m,
			flexShrink: 0,
			backgroundColor: p.pageBg === LAB_LANDING_PAGE_FILL ? '#2f7d5d' : p.accent,
		},
		tryNowButtonText: {
			color: p.pageBg === LAB_LANDING_PAGE_FILL ? '#ffffff' : p.invertText,
		},
		howItWorksSection: {
			alignSelf: 'stretch',
			gap: 0,
			paddingTop: 0,
			borderTopWidth: 0,
		},
		howItWorksGrid: {
			flexDirection: 'row',
			flexWrap: 'wrap',
			columnGap: omSpacing.xxl,
			rowGap: omSpacing.l,
		},
		howItWorksCard: {
			flexGrow: 1,
			flexShrink: 1,
			flexBasis: 260,
			minWidth: 220,
			gap: 6,
			paddingTop: omSpacing.s,
			paddingBottom: 0,
			paddingHorizontal: 0,
			borderRadius: 0,
			backgroundColor: 'transparent',
			borderTopWidth: 0,
			borderTopColor: 'transparent',
		},
		howItWorksTitle: {
			color: p.text,
			fontSize: 13,
			lineHeight: 17,
			fontWeight: '700',
		},
		howItWorksText: {
			color: p.textMuted,
			fontSize: 12,
			lineHeight: 18,
		},
		gettingStartedVideoBlock: {
			alignSelf: 'stretch',
			width: '100%',
			maxWidth: 960,
			gap: 0,
			padding: 0,
			borderRadius: 0,
			backgroundColor: 'transparent',
			borderTopWidth: 0,
		},
		gettingStartedVideoFrame: {
			alignSelf: 'stretch',
			width: '100%',
			aspectRatio: 16 / 9,
			borderRadius: omRadius.m,
			overflow: 'hidden',
			backgroundColor: p.surfaceSunken,
			borderWidth: StyleSheet.hairlineWidth,
			borderColor: p.border,
			position: 'relative',
		} as object,
		gettingStartedVideoPlayerHost: {
			position: 'absolute',
			left: 0,
			top: 0,
			right: 0,
			bottom: 0,
			width: '100%',
			height: '100%',
		} as object,
		gettingStartedSteps: {
			flexDirection: 'column',
			gap: 4,
			alignSelf: 'stretch',
		},
		gettingStartedStepRow: {
			flexDirection: 'row',
			alignItems: 'flex-start',
			gap: omSpacing.s,
			paddingVertical: 6,
			paddingHorizontal: 0,
			borderRadius: omRadius.m,
			borderWidth: 0,
			backgroundColor: 'transparent',
		},
		gettingStartedStepNum: {
			width: 22,
			height: 22,
			borderRadius: 11,
			alignItems: 'center',
			justifyContent: 'center',
			backgroundColor: p.surfaceRaised,
			borderWidth: StyleSheet.hairlineWidth,
			borderColor: p.border,
			flexShrink: 0,
		},
		gettingStartedStepNumText: {
			color: p.textMuted,
			fontSize: 11,
			fontWeight: '600',
		},
		gettingStartedStepBody: {
			flex: 1,
			minWidth: 0,
			gap: 2,
		},
		gettingStartedStepTitle: {
			color: p.text,
			fontSize: 13,
			lineHeight: 17,
			fontWeight: '700',
		},
		gettingStartedStepText: {
			color: p.textMuted,
			lineHeight: 17,
			fontSize: 12,
		},
		gettingStartedBtnPressed: {
			opacity: 0.88,
		} as object,
		gettingStartedBtnDisabled: {
			opacity: 0.62,
		} as object,
		gettingStartedModalPanel: {
			maxWidth: 720,
			width: 'min(720px, 94vw)' as any,
			maxHeight: '90%' as any,
			flexDirection: 'column',
			...(Platform.OS === 'web'
				? ({
						boxShadow:
							p.pageBg === LAB_LANDING_PAGE_FILL
								? '0 24px 64px rgba(0,0,0,0.35)'
								: `0 20px 50px ${p.shadow}`,
					} as object)
				: {}),
		},
		gettingStartedModalColumn: {
			flex: 1,
			minHeight: 0,
			flexDirection: 'column',
			...(Platform.OS === 'web' ? ({ maxHeight: '85vh' } as object) : { maxHeight: 640 }),
		},
		gettingStartedModalScroll: {
			flex: 1,
			minHeight: 0,
		},
		gettingStartedModalScrollContent: {
			paddingHorizontal: omSpacing.xl,
			paddingTop: omSpacing.m,
			paddingBottom: omSpacing.xxxl,
			gap: omSpacing.l,
		},
		gettingStartedModalHead: {
			flexDirection: 'row',
			alignItems: 'flex-start',
			gap: omSpacing.m,
			paddingHorizontal: omSpacing.xl,
			paddingTop: omSpacing.l,
			paddingBottom: omSpacing.l,
			borderBottomWidth: StyleSheet.hairlineWidth,
			borderBottomColor: p.border,
		},
		gettingStartedModalKicker: {
			color: p.accentStrong,
			fontSize: 11,
			fontWeight: '600',
			letterSpacing: 0.6,
			textTransform: 'uppercase',
		},
		gettingStartedModalTitle: {
			color: p.text,
		},
		gettingStartedModalSubtitle: {
			color: p.textMuted,
			lineHeight: 22,
			fontSize: 15,
		},
		modalCloseButton: {
			...buttonMotion,
			width: 40,
			height: 40,
			borderRadius: omRadius.full,
			alignItems: 'center',
			justifyContent: 'center',
			backgroundColor: 'transparent',
			borderWidth: StyleSheet.hairlineWidth,
			borderColor: p.border,
			cursor: 'pointer',
			flexShrink: 0,
		} as object,

		columnKicker: {
			color: p.text,
			fontSize: 12,
			fontWeight: '600',
			letterSpacing: 0.2,
			marginBottom: omSpacing.xs,
		},
		workbenchGrid: {
			width: '100%',
			flexDirection: 'row',
			alignItems: 'stretch',
			gap: omSpacing.xl,
			flexGrow: 1,
			...(Platform.OS === 'web'
				? ({ minHeight: 'min(620px, calc(100vh - 260px))', position: 'relative' } as object)
				: {}),
		},
		workbenchPane: {
			minWidth: 0,
			flexGrow: 1,
			borderWidth: 0,
			borderRadius: 0,
			backgroundColor: 'transparent',
			padding: 0,
			gap: omSpacing.m,
		},
		workbenchAssayPane: {
			flexGrow: 1,
			flexShrink: 1,
			flexBasis: 0,
			minWidth: 420,
			paddingRight: 0,
		},
		workbenchResultsPane: {
			flexGrow: 0,
			flexShrink: 0,
			flexBasis: 430,
			maxWidth: 480,
			paddingLeft: omSpacing.xl,
			...(Platform.OS === 'web'
				? ({ position: 'sticky', top: LAB_COLUMN_HEAD_PAD_Y } as object)
				: {}),
		},
		workbenchPaneHead: {
			borderBottomWidth: 0,
			paddingBottom: omSpacing.s,
			marginBottom: omSpacing.xs,
		},
		workbenchPaneHint: {
			color: p.textMuted,
			lineHeight: 18,
			fontSize: 13,
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
			backgroundColor: p.sidebar,
			borderRightWidth: 0,
			borderRightColor: 'transparent',
		},
		labExplorerRootInDrawer: {
			width: '100%',
			height: '100%',
		},
		labExplorerDrawerLayer: {
			...(Platform.OS === 'web' ? ({ position: 'fixed' } as object) : { position: 'absolute' as const }),
			left: 0,
			right: 0,
			top: 0,
			bottom: 0,
			zIndex: 80,
			flexDirection: 'row',
			alignItems: 'stretch',
		},
		labExplorerDrawerBackdrop: {
			...(Platform.OS === 'web' ? ({ position: 'fixed' } as object) : { position: 'absolute' as const }),
			left: 0,
			right: 0,
			top: 0,
			bottom: 0,
			backgroundColor: 'rgba(0,0,0,0.42)',
		} as object,
		labExplorerDrawerPanel: {
			width: '100%' as any,
			maxWidth: '100%' as any,
			height: '100%',
			zIndex: 1,
			backgroundColor: p.sidebar,
			borderRightWidth: 0,
			borderRightColor: 'transparent',
		},
		labExplorerChromeHead: {
			flexDirection: 'row',
			alignItems: 'center',
			justifyContent: 'space-between',
			gap: omSpacing.s,
			height: LAB_CHROME_HEADER_HEIGHT,
			paddingHorizontal: LAB_COLUMN_GUTTER_X,
			paddingTop: 0,
			paddingBottom: 0,
			borderBottomWidth: 0,
			borderBottomColor: 'transparent',
			backgroundColor: p.sidebar,
		},
		labExplorerChromeClose: {
			width: 34,
			height: 34,
			borderRadius: 17,
			alignItems: 'center',
			justifyContent: 'center',
			backgroundColor: p.surfaceRaised,
			borderWidth: StyleSheet.hairlineWidth,
			borderColor: p.border,
			cursor: 'pointer',
			userSelect: 'none',
		} as object,
		labExplorerScroll: { flex: 1 },
		labExplorerScrollContent: {
			paddingHorizontal: LAB_COLUMN_GUTTER_X,
			paddingTop: 0,
			paddingBottom: omSpacing.xxxl,
			gap: omSpacing.m,
		},
		labExplorerTopAction: {
			height: LAB_CHROME_HEADER_HEIGHT,
			justifyContent: 'center',
			paddingHorizontal: LAB_COLUMN_GUTTER_X,
			paddingTop: 0,
			paddingBottom: 0,
			backgroundColor: p.sidebar,
		},
		labExplorerFooter: {
			flexDirection: 'row',
			alignItems: 'center',
			justifyContent: 'center',
			gap: 10,
			height: LAB_CHROME_FOOTER_HEIGHT,
			paddingHorizontal: LAB_COLUMN_GUTTER_X,
			paddingVertical: 0,
			borderTopWidth: 0,
			borderTopColor: 'transparent',
			backgroundColor: p.sidebar,
		},
		labExplorerSavedBlock: {},
		labExplorerSectionHeading: {
			alignSelf: 'stretch',
			gap: 8,
			marginBottom: omSpacing.xs + 4,
			minWidth: 0,
		},
		labExplorerSectionTitle: {
			fontSize: 11,
			fontWeight: '600',
			letterSpacing: 0.7,
			color: p.textFaint,
			textTransform: 'uppercase',
			lineHeight: 15,
		},
		labExplorerErrorPad: {
			marginBottom: omSpacing.s,
		},
		labExplorerList: {
			gap: 8,
		},
		labExplorerAddDataStack: {
			alignSelf: 'stretch',
			gap: omSpacing.m + 2,
		},
		labExplorerInlineImportAction: {
			marginTop: omSpacing.s,
			marginBottom: omSpacing.m,
		},
		labExplorerImportBlock: {
			gap: omSpacing.xs + 4,
			marginTop: 2,
		},
		labExplorerEmpty: {
			color: p.textFaint,
			lineHeight: 16,
			fontSize: 12,
			paddingVertical: omSpacing.xs,
		},
		labExplorerPinnedRow: {
			flexDirection: 'row',
			alignItems: 'center',
			borderRadius: omRadius.l,
			backgroundColor: p.sidebarControl,
			overflow: 'hidden',
			minHeight: 56,
			borderWidth: StyleSheet.hairlineWidth,
			borderColor: p.border,
		},
		labExplorerPinnedRowSelected: {
			backgroundColor: p.accentTint,
			borderColor: p.accentBorder,
		},
		labExplorerRowMain: {
			flex: 1,
			flexDirection: 'row',
			alignItems: 'center',
			gap: 10,
			paddingVertical: 10,
			paddingLeft: omSpacing.m + 2,
			paddingRight: omSpacing.s,
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
			gap: 3,
		},
		labExplorerRowTitle: {
			color: p.text,
			fontWeight: '700',
			lineHeight: 18,
			fontSize: 14,
		},
		labExplorerRowMeta: {
			color: p.textMuted,
			lineHeight: 15,
			fontSize: 11,
		},
		labExplorerRowMetaWarn: {
			color: p.warningText,
			fontWeight: '600',
		},
		labExplorerRowGhostHit: {
			alignSelf: 'stretch',
			justifyContent: 'center',
			paddingHorizontal: omSpacing.m + 2,
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
			paddingVertical: 8,
			paddingHorizontal: 0,
			borderRadius: 0,
			borderWidth: 0,
			backgroundColor: 'transparent',
			cursor: 'pointer',
			userSelect: 'none',
			WebkitTapHighlightColor: 'transparent',
		} as object,
		labExplorerSampleRowMuted: {
			opacity: 0.52,
		},
		labExplorerSampleGlyph: {
			minWidth: 22,
			alignItems: 'center',
			justifyContent: 'center',
		},
		labExplorerSampleCta: {
			color: p.accent,
			fontWeight: '600',
			fontSize: 12,
			flexShrink: 0,
		},
		labExplorerSampleError: {
			marginTop: omSpacing.xs,
		},
		webThemeButton: {
			...buttonMotion,
			flexDirection: 'row',
			alignItems: 'center',
			gap: 7,
			height: 36,
			width: 126,
			justifyContent: 'center',
			paddingHorizontal: 10,
			borderRadius: omRadius.s,
			borderWidth: StyleSheet.hairlineWidth,
			cursor: 'pointer',
			userSelect: 'none',
			WebkitTapHighlightColor: 'transparent',
		} as object,
		webThemeButtonIcon: { justifyContent: 'center' },
		webThemeButtonLight: {
			backgroundColor: p.surfaceRaised,
			borderColor: p.border,
		},
		webThemeButtonDark: {
			backgroundColor: p.surfaceRaised,
			borderColor: p.border,
		},
		webThemeButtonText: {
			fontSize: 11,
			lineHeight: 15,
			fontWeight: '600',
		},
		webThemeButtonTextLight: {
			color: p.text,
		},
		webThemeButtonTextDark: {
			color: p.text,
		},

		// Sidebar genome drop panel (formerly main-column hero zone)
		explorerDropPanel: {
			...buttonMotion,
			alignSelf: 'stretch',
			alignItems: 'center',
			gap: 8,
			paddingVertical: 14,
			paddingHorizontal: omSpacing.m,
			borderWidth: StyleSheet.hairlineWidth,
			borderStyle: 'dashed',
			borderColor: p.border,
			borderRadius: omRadius.m,
			backgroundColor: p.sidebarControl,
			cursor: 'pointer',
			userSelect: 'none',
			WebkitTapHighlightColor: 'transparent',
		} as object,
		explorerDropPanelActive: {
			backgroundColor: p.overlayCardBg,
			borderStyle: 'dashed',
			borderColor: p.accent,
		},
		explorerDropTitleCluster: {
			flexDirection: 'column',
			alignItems: 'center',
			justifyContent: 'center',
			gap: 0,
			alignSelf: 'center',
			maxWidth: '100%',
		},
		explorerDropTitle: {
			color: p.text,
			textAlign: 'center',
			fontWeight: '600',
			fontSize: 14,
			lineHeight: 18,
			flexShrink: 1,
		},
		explorerDropSubtitle: {
			marginTop: 2,
			color: p.textMuted,
			textAlign: 'center',
			fontSize: 12,
			lineHeight: 16,
			fontWeight: '500',
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
			...buttonMotion,
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

		heroGenomeSlotStrip: {
			flexShrink: 1,
			maxWidth: 640,
			marginTop: omSpacing.s,
		},

		// slots
		slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: omSpacing.xs },
		heroGenomeSlotGrid: { justifyContent: 'flex-start' },
		slotChip: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: 6,
			paddingHorizontal: omSpacing.s + 2,
			paddingVertical: 5,
			borderRadius: omRadius.full,
			borderWidth: StyleSheet.hairlineWidth,
		},
		slotChipOk: {
			backgroundColor: p.accentTint,
			borderColor: p.accentBorder,
		},
		slotChipMissing: {
			backgroundColor: 'transparent',
			borderColor: p.border,
			borderStyle: 'dashed',
		},
		slotChipText: { color: p.textMuted },
		slotChipTextOk: { color: p.accentStrong },
		slotGenerateButton: {
			...buttonMotion,
			flexDirection: 'row',
			alignItems: 'center',
			gap: 6,
			paddingHorizontal: omSpacing.s + 2,
			paddingVertical: 5,
			borderRadius: omRadius.full,
			borderWidth: StyleSheet.hairlineWidth,
			borderColor: p.accentBorder,
			backgroundColor: p.accentSoft,
		},
		slotGenerateButtonText: {
			color: p.accentStrong,
			fontWeight: '700',
		},

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
			...buttonMotion,
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
			...buttonMotion,
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
			...buttonMotion,
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
		pickerSection: {
			gap: omSpacing.m,
			padding: omSpacing.l,
			borderRadius: omRadius.m,
			backgroundColor: p.surface,
		},
		pickerSectionTitle: {
			color: p.text,
			fontSize: 15,
			lineHeight: 20,
			fontWeight: '700',
			letterSpacing: 0,
		},
		pickerIntro: { color: p.textMuted, lineHeight: 18, fontSize: 12 },
		runtimeWarmupNotice: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: omSpacing.s,
			paddingHorizontal: omSpacing.m,
			paddingVertical: omSpacing.s,
			borderRadius: omRadius.m,
			backgroundColor: p.accentTint,
		},
		runtimeWarmupText: {
			color: p.accentStrong,
			fontSize: 12,
			lineHeight: 17,
		},
		pickerList: { gap: 8 },
		panelAssayGroup: {
			marginVertical: omSpacing.s,
			borderRadius: omRadius.m,
			borderWidth: 0,
			borderColor: p.accentBorder,
			backgroundColor: p.surfaceRaised,
			overflow: 'hidden',
		},
		panelAssayGroupHeader: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: omSpacing.xs,
			paddingHorizontal: omSpacing.m,
			paddingVertical: omSpacing.s,
			backgroundColor: p.accentSoft,
			borderBottomWidth: 0,
			borderBottomColor: p.accentBorder,
		},
		panelAssayGroupTitle: {
			color: p.accentStrong,
			fontWeight: '700',
			textTransform: 'uppercase',
			letterSpacing: 0.8,
		},
		panelAssayGroupChildren: {
			borderTopWidth: 0,
			borderTopColor: p.border,
		},
		pickerRow: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: omSpacing.m,
			minHeight: 64,
			paddingVertical: 10,
			paddingRight: omSpacing.m,
			paddingLeft: omSpacing.m,
			borderRadius: omRadius.m,
			backgroundColor: p.surfaceRaised,
			borderWidth: 0,
			borderBottomWidth: 0,
			borderBottomColor: 'transparent',
		},
		pickerRowDisabled: { opacity: 0.5 },
		pickerRowIncompatible: { opacity: 0.6 },
		pickerRowPanel: {
			backgroundColor: p.accentTint,
			borderBottomColor: 'transparent',
			paddingLeft: omSpacing.m,
		},
		pickerRowInPanelGroup: {
			paddingLeft: omSpacing.m,
			paddingRight: omSpacing.m,
		},
		pickerIcon: {
			width: 24,
			height: 24,
			borderRadius: omRadius.s,
			alignItems: 'center',
			justifyContent: 'center',
			backgroundColor: 'transparent',
		},
		pickerIconPanel: {
			backgroundColor: 'transparent',
		},
		pickerText: { flex: 1, minWidth: 0, gap: 2 },
		assayTitleRow: {
			flexDirection: 'row',
			alignItems: 'center',
			flexWrap: 'wrap',
			gap: omSpacing.xs,
		},
		pickerTitle: { color: p.text, flexShrink: 1, minWidth: 0 },
		pickerMeta: { color: p.textMuted, fontSize: 12, lineHeight: 17 },
		assayKindBadge: {
			paddingHorizontal: omSpacing.xs + 2,
			paddingVertical: 2,
			borderRadius: omRadius.s,
			backgroundColor: 'transparent',
			borderWidth: StyleSheet.hairlineWidth,
			borderColor: p.border,
		},
		assayKindBadgePanel: {
			backgroundColor: p.accentSoft,
			borderColor: p.accentBorder,
		},
		assayKindBadgeText: { color: p.textMuted, letterSpacing: 0.8 },
		pickerAction: {
			...buttonMotion,
			flexDirection: 'row',
			alignItems: 'center',
			gap: omSpacing.xs,
			minHeight: 32,
			paddingHorizontal: omSpacing.s + 2,
			paddingVertical: 5,
			borderRadius: omRadius.m,
			backgroundColor: p.accent,
		},
		pickerActionMuted: {
			...buttonMotion,
			flexDirection: 'row',
			alignItems: 'center',
			gap: omSpacing.xs,
			minHeight: 32,
			paddingHorizontal: omSpacing.s + 2,
			paddingVertical: 5,
			borderRadius: omRadius.m,
			backgroundColor: 'transparent',
			borderWidth: StyleSheet.hairlineWidth,
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
			flexShrink: 0,
		},
		assayGhostAction: {
			...buttonMotion,
			width: 30,
			height: 30,
			borderRadius: omRadius.m,
			alignItems: 'center',
			justifyContent: 'center',
			backgroundColor: p.surface,
			borderWidth: StyleSheet.hairlineWidth,
			borderColor: p.border,
			cursor: 'pointer',
			WebkitTapHighlightColor: 'transparent',
		} as object,

		pickerFilterRow: {
			flexDirection: 'row',
			gap: omSpacing.xs,
			flexWrap: 'wrap',
		},
			pickerFilterChip: {
				paddingHorizontal: omSpacing.s,
				paddingVertical: 4,
				borderRadius: omRadius.s,
			borderWidth: StyleSheet.hairlineWidth,
			borderColor: p.border,
			backgroundColor: 'transparent',
		} as object,
		pickerFilterChipActive: {
			backgroundColor: p.accentSoft,
			borderColor: p.accentBorder,
		},
		pickerFilterChipText: {
			color: p.textMuted,
			fontSize: 12,
			fontWeight: '600',
		},
		pickerFilterChipTextActive: {
			color: p.accentStrong,
		},
		searchBox: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: omSpacing.s,
			paddingHorizontal: omSpacing.s + 2,
			paddingVertical: 7,
			borderRadius: omRadius.m,
			backgroundColor: p.surfaceSunken,
			borderWidth: StyleSheet.hairlineWidth,
			borderColor: p.border,
		},
		searchInput: {
			flex: 1,
			color: p.text,
			fontSize: 13,
			fontFamily: BrandFonts.body,
			outlineStyle: 'none',
		} as object,
		searchImportButton: {
			...buttonMotion,
			minHeight: 32,
			flexDirection: 'row',
			alignItems: 'center',
			justifyContent: 'center',
			gap: omSpacing.xs,
			paddingHorizontal: omSpacing.m,
			borderRadius: omRadius.full,
			backgroundColor: p.accent,
		},
		searchImportButtonText: { color: p.invertText },
		clearBtn: {
			...buttonMotion,
			padding: 2,
			cursor: 'pointer',
		} as object,
		urlLoadBox: {
			gap: omSpacing.s,
			padding: omSpacing.m,
			borderRadius: omRadius.l,
			backgroundColor: p.surfaceSunken,
			borderWidth: 1,
			borderColor: p.border,
		},
		urlLoadHelpBlock: {
			gap: omSpacing.xs,
		},
		urlLoadExampleText: {
			color: p.textMuted,
			lineHeight: 18,
			fontSize: 12,
			fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
		},
		urlLoadHeader: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: omSpacing.xs,
		},
		urlLoadHeaderComposer: {
			alignSelf: 'stretch',
			minWidth: 0,
			flexWrap: 'wrap',
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
			...buttonMotion,
			paddingHorizontal: omSpacing.l,
			paddingVertical: omSpacing.s,
			borderRadius: omRadius.full,
			backgroundColor: p.accent,
		},
		urlLoadButtonDisabled: {
			...buttonMotion,
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
		urlLoadBoxComposer: {
			padding: 0,
			backgroundColor: 'transparent',
			borderWidth: 0,
			borderRadius: 0,
			gap: omSpacing.xs + 2,
		},
		urlLoadTitleComposer: {
			color: p.textFaint,
			letterSpacing: 0.85,
			fontSize: 11,
			flexGrow: 1,
			flexShrink: 1,
			minWidth: 0,
		},
		urlLoadInputComposer: {
			backgroundColor: p.surfaceSolid,
			borderColor: p.border,
			fontSize: 13,
		} as object,
		urlLoadButtonComposerOutline: {
			...buttonMotion,
			minHeight: 40,
			paddingVertical: 10,
			paddingHorizontal: omSpacing.l,
			borderRadius: omRadius.full,
			borderWidth: 1,
			alignSelf: 'stretch',
			alignItems: 'center',
			justifyContent: 'center',
			width: '100%',
		},
		urlLoadButtonComposerOutlineActive: {
			borderColor: p.accentBorder,
			backgroundColor: 'transparent',
		},
		urlLoadButtonComposerOutlineDisabled: {
			borderColor: p.border,
			backgroundColor: 'transparent',
			opacity: 0.55,
		},
		urlLoadButtonComposerOutlineLabel: {
			color: p.accentStrong,
			fontWeight: '600',
			fontSize: 14,
		},
		urlLoadButtonComposerOutlineLabelMuted: {
			color: p.textFaint,
			fontWeight: '600',
			fontSize: 14,
		},
		shareLinkBoxComposer: {
			backgroundColor: 'transparent',
			borderWidth: 0,
			borderRadius: 0,
			padding: 0,
			paddingVertical: omSpacing.xs,
			marginTop: omSpacing.xs,
			gap: omSpacing.xs,
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
			backgroundColor: 'transparent',
			borderWidth: StyleSheet.hairlineWidth,
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
		runsAnchor: { gap: omSpacing.m, marginTop: 0 },
		resultSection: {
			gap: omSpacing.s,
			padding: omSpacing.l,
			borderRadius: omRadius.m,
			backgroundColor: p.surface,
		},
		sectionKicker: {
			color: p.text,
			fontSize: 12,
			fontWeight: '600',
			letterSpacing: 0.2,
		},
		resultsEmptyCard: {
			alignItems: 'flex-start',
			justifyContent: 'flex-start',
			gap: omSpacing.xs,
			minHeight: 128,
			paddingVertical: omSpacing.m,
			paddingHorizontal: omSpacing.l,
			borderRadius: omRadius.m,
			backgroundColor: p.surface,
			borderWidth: 0,
		},
		resultsEmptyTitle: {
			color: p.text,
			textAlign: 'left',
			fontSize: 16,
			lineHeight: 21,
			fontWeight: '600',
		},
		resultsEmptyText: {
			color: p.textMuted,
			textAlign: 'left',
			fontSize: 13,
			lineHeight: 19,
			maxWidth: 320,
		},
		runCard: {
			paddingVertical: 0,
			paddingRight: 0,
			paddingLeft: 0,
			borderRadius: 0,
			backgroundColor: 'transparent',
			borderWidth: 0,
			borderBottomWidth: 0,
			borderBottomColor: 'transparent',
			gap: omSpacing.m,
		},
		runCardHead: {
			flexDirection: 'row',
			alignItems: 'flex-start',
			gap: omSpacing.s,
			flexWrap: 'wrap',
		},
		runCardIcon: {
			width: 28,
			height: 28,
			borderRadius: omRadius.s,
			alignItems: 'center',
			justifyContent: 'center',
			backgroundColor: p.surfaceSunken,
		},
		runCardKicker: {
			color: p.accentStrong,
			letterSpacing: 0.2,
			fontSize: 11,
			fontWeight: '600',
		},
		runCardTitle: { color: p.text, fontSize: 16, lineHeight: 21, fontWeight: '700' },
		runCardMeta: { color: p.textMuted, fontSize: 12, lineHeight: 17 },
		runCardHint: { color: p.textFaint, fontSize: 12, lineHeight: 17 },
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
			...buttonMotion,
			flexDirection: 'row',
			alignItems: 'center',
			justifyContent: 'center',
			gap: omSpacing.xs,
			paddingHorizontal: omSpacing.s + 2,
			paddingVertical: 5,
			borderRadius: omRadius.m,
			borderWidth: StyleSheet.hairlineWidth,
			borderColor: p.accentBorder,
			backgroundColor: 'transparent',
		},
		textButtonText: { color: p.accentStrong, fontWeight: '700', fontSize: 12 },
		resultPrimaryButton: {
			backgroundColor: p.accent,
			borderColor: p.accent,
		},
		resultPrimaryButtonText: {
			color: p.invertText,
			fontWeight: '700',
			fontSize: 12,
		},
		iconButton: {
			...buttonMotion,
			width: 36,
			height: 36,
			borderRadius: omRadius.full,
			alignItems: 'center',
			justifyContent: 'center',
			backgroundColor: p.surfaceSunken,
			borderWidth: 1,
			borderColor: p.border,
		},

		// VCF index prompt
		vcfIndexPromptLayer: {
			zIndex: 59,
		},
		vcfIndexPromptPanel: {
			maxWidth: 500,
			width: '100%',
			borderColor: p.warningBorder,
		},
		vcfIndexPromptChrome: {
			padding: omSpacing.l,
			gap: omSpacing.m,
		},
		vcfIndexPromptTitle: { color: p.text, flexShrink: 1 },
		vcfIndexPromptBody: { color: p.textMuted },
		vcfIndexPromptError: { color: p.dangerText },

		// unknowns (modal alert)
		unknownFilesAlertLayer: {
			zIndex: 58,
		},
		unknownFilesAlertPanel: {
			maxWidth: 440,
			width: '100%',
			backgroundColor: p.warningBg,
			borderColor: p.warningBorder,
		},
		unknownAlertChrome: {
			padding: omSpacing.l,
			gap: omSpacing.m,
		},
		unknownAlertHeadRow: {
			flexDirection: 'row',
			alignItems: 'flex-start',
			justifyContent: 'space-between',
			gap: omSpacing.m,
		},
		unknownNoteHead: {
			flex: 1,
			flexDirection: 'row',
			alignItems: 'center',
			gap: omSpacing.xs,
		},
		unknownNoteTitle: { color: p.warningText, flexShrink: 1 },
		unknownAlertRows: {
			gap: omSpacing.xs,
		},
		// persistent file handles (modal)
		persistentHandleModalLayer: {
			zIndex: 59,
		},
		persistentHandleModalPanel: {
			maxWidth: 520,
			width: '100%',
			borderColor: p.accentBorder,
		},
		persistentHandleModalChrome: {
			padding: omSpacing.l,
			gap: omSpacing.m,
		},
		importGenomeModalPanel: {
			maxWidth: 640,
			width: '100%',
			borderColor: p.accentBorder,
		},
		importGenomeModalPanelActive: {
			borderColor: p.accent,
			backgroundColor: p.overlayCardBg,
		},
		importGenomeModalChrome: {
			padding: omSpacing.l,
			gap: omSpacing.l,
		},
		importGenomeModalChromeActive: {
			backgroundColor: p.overlayCardBg,
		},
		importGenomeDropArea: {
			...buttonMotion,
			alignItems: 'center',
			justifyContent: 'center',
			gap: omSpacing.s,
			borderWidth: 1,
			borderStyle: 'dashed',
			borderColor: p.accentBorder,
			borderRadius: omRadius.l,
			backgroundColor: p.surfaceSunken,
			paddingVertical: omSpacing.xl,
			paddingHorizontal: omSpacing.l,
			cursor: 'pointer',
			userSelect: 'none',
			WebkitTapHighlightColor: 'transparent',
		} as object,
		importGenomeDropAreaActive: {
			backgroundColor: p.accent,
			borderColor: p.accent,
		},
		importGenomeDropTitle: {
			color: p.text,
			textAlign: 'center',
			fontWeight: '700',
		},
		importGenomeDropBody: {
			color: p.textMuted,
			textAlign: 'center',
			lineHeight: 17,
		},
		importGenomeActionGrid: {
			gap: omSpacing.m,
		},
		importGenomeSampleCard: {
			borderWidth: 1,
			borderColor: p.border,
			borderRadius: omRadius.l,
			backgroundColor: p.surface,
			padding: omSpacing.m,
			gap: omSpacing.s,
		},
		importGenomeSectionHead: {
			gap: 4,
			marginBottom: 2,
		},
		importGenomeSectionHint: {
			color: p.textMuted,
			lineHeight: 17,
		},
		importGenomeUrlCard: {
			borderWidth: 1,
			borderColor: p.border,
			borderRadius: omRadius.l,
			overflow: 'hidden',
		},
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
		sourceOverlayFullScreen: {
			padding: 0,
		},
		labModalLayer: {
			zIndex: 60,
		},
		sourceBackdrop: {
			...(Platform.OS === 'web' ? ({ position: 'fixed' } as any) : null),
			left: 0,
			right: 0,
			top: 0,
			bottom: 0,
			zIndex: 0,
			backgroundColor: p.pageBg === LAB_LANDING_PAGE_FILL
				? 'rgba(39,37,50,0.96)'
				: 'rgba(5, 7, 12, 0.9)',
		},
		sourcePanel: {
			...(Platform.OS === 'web' ? ({ position: 'relative', zIndex: 1 } as any) : null),
			width: '100%',
			maxWidth: 980,
			maxHeight: '86%',
			borderRadius: omRadius.l,
			backgroundColor: p.surfaceRaised,
			borderWidth: StyleSheet.hairlineWidth,
			borderColor: p.border,
			overflow: 'hidden',
		},
		sourcePanelFullScreen: {
			width: '100%',
			height: '100%',
			maxWidth: '100%' as any,
			maxHeight: '100%' as any,
			borderRadius: 0,
			borderWidth: 0,
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
		sourcePathScroll: {
			width: '100%',
		},
		sourceTabsScroll: {
			borderBottomWidth: 1,
			borderBottomColor: p.border,
			height: 74,
		},
		sourceTabs: {
			alignItems: 'center',
			flexDirection: 'row',
			gap: omSpacing.xs,
			minHeight: 74,
			paddingHorizontal: omSpacing.l,
			paddingVertical: omSpacing.s,
		},
		sourceTab: {
			...buttonMotion,
			alignItems: 'center',
			justifyContent: 'center',
			width: 220,
			minHeight: 36,
			paddingHorizontal: omSpacing.m,
			paddingVertical: 0,
			borderRadius: omRadius.full,
			backgroundColor: p.surfaceSunken,
			borderWidth: 1,
			borderColor: p.border,
		},
		sourceTabActive: {
			backgroundColor: p.accentSoft,
			borderColor: p.accentBorder,
		},
		sourceTabText: { color: p.text, fontSize: 12, fontWeight: '600', lineHeight: 16, width: '100%' },
		sourceTabTextActive: { color: p.accentStrong, fontSize: 12, fontWeight: '700', lineHeight: 16, width: '100%' },
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
			flex: 1,
			flexShrink: 1,
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
		resultsPaneFooter: {
			alignItems: 'center',
			justifyContent: 'center',
			minHeight: LAB_CHROME_FOOTER_HEIGHT,
			paddingVertical: 0,
			paddingHorizontal: LAB_COLUMN_GUTTER_X,
			marginTop: LAB_GETTING_STARTED_SECTION_GAP,
			marginHorizontal: -LAB_COLUMN_GUTTER_X,
			borderTopWidth: 0,
			borderTopColor: 'transparent',
		},
		footerNote: {
			flexDirection: 'row',
			alignItems: 'center',
			justifyContent: 'center',
			gap: omSpacing.xs,
		},
		footerNoteText: { color: p.textFaint, textAlign: 'center' },
		feedbackFooter: {
			...buttonMotion,
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
