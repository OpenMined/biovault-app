import { ALLOWED_ASSAY_OUTCOMES, ASSAY_OUTCOME_FIELD } from '@/lib/assay-result-schema'
import { fetchGitHubFileText } from '@/lib/github-assay-packages'
import { BUILT_IN_SAMPLE_DOCUMENT_ID } from '@/lib/home-import'
import type { HomeImportedDocument } from '@/lib/home-import'
import { prepareSampleGenomeImport } from '@/lib/genome-import'
import { getAvailableAssayManifestById } from '@/lib/assay-registry'
import type { StoredTestResultRow, TestResultStatus, TestRunOutcome } from '@/lib/test-results'
import { runAssay } from '@/modules/expo-bioscript'
import { Directory, File, Paths } from 'expo-file-system'
import { readAsStringAsync } from 'expo-file-system/legacy'
import { Platform } from 'react-native'
import YAML from 'yaml'

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

type AssayDefinition = {
	assayContents: string
	assayPath: string
	compiledContents?: string
	compiledPath?: string
	fileContents: Record<string, string>
}

function readYamlMap(text: string, label: string): Record<string, unknown> {
	const parsed = YAML.parse(text)
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error(`${label} must contain a YAML mapping`)
	}
	return parsed as Record<string, unknown>
}

export type TestRunProgress = {
	completed: number | null
	detail: string | null
	elapsedMs: number
	phase: string
	total: number | null
}

function parseProgressText(text: string, elapsedMs: number): TestRunProgress | null {
	const [phase = '', completedRaw = '', totalRaw = '', ...detailParts] = text.trim().split('\t')
	if (!phase) {
		return null
	}
	const completed = completedRaw ? Number.parseInt(completedRaw, 10) : null
	const total = totalRaw ? Number.parseInt(totalRaw, 10) : null
	const detailText = detailParts.join('\t').trim()
	return {
		completed: Number.isFinite(completed) ? completed : null,
		detail: detailText || null,
		elapsedMs,
		phase,
		total: Number.isFinite(total) ? total : null,
	}
}

