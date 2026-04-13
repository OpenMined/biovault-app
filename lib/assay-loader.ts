import { Asset } from 'expo-asset'
import { readAsStringAsync } from 'expo-file-system/legacy'
import { getAppDb } from '@/lib/app-db'
import { Platform } from 'react-native'
import YAML from 'yaml'

import { bundledAssaySources, type BundledAssaySource } from '@/lib/bundled-assay-sources'
import type {
	AssayDiscoverCategory,
	AssayManifest,
	AssayMemberEntry,
	AssayMemberGroup,
	AssayMemberItem,
	AssayPackageSource,
	InstalledAssayPackageSource,
	UnsupportedAssayMemberEntry,
} from '@/lib/assay-manifests'

type InstalledAssayRow = {
	id: string
	installed_at: string
	manifest_json: string
	source: string
	version: string
}

type InstalledAssayRecord = {
	assayPath: string
	compiledPath: string
	fileUris: Record<string, string>
	rootUri: string
}

type LoadedAssayPackage = {
	fileContents: Record<string, string>
	packageSource: AssayPackageSource
}

type YamlMap = Record<string, unknown>

type IntermediateVariantRecord = {
	alts: string[]
	deletion_length?: number | null
	fields?: Record<string, unknown>
	gene: string | null
	grch37?: YamlMap | null
	grch38?: YamlMap | null
	kind: string | null
	name: string
	note: string | null
	ref: string | null
	reason?: string | null
	rsids: string[]
	summary: string | null
}

const CATEGORY_MAP: Record<string, AssayDiscoverCategory> = {
	ancestry: 'ancestry',
	pgx: 'pgx',
	risk: 'risk',
	traits: 'traits',
}

let manifestCache: AssayManifest[] | null = null
let manifestPromise: Promise<AssayManifest[]> | null = null

async function loadBundledAssetText(assetModuleId: number): Promise<string> {
	const asset = Asset.fromModule(assetModuleId)

	if (Platform.OS === 'web') {
		const response = await fetch(asset.uri)
		if (!response.ok) {
			throw new Error(`Unable to load bundled assay asset (${response.status}).`)
		}
		return response.text()
	}

	await asset.downloadAsync()
	const localUri = asset.localUri ?? asset.uri
	return readAsStringAsync(localUri)
}

async function loadInstalledFileText(fileUri: string): Promise<string> {
	return readAsStringAsync(fileUri)
}

function asString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value : null
}

function asStringArray(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
	}
	return []
}

function slugFromAssayId(assayId: string): string {
	return assayId
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
}

function normalizeInterpretationState(raw: unknown, defaults: { headline: string; body: string }) {
	const state = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as YamlMap) : {}
	return {
		headline: asString(state.headline) ?? defaults.headline,
		body: asString(state.body) ?? defaults.body,
		caveat: asString(state.caveat),
	}
}

function formatCoordinate(label: string, raw: unknown): string | null {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return null
	}

	const entry = raw as YamlMap
	const chrom = asString(entry.chrom)
	if (!chrom) {
		return null
	}
	if (typeof entry.pos === 'number') {
		return `${label} chr${chrom}:${entry.pos}`
	}
	if (typeof entry.start === 'number' && typeof entry.end === 'number') {
		return `${label} chr${chrom}:${entry.start}-${entry.end}`
	}
	return null
}

function formatLocation(variant: IntermediateVariantRecord): string | null {
	return formatCoordinate('GRCH37', variant.grch37) ?? formatCoordinate('GRCH38', variant.grch38)
}

function normalizeVariantKind(kind: string | null): 'SNV' | 'INDEL' {
	return kind === 'deletion' || kind === 'insertion' || kind === 'indel' ? 'INDEL' : 'SNV'
}

function normalizeMemberItem(variant: IntermediateVariantRecord): AssayMemberItem {
	return {
		id: variant.name,
		rsid: variant.rsids[0] ?? null,
		location: formatLocation(variant),
		kind: normalizeVariantKind(variant.kind),
		ref: variant.ref,
		runtimeKind: variant.kind,
		alts: variant.alts,
		note: variant.note ?? variant.summary ?? '',
	}
}

function parseStoredInstalledAssay(row: InstalledAssayRow): InstalledAssayRecord | null {
	try {
		const parsed = JSON.parse(row.manifest_json)
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			return null
		}

		const record = parsed as Partial<InstalledAssayRecord>
		if (
			typeof record.assayPath !== 'string' ||
			typeof record.compiledPath !== 'string' ||
			typeof record.rootUri !== 'string' ||
			!record.fileUris ||
			typeof record.fileUris !== 'object' ||
			Array.isArray(record.fileUris)
		) {
			return null
		}

		const fileUris = Object.fromEntries(
			Object.entries(record.fileUris).filter(
				([relativePath, uri]): uri is string => typeof relativePath === 'string' && typeof uri === 'string'
			)
		)

		return {
			assayPath: record.assayPath,
			compiledPath: record.compiledPath,
			fileUris,
			rootUri: record.rootUri,
		}
	} catch {
		return null
	}
}

