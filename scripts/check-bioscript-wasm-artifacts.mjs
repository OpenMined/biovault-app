#!/usr/bin/env node
// Guardrail + auto-regen: the bioscript WASM bundle lives in
//   modules/expo-bioscript/src/bioscript-wasm/      (main thread)
//   modules/expo-bioscript/web-runtime/bioscript-wasm/ (web worker)
// but the source is the bioscript submodule's Rust crates. The artifacts are
// NOT tracked in git (build outputs, ~10 MB each — they bloated clones). This
// mirrors the monty-wasm convention (see check-monty-artifacts.mjs).
//
// We hash the tracked Rust sources under bioscript/rust and compare against a
// marker written by build-bioscript-wasm.sh. Modes:
//   (default) ensure: rebuild if missing/stale, then continue
//   --check          : verify only; exit 1 if stale (no build)
//   --write          : record the current source hash (called by the builder)

import { createHash } from 'node:crypto'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APP_ROOT = resolve(__dirname, '..')
const RUST_ROOT = join(APP_ROOT, 'bioscript/rust')
const SRC_DIR = join(APP_ROOT, 'modules/expo-bioscript/src/bioscript-wasm')
const WORKER_DIR = join(APP_ROOT, 'modules/expo-bioscript/web-runtime/bioscript-wasm')
const MARKER = join(SRC_DIR, '.bioscript-wasm-source.sha256')
const BUILD = join(APP_ROOT, 'modules/expo-bioscript/scripts/build-bioscript-wasm.sh')
const ARTIFACTS = [
	join(SRC_DIR, 'bioscript_wasm.js'),
	join(SRC_DIR, 'bioscript_wasm.d.ts'),
	join(SRC_DIR, 'bioscript_wasm_bg.wasm'),
	join(WORKER_DIR, 'bioscript_wasm.mjs'),
	join(WORKER_DIR, 'bioscript_wasm_bg.wasm'),
]
// Crates whose changes affect the compiled wasm. Hash manifests + src only
// (skip tests/benches/docs so unrelated edits don't force rebuilds).
const CRATES = [
	'Cargo.toml',
	'Cargo.lock',
	'bioscript-wasm',
	'bioscript-formats',
	'bioscript-core',
	'bioscript-schema',
	'bioscript-reporting',
	'bioscript-runtime',
]

const tty = process.stdout.isTTY
const red = (s) => (tty ? `\x1b[31m${s}\x1b[0m` : s)
const yellow = (s) => (tty ? `\x1b[33m${s}\x1b[0m` : s)
const bold = (s) => (tty ? `\x1b[1m${s}\x1b[0m` : s)

function listTrackedFiles() {
	if (!existsSync(RUST_ROOT)) return null
	try {
		const out = execSync(
			`git -C ${JSON.stringify(RUST_ROOT)} ls-files ${CRATES.join(' ')}`,
			{ encoding: 'utf8' },
		)
		return out
			.split('\n')
			.map((l) => l.trim())
			.filter(Boolean)
			.filter(
				(rel) =>
					rel === 'Cargo.toml' ||
					rel === 'Cargo.lock' ||
					rel.includes('/src/') ||
					rel.endsWith('/Cargo.toml'),
			)
			.filter((rel) => !rel.includes('/tests/') && !rel.includes('/benches/'))
			.map((rel) => join(RUST_ROOT, rel))
	} catch {
		return null
	}
}

function computeSourceHash() {
	const files = listTrackedFiles()
	if (!files) return null
	files.sort()
	const hash = createHash('sha256')
	for (const f of files) {
		if (!existsSync(f)) continue
		hash.update(f.slice(RUST_ROOT.length + 1))
		hash.update('\0')
		hash.update(readFileSync(f))
		hash.update('\0')
	}
	return hash.digest('hex')
}

function artifactsPresent() {
	return ARTIFACTS.every((f) => existsSync(f))
}

function markerMatches(sourceHash) {
	if (!existsSync(MARKER)) return false
	return readFileSync(MARKER, 'utf8').trim() === sourceHash
}

function runBuild() {
	console.log(yellow('[bioscript-wasm] artifacts missing/stale — building…'))
	execSync(`bash ${JSON.stringify(BUILD)}`, { stdio: 'inherit', cwd: APP_ROOT })
}

function main() {
	const mode = process.argv.includes('--write')
		? 'write'
		: process.argv.includes('--check')
			? 'check'
			: 'ensure'

	const sourceHash = computeSourceHash()
	if (!sourceHash) {
		console.error(
			yellow('[bioscript-wasm] submodule bioscript/rust not present; skipping'),
		)
		return
	}

	if (mode === 'write') {
		writeFileSync(MARKER, `${sourceHash}\n`, 'utf8')
		console.log(`[bioscript-wasm] wrote source-hash marker → ${MARKER}`)
		return
	}

	const fresh = artifactsPresent() && markerMatches(sourceHash)
	if (fresh) {
		console.log('[bioscript-wasm] artifacts match bioscript source ✓')
		return
	}

	if (mode === 'check') {
		console.error('')
		console.error(red(bold('✗ bioscript-wasm artifacts are missing or stale')))
		console.error(yellow('  Fix: bash modules/expo-bioscript/scripts/build-bioscript-wasm.sh'))
		console.error('')
		process.exit(1)
	}

	// ensure: build now (the builder records the marker via --write).
	runBuild()
	if (!artifactsPresent()) {
		console.error(red('[bioscript-wasm] build did not produce expected artifacts'))
		process.exit(1)
	}
}

main()
