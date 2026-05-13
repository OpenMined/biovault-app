#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { strToU8, zipSync } from 'fflate'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const repoTempRoot = path.join(root, '.tmp')
mkdirSync(repoTempRoot, { recursive: true })
const tempRoot = mkdtempSync(path.join(repoTempRoot, 'bioscript-parity-'))
const inputPath = path.join(root, 'tests/fixtures/apol1-g0g0.txt')
const variantsPath = path.join(root, 'tests/fixtures/apol1-variants.json')
const inputRel = path.relative(root, inputPath)
const apol1ScriptRel = 'exvitae/assays/risk/APOL1/apol1.py'
const wasmRunner = path.join(root, 'modules/expo-bioscript/scripts/run-bioscript-wasm.cjs')
const bioscriptShim = path.join(root, 'bioscript/bs')
const bsWasmShim = path.join(root, 'tools/bs-wasm.mjs')
const skipWasm = process.env.BIOSCRIPT_SKIP_WASM_PARITY === '1'

process.on('exit', () => {
	rmSync(tempRoot, { force: true, recursive: true })
})

function run(name, command, args, options = {}) {
	const result = spawnSync(command, args, {
		cwd: root,
		encoding: 'utf8',
		maxBuffer: 10 * 1024 * 1024,
		...options,
	})
	if (result.status !== 0) {
		const error = new Error(`${name} failed with exit ${result.status}\n${result.stderr || result.stdout}`)
		error.status = result.status
		error.stdout = result.stdout
		error.stderr = result.stderr
		throw error
	}
	return result.stdout
}

function parseJsonOutput(stdout) {
	const trimmed = stdout.trim()
	if (!trimmed) throw new Error('expected JSON output, got empty stdout')
	return JSON.parse(trimmed)
}

function assertEqual(actual, expected, label) {
	if (actual !== expected) {
		throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
	}
}

function assertObservationGenotypes(observations, expected) {
	const byName = new Map(observations.map((obs) => [obs.name, obs]))
	for (const [name, genotype] of Object.entries(expected)) {
		assertEqual(byName.get(name)?.genotype, genotype, `wasm ${name} genotype`)
	}
}

function assertArrayEqual(actual, expected, label) {
	if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
		throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
	}
}

function readJsonl(file) {
	return readFileSync(file, 'utf8')
		.split(/\r?\n/)
		.filter(Boolean)
		.map((line) => JSON.parse(line))
}

function assertPgxApoeReport(outputDir) {
	const analyses = readJsonl(path.join(outputDir, 'analysis.jsonl'))
	const apoe = analyses.find((analysis) => analysis.analysis_id === 'apoe_epsilon')
	if (!apoe) throw new Error('PGx report did not emit apoe_epsilon analysis')
	const row = apoe.rows?.[0]
	if (!row) throw new Error('PGx apoe_epsilon analysis did not emit a row')
	assertEqual(row.rs429358, 'TT', 'PGx APOE rs429358 analysis genotype')
	assertEqual(row.rs7412, 'CC', 'PGx APOE rs7412 analysis genotype')
	assertEqual(row.apoe_status, 'e3/e3', 'PGx APOE status')
	assertEqual(row.apoe_outcome, 'normal', 'PGx APOE outcome')
	const observations = readFileSync(path.join(outputDir, 'observations.tsv'), 'utf8')
	if (!observations.includes('APOE-pgx-rs429358') || !observations.includes('\tTT\t')) {
		throw new Error('PGx APOE observations.tsv does not contain rs429358 TT')
	}
	if (!observations.includes('APOE-pgx-rs7412') || !observations.includes('\tCC\t')) {
		throw new Error('PGx APOE observations.tsv does not contain rs7412 CC')
	}
}

function makeZipFixture() {
	const dir = mkdtempSync(path.join(tmpdir(), 'biovault-apol1-parity-'))
	const zipPath = path.join(dir, 'apol1-g0g0.zip')
	const bytes = zipSync({
		'apol1-g0g0.txt': strToU8(readFileSync(inputPath, 'utf8')),
	})
	writeFileSync(zipPath, bytes)
	return zipPath
}

if (!existsSync(inputPath) || !existsSync(variantsPath)) {
	throw new Error('APOL1 parity fixtures are missing')
}