async function loadBundledAssayPackage(source: BundledAssaySource): Promise<LoadedAssayPackage> {
	const fileContents = Object.fromEntries(
		await Promise.all(
			Object.entries(source.fileAssetModuleIds).map(async ([filePath, assetModuleId]) => [
				filePath,
				await loadBundledAssetText(assetModuleId),
			])
		)
	)

	return {
		fileContents,
		packageSource: {
			assayAssetModuleId: source.assayAssetModuleId,
			assayPath: source.assayPath,
			compiledPath: source.compiledPath,
			fileAssetModuleIds: source.fileAssetModuleIds,
			type: 'bundled',
		},
	}
}

async function loadInstalledAssayPackages(): Promise<LoadedAssayPackage[]> {
	if (Platform.OS === 'web') {
		return []
	}

	const db = await getAppDb()
	const rows = await db.getAllAsync<InstalledAssayRow>(
		'SELECT id, manifest_json, installed_at, source, version FROM installed_assays WHERE is_bundled = 0 ORDER BY installed_at DESC, id DESC'
	)

	const packages = await Promise.all(
		rows.map(async (row) => {
			try {
				const stored = parseStoredInstalledAssay(row)
				if (!stored) {
					return null
				}

				const fileContents = Object.fromEntries(
					await Promise.all(
						Object.entries(stored.fileUris).map(async ([relativePath, fileUri]) => [
							relativePath,
							await loadInstalledFileText(fileUri),
						])
					)
				)

				return {
					fileContents,
					packageSource: {
						assayPath: stored.assayPath,
						compiledPath: stored.compiledPath,
						fileUris: stored.fileUris,
						installedAt: row.installed_at,
						rootUri: stored.rootUri,
						source: row.source,
						type: 'installed',
					} satisfies InstalledAssayPackageSource,
				} satisfies LoadedAssayPackage
			} catch (error) {
				console.warn(`Skipping installed assay package ${row.id}:`, error)
				return null
			}
		})
	)

	return packages.filter((pkg): pkg is LoadedAssayPackage => pkg !== null)
}

function readCompiledMap(text: string, label: string): YamlMap {
	const parsed = YAML.parse(text)
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error(`${label} did not contain a compiled assay mapping`)
	}
	return parsed as YamlMap
}

function parseVariantRecord(raw: unknown, label: string): IntermediateVariantRecord {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		throw new Error(`${label} did not contain a variant object`)
	}

	const variant = raw as YamlMap
	const name = asString(variant.name)
	if (!name) {
		throw new Error(`${label} is missing variant name`)
	}

	return {
		alts: asStringArray(variant.alts),
		deletion_length: typeof variant.deletion_length === 'number' ? variant.deletion_length : null,
		fields:
			variant.fields && typeof variant.fields === 'object' && !Array.isArray(variant.fields)
				? (variant.fields as Record<string, unknown>)
				: undefined,
		gene: asString(variant.gene),
		grch37: variant.grch37 && typeof variant.grch37 === 'object' && !Array.isArray(variant.grch37) ? (variant.grch37 as YamlMap) : null,
		grch38: variant.grch38 && typeof variant.grch38 === 'object' && !Array.isArray(variant.grch38) ? (variant.grch38 as YamlMap) : null,
		kind: asString(variant.kind),
		name,
		note: asString(variant.note),
		ref: asString(variant.ref),
		reason: asString(variant.reason),
		rsids: asStringArray(variant.rsids),
		summary: asString(variant.summary),
	}
}

