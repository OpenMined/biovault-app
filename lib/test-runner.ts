import { Asset } from 'expo-asset'
import { BUILT_IN_SAMPLE_DOCUMENT_ID } from '@/lib/home-import'
import type { HomeImportedDocument } from '@/lib/home-import'
import { prepareSampleGenomeImport } from '@/lib/genome-import'
import { getAvailableAssayManifestByIdSync } from '@/lib/assay-registry'
import type { StoredTestResultRow, StoredTestRun, TestResultStatus } from '@/lib/test-results'
import { runAssay } from '@/modules/expo-bioscript'
import { Directory, File, Paths } from 'expo-file-system'
import { readAsStringAsync } from 'expo-file-system/legacy'
import { Platform } from 'react-native'

function sanitizeFileName(name: string): string {
	return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function toNativePath(uri: string): string {
	return uri.replace('file://', '')
}

function toRelativePath(rootPath: string, fileUri: string): string {
	const nativePath = toNativePath(fileUri)
	const normalizedRoot = rootPath.endsWith('/') ? rootPath : `${rootPath}/`

	if (!nativePath.startsWith(normalizedRoot)) {
		throw new Error(`Path is outside Bioscript root: ${nativePath}`)
	}

	return nativePath.slice(normalizedRoot.length)
}

type BundledAssayDefinition = {
	assayContents: string
	assayPath: string
	fileContents: Record<string, string>
}

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

async function getBundledAssayDefinition(slug: string): Promise<BundledAssayDefinition | null> {
	const assay = getAvailableAssayManifestByIdSync(slug)
	const bundledAssay = assay?.bundledAssay
	if (!bundledAssay) {
		return null
	}

	const fileContents = Object.fromEntries(
		await Promise.all(
			Object.entries(bundledAssay.fileAssetModuleIds).map(async ([path, assetModuleId]) => [
				path,
				await loadBundledAssetText(assetModuleId),
			])
		)
	)

	return {
		assayPath: bundledAssay.assayPath,
		assayContents: await loadBundledAssetText(bundledAssay.assayAssetModuleId),
		fileContents,
	}
}


type ResolvedInput = {
	contents: string
	inputLabel: string
	isSample: boolean
	uri?: string
}

async function getResolvedInput(document: HomeImportedDocument | null): Promise<ResolvedInput> {
	if (document?.id === BUILT_IN_SAMPLE_DOCUMENT_ID || document?.uri === 'biovault://sample') {
		const sample = await prepareSampleGenomeImport()
		return {
			contents: await readAsStringAsync(sample.uri),
			inputLabel: document?.name ?? sample.originalName,
			isSample: true,
			uri: sample.uri,
		}
	}

	if (document?.contents) {
		return {
			contents: document.contents,
			inputLabel: document.name,
			isSample: false,
			uri: document.uri,
		}
	}

	if (document?.uri) {
		return {
			contents: await readAsStringAsync(document.uri),
			inputLabel: document.name,
			isSample: false,
			uri: document.uri,
		}
	}

	const sample = await prepareSampleGenomeImport()
	return {
		contents: await readAsStringAsync(sample.uri),
		inputLabel: sample.originalName,
		isSample: true,
		uri: sample.uri,
	}
}

function parseDelimited(text: string) {
	const lines = text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)

	if (lines.length < 2) {
		return []
	}

	const firstLine = lines[0]
	if (!firstLine) {
		return []
	}

	const headers = firstLine.split('\t')
	return lines.slice(1).map((line) => {
		const values = line.split('\t')
		return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))
	})
}

function normalizeStatus(status: string | undefined): TestResultStatus {
	if (status === 'matched' || status === 'missing') {
		return status
	}
	return 'normal'
}

function parseAltList(value: string | undefined): string[] | undefined {
	if (!value) {
		return undefined
	}

	const trimmed = value.trim()
	if (!trimmed) {
		return undefined
	}

	if (trimmed.startsWith('[')) {
		try {
			const parsed = JSON.parse(trimmed)
			if (Array.isArray(parsed)) {
				const alts = parsed.map((item) => String(item).trim()).filter(Boolean)
				return alts.length ? alts : undefined
			}
		} catch {
			// Fall through to delimiter parsing.
		}
	}

	const alts = trimmed
		.split(/[|,]/)
		.map((item) => item.trim())
		.filter(Boolean)

	return alts.length ? alts : undefined
}

