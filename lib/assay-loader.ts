import { Asset } from 'expo-asset'
import { readAsStringAsync } from 'expo-file-system/legacy'
import { getAppDb } from '@/lib/app-db'
import { Platform } from 'react-native'
import YAML from 'yaml'

import { bundledAssaySources, type BundledAssaySource } from '@/lib/bundled-assay-sources'
import type {
	AssayDiscoverCategory,
	AssayManifest,
	AssayMemberGroup,
	AssayMemberItem,
	AssayPackageSource,
	InstalledAssayPackageSource,
} from '@/lib/assay-manifests'

type YamlMap = Record<string, unknown>
type InstalledAssayRow = {
	id: string
	installed_at: string
	manifest_json: string
	source: string
	version: string
}
type InstalledAssayRecord = {
	assayPath: string
	fileUris: Record<string, string>
	rootUri: string
}
type LoadedAssayPackage = {
	fileContents: Record<string, string>
	packageSource: AssayPackageSource
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

function readYamlMap(text: string, label: string): YamlMap {
	const value = YAML.parse(text)
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`${label} did not contain a YAML mapping`)
	}
	return value as YamlMap
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

function relativeDirname(path: string): string {
	const normalized = path.replace(/\\/g, '/')
	const lastSlash = normalized.lastIndexOf('/')
	return lastSlash === -1 ? '' : normalized.slice(0, lastSlash)
}

function joinRelative(base: string, relative: string): string {
	const parts = `${base}/${relative}`.replace(/\\/g, '/').split('/').filter(Boolean)
	const stack: string[] = []

	for (const part of parts) {
		if (part === '.') {
			continue
		}
		if (part === '..') {
			stack.pop()
			continue
		}
		stack.push(part)
	}

	return stack.join('/')
}

function formatLocation(coordinates: YamlMap | null | undefined): string | null {
	if (!coordinates) {
		return null
	}

	for (const assembly of ['grch37', 'grch38']) {
		const raw = coordinates[assembly]
		if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
			continue
		}

		const entry = raw as YamlMap
		const chrom = asString(entry.chrom)
		if (!chrom) {
			continue
		}
		if (typeof entry.pos === 'number') {
			return `${assembly.toUpperCase()} chr${chrom}:${entry.pos}`
		}
		if (typeof entry.start === 'number' && typeof entry.end === 'number') {
			return `${assembly.toUpperCase()} chr${chrom}:${entry.start}-${entry.end}`
		}
	}

	return null
}

function normalizeInterpretationState(raw: unknown, defaults: { headline: string; body: string }) {
	const state = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as YamlMap) : {}
	return {
		headline: asString(state.headline) ?? defaults.headline,
		body: asString(state.body) ?? defaults.body,
		caveat: asString(state.caveat),
	}
}