function parseLoadedAssayPackage(loadedPackage: LoadedAssayPackage): AssayManifest {
	const { fileContents, packageSource } = loadedPackage
	const compiledPath = packageSource.compiledPath
	const compiled = readCompiledMap(fileContents[compiledPath], compiledPath)

	if (compiled.schema !== 'bioscript:assay-compiled') {
		throw new Error(`${compiledPath} does not declare bioscript:assay-compiled`)
	}

	const assay =
		compiled.assay && typeof compiled.assay === 'object' && !Array.isArray(compiled.assay)
			? (compiled.assay as YamlMap)
			: null
	if (!assay) {
		throw new Error(`${compiledPath} is missing assay metadata`)
	}

	const assayId = asString(assay.id)
	if (!assayId) {
		throw new Error(`${compiledPath} is missing assay.id`)
	}

	const ui = compiled.ui && typeof compiled.ui === 'object' && !Array.isArray(compiled.ui) ? (compiled.ui as YamlMap) : {}
	const compatibility =
		compiled.compatibility && typeof compiled.compatibility === 'object' && !Array.isArray(compiled.compatibility)
			? (compiled.compatibility as YamlMap)
			: {}
	const privacy =
		compiled.privacy && typeof compiled.privacy === 'object' && !Array.isArray(compiled.privacy)
			? (compiled.privacy as YamlMap)
			: {}
	const interpretation =
		compiled.interpretation && typeof compiled.interpretation === 'object' && !Array.isArray(compiled.interpretation)
			? (compiled.interpretation as YamlMap)
			: {}

	const runnableVariants = Array.isArray(compiled.runnable_variants) ? compiled.runnable_variants : []
	const unsupportedVariants = Array.isArray(compiled.unsupported_variants) ? compiled.unsupported_variants : []
	const groupedMembers = new Map<string, AssayMemberItem[]>()
	const runnableMembers: AssayMemberEntry[] = []
	const unsupportedMembers: UnsupportedAssayMemberEntry[] = []

	for (const [index, rawVariant] of runnableVariants.entries()) {
		const variant = parseVariantRecord(rawVariant, `${compiledPath} runnable_variants[${index}]`)
		const item = normalizeMemberItem(variant)
		const gene = variant.gene ?? 'Unassigned'
		const items = groupedMembers.get(gene) ?? []
		items.push(item)
		groupedMembers.set(gene, items)
		runnableMembers.push({
			type: 'runnable',
			variant: item,
		})
	}

	for (const [index, rawVariant] of unsupportedVariants.entries()) {
		const variant = parseVariantRecord(rawVariant, `${compiledPath} unsupported_variants[${index}]`)
		const item = normalizeMemberItem(variant)
		const gene = variant.gene ?? 'Unassigned'
		const items = groupedMembers.get(gene) ?? []
		items.push(item)
		groupedMembers.set(gene, items)
		unsupportedMembers.push({
			type: 'unsupported',
			reason: variant.reason ?? 'unsupported by bioscript runtime',
			variant: item,
		})
	}

	const assayMembers: AssayMemberGroup[] = Array.from(groupedMembers.entries()).map(([gene, items]) => ({
		gene,
		items,
	}))

	return {
		id: slugFromAssayId(assayId),
		title: asString(assay.label) ?? assayId,
		subtitle: asString(assay.summary) ?? '',
		summary: asString(assay.summary) ?? '',
		description: asString(assay.summary) ?? '',
		disclaimer: asString(assay.disclaimer),
		category: CATEGORY_MAP[asString(assay.category) ?? 'traits'] ?? 'traits',
		tags: asStringArray(assay.tags),
		packageVersion: asString(assay.package_version) ?? asString(compiled.version) ?? '1.0',
		sourceOfTruth: asString(assay.source_of_truth) ?? 'package',
		ui: {
			template: asString(ui.template) ?? 'variant-panel',
			version: asString(ui.version) ?? '1.0',
		},
		compatibility: {
			worksWith: asStringArray(compatibility.works_with),
			assemblies: asStringArray(compatibility.assemblies),
			notes: asStringArray(compatibility.notes),
		},
		privacy: {
			mode: asString(privacy.mode) ?? 'unknown',
			uploadsData: Boolean(privacy.uploads_data),
			storesResultsLocally: Boolean(privacy.stores_results_locally),
			externalUrls: asStringArray(privacy.external_urls),
		},
		interpretation: {
			matched: normalizeInterpretationState(interpretation.matched, {
				headline: 'Signal detected',
				body: 'This assay detected one or more matching rows.',
			}),
			normal: normalizeInterpretationState(interpretation.normal, {
				headline: 'No flagged signal found',
				body: 'The checked rows were present, but no flagged signal was detected.',
			}),
			missing: normalizeInterpretationState(interpretation.missing, {
				headline: 'Not enough data',
				body: 'This file did not include enough expected data for a confident result.',
			}),
			partial: normalizeInterpretationState(interpretation.partial, {
				headline: 'Partial result',
				body: 'Some expected rows were present, but coverage was incomplete.',
			}),
		},
		files: Object.keys(fileContents).sort(),
		packageSource,
		assayMembers,
		runnableMembers,
		unsupportedMembers,
	}
}

export function invalidateAvailableAssayManifestCache() {
	manifestCache = null
	manifestPromise = null
}

export async function listAvailableAssayManifests(): Promise<AssayManifest[]> {
	if (manifestCache) {
		return manifestCache
	}
	if (!manifestPromise) {
		manifestPromise = Promise.all([
			Promise.all(bundledAssaySources.map(loadBundledAssayPackage)),
			loadInstalledAssayPackages(),
		]).then(([bundledPackages, installedPackages]) => {
			const manifestsById = new Map<string, AssayManifest>()

			for (const loadedPackage of bundledPackages) {
				const manifest = parseLoadedAssayPackage(loadedPackage)
				manifestsById.set(manifest.id, manifest)
			}

			for (const loadedPackage of installedPackages) {
				const manifest = parseLoadedAssayPackage(loadedPackage)
				manifestsById.set(manifest.id, manifest)
			}

			manifestCache = Array.from(manifestsById.values()).sort((left, right) => left.title.localeCompare(right.title))
			return manifestCache
		})
	}
	return manifestPromise
}

export async function getAvailableAssayManifestById(id: string): Promise<AssayManifest | null> {
	const manifests = await listAvailableAssayManifests()
	return manifests.find((manifest) => manifest.id === id) ?? null
}

export function getCachedAvailableAssayManifestById(id: string): AssayManifest | null {
	return manifestCache?.find((manifest) => manifest.id === id) ?? null
}

export function getCachedAvailableAssayManifests(): AssayManifest[] {
	return manifestCache ?? []
}
