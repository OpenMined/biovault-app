import type { HomeImportedDocument } from '@/lib/home-import'
import { prepareSampleGenomeImport } from '@/lib/genome-import'
import { getTestBySlug } from '@/lib/test-catalog'
import type { StoredTestResultRow, StoredTestRun, TestResultStatus } from '@/lib/test-results'
import { runFile } from '@/modules/expo-bioscript'
import { Directory, File, Paths } from 'expo-file-system'
import { readAsStringAsync, writeAsStringAsync } from 'expo-file-system/legacy'
import { Platform } from 'react-native'

const HERC2_SCRIPT = `HERC2_SITE = bioscript.variant(
    rsid=["rs12913832", "rs60078917"],
    grch37="15:28365618-28365618",
    grch38="15:28120472-28120472",
    ref="A",
    alt="G",
    kind="snp",
)

def classify_eye_color(genotypes):
    observed = genotypes.lookup_variant(HERC2_SITE)

    if observed is None or observed == "--":
        return "No call", None, "missing"
    if observed == "GG":
        return "Blue", observed, "matched"
    if observed == "AA" or observed == "AG":
        return "Brown", observed, "normal"
    return "Unknown", observed, "normal"

def main():
    genotypes = bioscript.load_genotypes(input_file)
    eye_color, observed, row_status = classify_eye_color(genotypes)
    rows = [{
        "participant_id": participant_id,
        "gene": "HERC2",
        "rsid": "rs12913832",
        "location": "GRCh37 chr15:28365618",
        "kind": "SNV",
        "observed": observed,
        "row_status": row_status,
        "eye_color": eye_color,
    }]
    bioscript.write_tsv(output_file, rows)
    print(eye_color)

if __name__ == "__main__":
    main()
`

const APOL1_SCRIPT = `G1_SITE_1 = bioscript.variant(
    rsid="rs73885319",
    grch37="22:36661906-36661906",
    grch38="22:36265860-36265860",
    ref="A",
    alt="G",
    kind="snp",
)

G1_SITE_2 = bioscript.variant(
    rsid="rs60910145",
    grch37="22:36662034-36662034",
    grch38="22:36265988-36265988",
    ref="T",
    alt="G",
    kind="snp",
)

G2_SITE = bioscript.variant(
    rsid=["rs71785313", "rs1317778148", "rs143830837"],
    grch37="22:36662046-36662051",
    grch38="22:36266000-36266005",
    ref="I",
    alt="D",
    kind="deletion",
    deletion_length=6,
    motifs=["TTATAA", "ATAATT"],
)

def count_char(text, needle):
    if text is None:
        return 0
    total = 0
    for ch in text:
        if ch == needle:
            total = total + 1
    return total

def count_non_ref(text, ref):
    if text is None:
        return 0
    total = 0
    for ch in text:
        if ch != ref and ch != "-":
            total = total + 1
    return total

def classify_apol1(site1, site2, g2):
    if site1 is None and site2 is None and g2 is None:
        return "G-/G-"

    d_count = count_char(g2, "D")
    site1_variants = count_non_ref(site1, "A")
    site2_variants = count_non_ref(site2, "T")

    has_g1 = site1_variants > 0 and site2_variants > 0
    if has_g1:
        g1_total = site1_variants + site2_variants
    else:
        g1_total = 0

    if d_count == 2:
        return "G2/G2"
    if d_count == 1:
        if g1_total >= 2:
            return "G2/G1"
        return "G2/G0"
    if g1_total == 4:
        return "G1/G1"
    if g1_total >= 2:
        return "G1/G0"
    return "G0/G0"

def row_status(observed, ref):
    if observed is None:
        return "missing"
    if ref == "I":
        if "D" in observed:
            return "matched"
        return "normal"
    if ref in observed:
        if len(observed) == 2 and observed[0] == ref and observed[1] == ref:
            return "normal"
    return "matched"

def main():
    genotypes = bioscript.load_genotypes(input_file)
    site1 = genotypes.lookup_variant(G1_SITE_1)
    site2 = genotypes.lookup_variant(G1_SITE_2)
    g2 = genotypes.lookup_variant(G2_SITE)
    status = classify_apol1(site1, site2, g2)

    rows = [
        {
            "participant_id": participant_id,
            "gene": "APOL1",
            "rsid": "rs73885319",
            "location": "GRCh37 chr22:36661906",
            "kind": "SNV",
            "observed": site1,
            "row_status": row_status(site1, "A"),
            "summary": status,
        },
        {
            "participant_id": participant_id,
            "gene": "APOL1",
            "rsid": "rs60910145",
            "location": "GRCh37 chr22:36662034",
            "kind": "SNV",
            "observed": site2,
            "row_status": row_status(site2, "T"),
            "summary": status,
        },
        {
            "participant_id": participant_id,
            "gene": "APOL1",
            "rsid": "rs71785313",
            "location": "GRCh37 chr22:36662046-36662051",
            "kind": "INDEL",
            "observed": g2,
            "row_status": row_status(g2, "I"),
            "summary": status,
        },
    ]
    bioscript.write_tsv(output_file, rows)
    print(status)

if __name__ == "__main__":
    main()
`

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

	for (let index = 0; ; index += 1) {
		const segment = splitPaths[0][index]
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

function getScriptDefinition(slug: string): ScriptDefinition | null {
	if (slug === 'herc2-eye-color') {
		return {
			scriptName: 'herc2.py',
			outputFile: 'herc2-output.tsv',
			scriptContents: HERC2_SCRIPT,
		}
	}

	if (slug === 'apol1-status') {
		return {
			scriptName: 'apol1.py',
			outputFile: 'apol1-output.tsv',
			scriptContents: APOL1_SCRIPT,
		}
	}

	return null
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

	const headers = lines[0].split('\t')
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
	const script = getScriptDefinition(slug)
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
	const test = getTestBySlug(slug)
	if (!test) {
		return []
	}

	return test.variantExamples.flatMap((group) =>
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
	const test = getTestBySlug(slug)
	if (!test) {
		throw new Error('Test not found.')
	}

	if (test.runMode === 'bioscript') {
		const result = await runBioscriptTest(slug, importedDocument)
		const run: StoredTestRun = {
			slug,
			ranAt: new Date().toISOString(),
			inputLabel: result.inputLabel,
			isPreview: false,
			rows: result.rows,
		}
		return run
	}

	return {
		slug,
		ranAt: new Date().toISOString(),
		inputLabel: importedDocument?.name ?? 'Bundled preview data',
		isPreview: true,
		rows: buildPreviewRows(slug),
	}
}