console.log('==> Rust CLI APOL1 text parity')
const cliStdout = run('bioscript CLI', bioscriptShim, [
	'--input-file',
	inputRel,
	'--input-format',
	'text',
	'--output-file',
	path.relative(root, path.join(tempRoot, 'assay-output.tsv')),
	'--participant-id',
	'fixture-g0g0',
	apol1ScriptRel,
])
if (!cliStdout.includes('G0/G0')) {
	throw new Error(`bioscript CLI did not report G0/G0\n${cliStdout}`)
}

console.log('==> WASM APOL1 genotype text parity')
const variantsJson = readFileSync(variantsPath, 'utf8')
let textLookup
try {
	textLookup = parseJsonOutput(run('bioscript wasm genotype text', 'node', [
		wasmRunner,
		'genotype',
		'--input',
		inputPath,
		'--variants',
		variantsJson,
	]))
} catch (error) {
	if (error.status === 2 && skipWasm) {
		console.warn('Skipping WASM parity because BIOSCRIPT_SKIP_WASM_PARITY=1 is set.')
		process.exit(0)
	}
	throw error
}
assertObservationGenotypes(textLookup, {
	rs73885319: 'AA',
	rs60910145: 'TT',
	rs71785313: 'II',
})

console.log('==> WASM APOL1 rsid text parity')
const textRsidLookup = parseJsonOutput(run('bioscript wasm rsid text', 'node', [
	wasmRunner,
	'rsids',
	'--input',
	inputPath,
	'--rsids',
	JSON.stringify(['rs73885319', 'rs60910145', 'rs71785313', 'rs-missing']),
], {
	env: { ...process.env, RUN_BIOSCRIPT_WASM_NO_BUILD: '1' },
}))
assertArrayEqual(textRsidLookup, ['AA', 'TT', 'II', null], 'wasm text rsid lookup')

console.log('==> WASM APOL1 genotype zip parity')
const zipPath = makeZipFixture()
const zipLookup = parseJsonOutput(run('bioscript wasm genotype zip', 'node', [
	wasmRunner,
	'genotype',
	'--input',
	zipPath,
	'--variants',
	variantsJson,
], {
	env: { ...process.env, RUN_BIOSCRIPT_WASM_NO_BUILD: '1' },
}))
assertObservationGenotypes(zipLookup, {
	rs73885319: 'AA',
	rs60910145: 'TT',
	rs71785313: 'II',
})

console.log('==> WASM APOL1 rsid zip parity')
const zipRsidLookup = parseJsonOutput(run('bioscript wasm rsid zip', 'node', [
	wasmRunner,
	'rsids',
	'--input',
	zipPath,
	'--rsids',
	JSON.stringify(['rs73885319', 'rs60910145', 'rs71785313', 'rs-missing']),
], {
	env: { ...process.env, RUN_BIOSCRIPT_WASM_NO_BUILD: '1' },
}))
assertArrayEqual(zipRsidLookup, ['AA', 'TT', 'II', null], 'wasm zip rsid lookup')

console.log('==> WASM inspect parity')
const inspection = parseJsonOutput(run('bioscript wasm inspect', 'node', [
	wasmRunner,
	'inspect',
	inputPath,
], {
	env: { ...process.env, RUN_BIOSCRIPT_WASM_NO_BUILD: '1' },
}))
assertEqual(inspection.detectedKind, 'genotype_text', 'inspect detectedKind')

const pgxManifestPath = path.join(root, 'exvitae/assays/pgx/pgx-1/manifest.yaml')
const pgx23andmePath = path.join(
	root,
	'test-data/23andme/v5/hu50B3F5/genome_hu50B3F5_v5_Full.zip',
)
if (existsSync(pgxManifestPath) && existsSync(pgx23andmePath)) {
	console.log('==> WASM PGx-1 23andMe APOE report parity')
	const pgxOutputDir = path.join(tempRoot, 'pgx-1-23andme-v5-wasm')
	run('bioscript wasm PGx-1 23andMe report', 'node', [
		bsWasmShim,
		'report',
		path.relative(root, pgxManifestPath),
		'--root',
		root,
		'--input-file',
		path.relative(root, pgx23andmePath),
		'--detect-sex',
		'--output-dir',
		pgxOutputDir,
		'--analysis-max-duration-ms',
		'30000',
	])
	assertPgxApoeReport(pgxOutputDir)
} else {
	console.warn('Skipping PGx-1 23andMe APOE report parity; fixture is not present.')
}

console.log('bioscript CLI/WASM parity passed')