async function getAssayDefinition(slug: string): Promise<AssayDefinition | null> {
	const assay = await getAvailableAssayManifestById(slug)
	const packageSource = assay?.packageSource
	if (!packageSource) {
		return null
	}

	const fileContents =
		packageSource.type === 'remote'
				? await (async () => {
						console.log('[github-assays] remote run fetch', {
							assayPath: packageSource.assayPath,
							compiledPath: packageSource.compiledPath,
							artifactUrl: packageSource.artifactUrl,
						})
						const assayContents = await fetchGitHubFileText(packageSource.location, packageSource.assayPath)
						const compiledContents = await fetchGitHubFileText(packageSource.location, packageSource.compiledPath)
						const nextFiles: Record<string, string> = {
							[packageSource.assayPath]: assayContents,
							[packageSource.compiledPath]: compiledContents,
						}
						const assayManifest = readYamlMap(assayContents, packageSource.assayPath)
						const implementation =
							(assayManifest.implementation as Record<string, unknown> | undefined) ?? {}

						if (implementation.kind === 'script' && typeof implementation.path === 'string' && implementation.path) {
							const assayDir = packageSource.assayPath.slice(0, packageSource.assayPath.lastIndexOf('/'))
							const scriptPath = `${assayDir}/${implementation.path}`
							nextFiles[scriptPath] = await fetchGitHubFileText(packageSource.location, scriptPath)
						}
						return nextFiles
					})()
			: Object.fromEntries(
					await Promise.all(
						Object.entries(packageSource.fileUris).map(async ([path, fileUri]) => [
							path,
							await readAsStringAsync(fileUri),
						])
					)
				)

	return {
		assayPath: packageSource.assayPath,
		assayContents: fileContents[packageSource.assayPath] ?? '',
		compiledContents: fileContents[packageSource.compiledPath],
		compiledPath: packageSource.compiledPath,
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

function normalizeOutcome(value: string | undefined): TestRunOutcome | undefined {
	if (value && ALLOWED_ASSAY_OUTCOMES.has(value as TestRunOutcome)) {
		return value as TestRunOutcome
	}
	return undefined
}

function extractOutcome(rows: Array<Record<string, string>>, normalizedRows: StoredTestResultRow[]): TestRunOutcome {
	const explicitOutcome = rows.map((row) => normalizeOutcome(row[ASSAY_OUTCOME_FIELD])).find(Boolean)
	if (explicitOutcome) {
		return explicitOutcome
	}
	throw new Error(
		`Assay output is missing required '${ASSAY_OUTCOME_FIELD}' field for all ${normalizedRows.length} result rows.`
	)
}

async function runBioscriptTest(
	slug: string,
	importedDocument: HomeImportedDocument | null,
	onProgress?: (progress: TestRunProgress) => void
) {
	const assayPackage = await getAssayDefinition(slug)
	if (!assayPackage) {
		throw new Error('No executable assay package exists for this assay yet.')
	}

	const input = await getResolvedInput(importedDocument)

	if (Platform.OS === 'web') {
		console.log('[bioscript-run] request', {
			assayPath: assayPackage.assayPath,
			compiledPath: assayPackage.compiledPath,
			maxDurationMs: 600_000,
			platform: 'web',
		})
		const result = await runAssay({
			assayPath: assayPackage.assayPath,
			assayContents: assayPackage.assayContents,
			compiledContents: assayPackage.compiledContents,
			compiledPath: assayPackage.compiledPath,
			fileContents: assayPackage.fileContents,
			inputFile: input.inputLabel,
			inputContents: input.contents,
			outputFile: 'assay-output.tsv',
			participantId: sanitizeFileName(input.inputLabel),
			inputFormat: 'text',
			maxDurationMs: 180_000,
			maxMemoryBytes: 128 * 1024 * 1024,
			maxAllocations: 1_000_000,
			maxRecursionDepth: 512,
		})

		const output = result.outputText ?? result.outputFiles?.['assay-output.tsv'] ?? ''
		const parsedRows = parseDelimited(output)
		const normalizedRows = normalizeBioscriptRows(parsedRows)
		return {
			inputLabel: input.inputLabel,
			outcome: extractOutcome(parsedRows, normalizedRows),
			rows: normalizedRows,
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
	const progressFile = new File(bioscriptDirectory, 'assay-progress.txt')
	const timingReportFile = new File(bioscriptDirectory, 'assay-timings.tsv')
	if (progressFile.exists) {
		progressFile.delete()
	}
	if (timingReportFile.exists) {
		timingReportFile.delete()
	}
	const startedAt = Date.now()
	console.log('[bioscript-run] request', {
		assayPath: assayPackage.assayPath,
		compiledPath: assayPackage.compiledPath,
		maxDurationMs: 600_000,
		platform: Platform.OS,
	})
	onProgress?.({
		completed: 0,
		detail: 'Preparing assay runtime',
		elapsedMs: 0,
		phase: 'starting',
		total: null,
	})
	const progressPollId = onProgress
		? setInterval(async () => {
				if (!progressFile.exists) {
					return
				}
				try {
					const text = await readAsStringAsync(progressFile.uri)
					const parsed = parseProgressText(text, Date.now() - startedAt)
					if (parsed) {
						onProgress(parsed)
					}
				} catch {
					// Keep polling until the assay completes.
				}
			}, 500)
		: null

	try {
		const result = await runAssay({
			assayPath: assayPackage.assayPath,
			assayContents: assayPackage.assayContents,
			compiledContents: assayPackage.compiledContents,
			compiledPath: assayPackage.compiledPath,
			fileContents: assayPackage.fileContents,
			progressFile: toRelativePath(bioscriptRoot, progressFile.uri),
			root: bioscriptRoot,
			inputFile: runtimeInputFile,
			inputContents: input.contents,
			outputFile: toRelativePath(bioscriptRoot, outputFile.uri),
			participantId: sanitizeFileName(input.inputLabel),
			autoIndex: true,
			cacheDir: toRelativePath(bioscriptRoot, cacheDirectory.uri),
			timingReportPath: toNativePath(timingReportFile.uri),
			maxDurationMs: 600_000,
			maxMemoryBytes: 128 * 1024 * 1024,
			maxAllocations: 1_000_000,
			maxRecursionDepth: 512,
		})

		onProgress?.({
			completed: null,
			detail: 'Assay run complete',
			elapsedMs: Date.now() - startedAt,
			phase: 'complete',
			total: null,
		})

		if (timingReportFile.exists) {
			try {
				const timingReport = await readAsStringAsync(timingReportFile.uri)
				console.log('[bioscript-run] timing report\n' + timingReport)
			} catch (error) {
				console.warn('[bioscript-run] failed to read timing report', error)
			}
		}

		const output = await readAsStringAsync(outputFile.uri)
		const parsedRows = parseDelimited(output)
		const normalizedRows = normalizeBioscriptRows(parsedRows)
		return {
			inputLabel: input.inputLabel,
			outcome: extractOutcome(parsedRows, normalizedRows),
			rows: normalizedRows,
			unsupportedVariants: result.assay?.unsupportedVariants ?? [],
		}
	} finally {
		if (progressPollId !== null) {
			clearInterval(progressPollId)
		}
	}
}

export async function runTest(
	slug: string,
	importedDocument: HomeImportedDocument | null,
	onProgress?: (progress: TestRunProgress) => void
) {
	const assay = await getAvailableAssayManifestById(slug)
	if (!assay) {
		throw new Error('Assay not found.')
	}

	const result = await runBioscriptTest(slug, importedDocument, onProgress)
	return {
		inputDocumentId: importedDocument?.id ?? null,
		slug,
		ranAt: new Date().toISOString(),
		inputLabel: result.inputLabel,
		isPreview: false,
		outcome: result.outcome,
		rows: result.rows,
		unsupportedVariants: result.unsupportedVariants,
	}
}