function normalizeMemberItem(variantId: string, variant: YamlMap): AssayMemberItem {
	const identifiers =
		variant.identifiers && typeof variant.identifiers === 'object' && !Array.isArray(variant.identifiers)
			? (variant.identifiers as YamlMap)
			: {}
	const alleles =
		variant.alleles && typeof variant.alleles === 'object' && !Array.isArray(variant.alleles)
			? (variant.alleles as YamlMap)
			: {}
	const findings = Array.isArray(variant.findings) ? variant.findings : []
	const firstFinding =
		findings.find((entry) => entry && typeof entry === 'object' && !Array.isArray(entry)) as YamlMap | undefined
	const rsids = asStringArray(identifiers.rsids)
	const alts = asStringArray(alleles.alts)
	const kind = asString(alleles.kind)

	return {
		id: variantId,
		rsid: rsids[0] ?? null,
		location:
			variant.coordinates && typeof variant.coordinates === 'object' && !Array.isArray(variant.coordinates)
				? formatLocation(variant.coordinates as YamlMap)
				: null,
		kind: kind === 'deletion' || kind === 'insertion' || kind === 'indel' ? 'INDEL' : 'SNV',
		ref: asString(alleles.ref),
		alts,
		note: asString(firstFinding?.notes) ?? asString(variant.summary) ?? '',
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

function parseLoadedAssayPackage(loadedPackage: LoadedAssayPackage): AssayManifest {
	const { fileContents, packageSource } = loadedPackage
	const assayPath = packageSource.assayPath

	const assay = readYamlMap(fileContents[assayPath], assayPath)
	const assayId = asString(assay.assay_id)
	if (!assayId) {
		throw new Error(`${assayPath} is missing assay_id`)
	}

	const metadata =
		assay.metadata && typeof assay.metadata === 'object' && !Array.isArray(assay.metadata)
			? (assay.metadata as YamlMap)
			: {}
	const packageBlock =
		assay.package && typeof assay.package === 'object' && !Array.isArray(assay.package)
			? (assay.package as YamlMap)
			: {}
	const ui = assay.ui && typeof assay.ui === 'object' && !Array.isArray(assay.ui) ? (assay.ui as YamlMap) : {}
	const compatibility =
		assay.compatibility && typeof assay.compatibility === 'object' && !Array.isArray(assay.compatibility)
			? (assay.compatibility as YamlMap)
			: {}
	const privacy =
		assay.privacy && typeof assay.privacy === 'object' && !Array.isArray(assay.privacy)
			? (assay.privacy as YamlMap)
			: {}
	const interpretation =
		assay.interpretation && typeof assay.interpretation === 'object' && !Array.isArray(assay.interpretation)
			? (assay.interpretation as YamlMap)
			: {}
	const interpretationStates =
		interpretation.states && typeof interpretation.states === 'object' && !Array.isArray(interpretation.states)
			? (interpretation.states as YamlMap)
			: {}
	const implementation =
		assay.implementation && typeof assay.implementation === 'object' && !Array.isArray(assay.implementation)
			? (assay.implementation as YamlMap)
			: {}
	const inputs =
		assay.inputs && typeof assay.inputs === 'object' && !Array.isArray(assay.inputs)
			? (assay.inputs as YamlMap)
			: {}

	const cataloguePath = asString(inputs.catalogue)
	if (!cataloguePath) {
		throw new Error(`${assayPath} is missing inputs.catalogue`)
	}

	const assayDir = relativeDirname(assayPath)
	const fullCataloguePath = joinRelative(assayDir, cataloguePath)
	const catalogue = readYamlMap(fileContents[fullCataloguePath], fullCataloguePath)
	const variants = Array.isArray(catalogue.variants) ? catalogue.variants : []
	const groupedMembers = new Map<string, AssayMemberItem[]>()

	for (const variantRef of variants) {
		if (!variantRef || typeof variantRef !== 'object' || Array.isArray(variantRef)) {
			continue
		}
		const variantEntry = variantRef as YamlMap
		const relativeVariantPath = asString(variantEntry.path)
		if (!relativeVariantPath) {
			continue
		}

		const fullVariantPath = joinRelative(assayDir, relativeVariantPath)
		const variant = readYamlMap(fileContents[fullVariantPath], fullVariantPath)
		const gene = asString(variant.gene) ?? 'Unassigned'
		const item = normalizeMemberItem(asString(variantEntry.id) ?? asString(variant.name) ?? relativeVariantPath, variant)
		const items = groupedMembers.get(gene) ?? []
		items.push(item)
		groupedMembers.set(gene, items)
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
		disclaimer: asString(metadata.disclaimer),
		category: CATEGORY_MAP[asString(metadata.category) ?? 'traits'] ?? 'traits',
		tags: asStringArray(metadata.tags),
		packageVersion: asString(packageBlock.assay_version) ?? asString(assay.version) ?? '1.0',
		sourceOfTruth: asString(packageBlock.source_of_truth) ?? 'package',
		ui: {
			template: asString(ui.template) ?? 'variant-panel',
			version: asString(ui.version) ?? '1.0',
		},
		compatibility: {
			worksWith: asStringArray(compatibility.works_with),
			assemblies: asStringArray(compatibility.assemblies),
			notes: Array.isArray(compatibility.notes)
				? asStringArray(compatibility.notes)
				: asString(compatibility.notes)
					? [asString(compatibility.notes)!]
					: [],
		},
		privacy: {
			mode: asString(privacy.mode) ?? 'unknown',
			uploadsData: Boolean(privacy.uploads_data),
			storesResultsLocally: Boolean(privacy.stores_results_locally),
			externalUrls: asStringArray(privacy.external_urls),
		},
		interpretation: {
			matched: normalizeInterpretationState(interpretationStates.matched, {
				headline: 'Signal detected',
				body: 'This assay detected one or more matching rows.',
			}),
			normal: normalizeInterpretationState(interpretationStates.normal, {
				headline: 'No flagged signal found',
				body: 'The checked rows were present, but no flagged signal was detected.',
			}),
			missing: normalizeInterpretationState(interpretationStates.missing, {
				headline: 'Not enough data',
				body: 'This file did not include enough expected data for a confident result.',
			}),
			partial: normalizeInterpretationState(interpretationStates.partial, {
				headline: 'Partial result',
				body: 'Some expected rows were present, but coverage was incomplete.',
			}),
		},
		files: Object.keys(fileContents).sort(),
		packageSource,
		assayMembers,
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