function normalizeBioscriptRows(rows: Array<Record<string, string>>): StoredTestResultRow[] {
	return rows.map((row) => ({
		gene: row.gene || 'Unknown',
		label: row.rsid || row.gene || 'Variant',
		rsid: row.rsid || undefined,
		location: row.location || 'Unknown location',
		kind: row.kind === 'INDEL' ? 'INDEL' : 'SNV',
		status: normalizeStatus(row.row_status),
		ref: row.ref || undefined,
		alts: parseAltList(row.alts),
		note: row.observed
			? `Observed genotype ${row.observed}.${row.summary ? ` Summary: ${row.summary}.` : ''}`
			: 'This variant was not found in the current genomic file.',
	}))
}

async function runBioscriptTest(slug: string, importedDocument: HomeImportedDocument | null) {
	const assayPackage = await getBundledAssayDefinition(slug)
	if (!assayPackage) {
		throw new Error('No executable assay package exists for this assay yet.')
	}

	const input = await getResolvedInput(importedDocument)

	if (Platform.OS === 'web') {
		const result = await runAssay({
			assayPath: assayPackage.assayPath,
			assayContents: assayPackage.assayContents,
			fileContents: assayPackage.fileContents,
			inputFile: input.inputLabel,
			inputContents: input.contents,
			outputFile: 'assay-output.tsv',
			participantId: sanitizeFileName(input.inputLabel),
			inputFormat: 'text',
			maxDurationMs: 60_000,
			maxMemoryBytes: 128 * 1024 * 1024,
			maxAllocations: 1_000_000,
			maxRecursionDepth: 512,
		})

		const output = result.outputText ?? result.outputFiles?.['assay-output.tsv'] ?? ''
		return {
			inputLabel: input.inputLabel,
			rows: normalizeBioscriptRows(parseDelimited(output)),
			unsupportedVariants: result.assay?.unsupportedVariants ?? [],
		}
	}

	const bioscriptDirectory = new Directory(Paths.document, 'bioscript-tests')
	if (!bioscriptDirectory.exists) {
		bioscriptDirectory.create({ idempotent: true, intermediates: true })
	}
	const cacheDirectory = new Directory(bioscriptDirectory, '.bioscript-cache')
	if (!cacheDirectory.exists) {
		cacheDirectory.create({ idempotent: true, intermediates: true })
	}

	const bioscriptRoot = toNativePath(bioscriptDirectory.uri)
	const runtimeInputFile = `inputs/${sanitizeFileName(input.inputLabel)}`
	const outputFile = new File(bioscriptDirectory, 'assay-output.tsv')
	await runAssay({
		assayPath: assayPackage.assayPath,
		assayContents: assayPackage.assayContents,
		fileContents: assayPackage.fileContents,
		root: bioscriptRoot,
		inputFile: runtimeInputFile,
		inputContents: input.contents,
		outputFile: toRelativePath(bioscriptRoot, outputFile.uri),
		participantId: sanitizeFileName(input.inputLabel),
		autoIndex: true,
		cacheDir: toRelativePath(bioscriptRoot, cacheDirectory.uri),
		maxDurationMs: 60_000,
		maxMemoryBytes: 128 * 1024 * 1024,
		maxAllocations: 1_000_000,
		maxRecursionDepth: 512,
	})

	const output = await readAsStringAsync(outputFile.uri)
	return {
		inputLabel: input.inputLabel,
		rows: normalizeBioscriptRows(parseDelimited(output)),
		unsupportedVariants: [],
	}
}

export async function runTest(slug: string, importedDocument: HomeImportedDocument | null) {
	const assay = getAvailableAssayManifestByIdSync(slug)
	if (!assay) {
		throw new Error('Assay not found.')
	}

	const result = await runBioscriptTest(slug, importedDocument)
	return {
		inputDocumentId: importedDocument?.id ?? null,
		slug,
		ranAt: new Date().toISOString(),
		inputLabel: result.inputLabel,
		isPreview: false,
		rows: result.rows,
		unsupportedVariants: result.unsupportedVariants,
	}
}
