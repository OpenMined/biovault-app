#!/usr/bin/env node
// Guardrail: the monty WASM + worker files live in
//   modules/expo-bioscript/web-runtime/monty-wasm32-wasi/
// but the Rust/JS source lives in the monty submodule. The artifacts are not
// tracked in monty (they're build outputs) and they're not regenerated when
// you bump the submodule. Without this check, stale artifacts silently run
// against fresh source.
//
// We hash every tracked file under bioscript/monty/crates/{monty,monty-js}
// and compare against a marker written by `build-monty-web.sh`. Mismatch =>
// fail loudly and tell the user to run `bun run monty-web`.

import { createHash } from 'node:crypto'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APP_ROOT = resolve(__dirname, '..')
const MONTY_ROOT = join(APP_ROOT, 'bioscript/monty')
const MARKER = join(
	APP_ROOT,
	'modules/expo-bioscript/web-runtime/monty-wasm32-wasi/.monty-source.sha256',
)
const WASM = join(
	APP_ROOT,
	'modules/expo-bioscript/web-runtime/monty-wasm32-wasi/monty.wasm32-wasi.wasm',
)

// Paths within the submodule whose changes should invalidate the compiled
// artifacts. Trimmed to actual source (skip docs, tests, CI config).
const TRACKED_PATHS = ['crates/monty', 'crates/monty-js', 'Cargo.lock', 'Cargo.toml']

function red(s) {
	return process.stdout.isTTY ? `\x1b[31m${s}\x1b[0m` : s
}
function yellow(s) {
	return process.stdout.isTTY ? `\x1b[33m${s}\x1b[0m` : s
}
function bold(s) {
	return process.stdout.isTTY ? `\x1b[1m${s}\x1b[0m` : s
}

function listTrackedFiles() {
	if (!existsSync(MONTY_ROOT)) {
		return null
	}
	try {
		const out = execSync(`git -C ${JSON.stringify(MONTY_ROOT)} ls-files ${TRACKED_PATHS.join(' ')}`, {
			encoding: 'utf8',
		})
		return out
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean)
			.map((rel) => join(MONTY_ROOT, rel))
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
		hash.update(f.slice(MONTY_ROOT.length + 1))
		hash.update('\0')
		hash.update(readFileSync(f))
		hash.update('\0')
	}
	return hash.digest('hex')
}

function fail(lines) {
	console.error('')
	console.error(red(bold('✗ monty artifacts are stale')))
	for (const line of lines) console.error(line)
	console.error('')
	console.error(yellow('  Fix: bun run monty-web'))
	console.error('')
	process.exit(1)
}

function main() {
	// Mode: `--write` records the current source hash (called by build-monty-web.sh).
	const write = process.argv.includes('--write')
	const sourceHash = computeSourceHash()
	if (!sourceHash) {
		// Submodule missing — don't block; `git submodule update --init --recursive`
		// is a separate prereq.
		console.error(
			yellow('[monty-check] submodule bioscript/monty not present; skipping staleness check'),
		)
		return
	}

	if (write) {
		writeFileSync(MARKER, `${sourceHash}\n`, 'utf8')
		console.log(`[monty-check] wrote source hash marker → ${MARKER}`)
		return
	}

	if (!existsSync(WASM)) {
		fail([
			`  ${WASM}`,
			'  is missing — no compiled monty WASM to run against.',
		])
	}
	if (!existsSync(MARKER)) {
		fail([
			'  No source-hash marker next to the WASM.',
			'  The checked-in artifacts were built before this guardrail was added,',
			'  so we can\'t prove they match the current monty source.',
		])
	}
	const recordedHash = readFileSync(MARKER, 'utf8').trim()
	if (recordedHash !== sourceHash) {
		fail([
			'  The monty submodule source has changed since the WASM was last built.',
			`  Recorded: ${recordedHash.slice(0, 16)}…`,
			`  Current:  ${sourceHash.slice(0, 16)}…`,
		])
	}
	console.log('[monty-check] artifacts match submodule source ✓')
}

main()
