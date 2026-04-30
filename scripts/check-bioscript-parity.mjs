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
const requireWasm = process.env.BIOSCRIPT_REQUIRE_WASM_PARITY === '1'

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
	if (error.status === 2 && !requireWasm) {
		console.warn('Skipping WASM parity because wasm-pack is not available. Set BIOSCRIPT_REQUIRE_WASM_PARITY=1 to fail instead.')
		process.exit(0)
	}
	throw error
}
assertObservationGenotypes(textLookup, {
	rs73885319: 'AA',
	rs60910145: 'TT',
	rs71785313: 'II',
})

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

console.log('==> WASM inspect parity')
const inspection = parseJsonOutput(run('bioscript wasm inspect', 'node', [
	wasmRunner,
	'inspect',
	inputPath,
], {
	env: { ...process.env, RUN_BIOSCRIPT_WASM_NO_BUILD: '1' },
}))
assertEqual(inspection.detectedKind, 'genotype_text', 'inspect detectedKind')

console.log('bioscript CLI/WASM parity passed')
