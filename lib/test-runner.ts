import { Asset } from 'expo-asset'
import type { HomeImportedDocument } from '@/lib/home-import'
import { prepareSampleGenomeImport } from '@/lib/genome-import'
import { getAvailableAssayManifestByIdSync } from '@/lib/assay-registry'
import type { StoredTestResultRow, StoredTestRun, TestResultStatus } from '@/lib/test-results'
import { runFile } from '@/modules/expo-bioscript'
import { Directory, File, Paths } from 'expo-file-system'
import { readAsStringAsync, writeAsStringAsync } from 'expo-file-system/legacy'
import { Platform } from 'react-native'

function sanitizeFileName(name: string): string {
	return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function toNativePath(uri: string): string {
	return uri.replace('file://', '')
}

function commonPathPrefix(paths: string[]): string {
	if (paths.length === 0) {
		throw new Error('No paths provided')
	}

	const splitPaths = paths.map((path) => path.split('/').filter(Boolean))
	const prefix: string[] = []
	const firstPath = splitPaths[0]

	if (!firstPath) {
		throw new Error('No paths provided')
	}

	for (let index = 0; ; index += 1) {
		const segment = firstPath[index]
		if (!segment) {
			break
		}

		if (splitPaths.every((path) => path[index] === segment)) {
			prefix.push(segment)
			continue
		}

		break
	}

	return `/${prefix.join('/')}`
}

function toRelativePath(rootPath: string, fileUri: string): string {
	const nativePath = toNativePath(fileUri)
	const normalizedRoot = rootPath.endsWith('/') ? rootPath : `${rootPath}/`

	if (!nativePath.startsWith(normalizedRoot)) {
		throw new Error(`Path is outside Bioscript root: ${nativePath}`)
	}

	return nativePath.slice(normalizedRoot.length)
}

type ScriptDefinition = {
	outputFile: string
	scriptContents: string
	scriptName: string
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

async function getScriptDefinition(slug: string): Promise<ScriptDefinition | null> {
	const assay = getAvailableAssayManifestByIdSync(slug)
	const bundledBioscript = assay?.bundledBioscript
	if (!bundledBioscript) {
		return null
	}

	return {
		scriptName: bundledBioscript.scriptName,
		outputFile: bundledBioscript.outputFile,
		scriptContents: await loadBundledAssetText(bundledBioscript.assetModuleId),
	}
}

type ResolvedInput = {
	contents: string
	inputLabel: string
	isSample: boolean
	uri?: string
}

async function getResolvedInput(document: HomeImportedDocument | null): Promise<ResolvedInput> {
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

function normalizeBioscriptRows(rows: Array<Record<string, string>>): StoredTestResultRow[] {
	return rows.map((row) => ({
		gene: row.gene || 'Unknown',
		label: row.rsid || row.gene || 'Variant',
		rsid: row.rsid || undefined,
		location: row.location || 'Unknown location',
		kind: row.kind === 'INDEL' ? 'INDEL' : 'SNV',
		status: normalizeStatus(row.row_status),
		note: row.observed
			? `Observed genotype ${row.observed}.${row.summary ? ` Summary: ${row.summary}.` : ''}`
			: 'This variant was not found in the current genomic file.',
	}))
}

async function runBioscriptTest(slug: string, importedDocument: HomeImportedDocument | null) {
	const script = await getScriptDefinition(slug)
	if (!script) {
		throw new Error('No executable Bioscript definition exists for this test yet.')
	}

	const input = await getResolvedInput(importedDocument)

	if (Platform.OS === 'web') {
		const result = await runFile({
			scriptPath: script.scriptName,
			scriptContents: script.scriptContents,
			inputFile: input.inputLabel,
			inputContents: input.contents,
			outputFile: script.outputFile,
			participantId: sanitizeFileName(input.inputLabel),
			inputFormat: 'text',
			maxDurationMs: 60_000,
			maxMemoryBytes: 128 * 1024 * 1024,
			maxAllocations: 1_000_000,
			maxRecursionDepth: 512,
		})

		const output = result.outputText ?? result.outputFiles?.[script.outputFile] ?? ''
		return {
			inputLabel: input.inputLabel,
			rows: normalizeBioscriptRows(parseDelimited(output)),
		}
	}

	const bioscriptRoot = commonPathPrefix([toNativePath(Paths.document.uri), toNativePath(Paths.cache.uri)])
	const bioscriptDirectory = new Directory(Paths.document, 'bioscript-tests')
	if (!bioscriptDirectory.exists) {
		bioscriptDirectory.create({ idempotent: true, intermediates: true })
	}
	const cacheDirectory = new Directory(bioscriptDirectory, '.bioscript-cache')
	if (!cacheDirectory.exists) {
		cacheDirectory.create({ idempotent: true, intermediates: true })
	}

	const scriptFile = new File(bioscriptDirectory, script.scriptName)
	const outputFile = new File(bioscriptDirectory, script.outputFile)
	await writeAsStringAsync(scriptFile.uri, script.scriptContents)

	await runFile({
		scriptPath: toNativePath(scriptFile.uri),
		root: bioscriptRoot,
		inputFile: toRelativePath(bioscriptRoot, input.uri!),
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
	}
}

function buildPreviewRows(slug: string): StoredTestResultRow[] {
	const assay = getAvailableAssayManifestByIdSync(slug)
	if (!assay) {
		return []
	}

	return assay.variantExamples.flatMap((group) =>
		group.items.map((item) => ({
			gene: group.gene,
			label: item.rsid ?? item.id,
			rsid: item.rsid,
			location: item.location,
			kind: item.kind,
			status: item.status,
			note: item.note,
		}))
	)
}

export async function runTest(slug: string, importedDocument: HomeImportedDocument | null) {
	const assay = getAvailableAssayManifestByIdSync(slug)
	if (!assay) {
		throw new Error('Test not found.')
	}

	if (assay.runMode === 'bioscript') {
		const result = await runBioscriptTest(slug, importedDocument)
		const run: StoredTestRun = {
			inputDocumentId: importedDocument?.id ?? null,
			slug,
			ranAt: new Date().toISOString(),
			inputLabel: result.inputLabel,
			isPreview: false,
			rows: result.rows,
		}
		return run
	}

	return {
		inputDocumentId: importedDocument?.id ?? null,
		slug,
		ranAt: new Date().toISOString(),
		inputLabel: importedDocument?.name ?? 'Bundled preview data',
		isPreview: true,
		rows: buildPreviewRows(slug),
	}
}
