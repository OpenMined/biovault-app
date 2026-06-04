#!/usr/bin/env node
// Guardrail + auto-regen: the monty WASM + worker files live in
//   modules/expo-bioscript/web-runtime/monty-wasm32-wasi/
// but the Rust/JS source lives in the monty submodule. The artifacts are not
// tracked in monty (they're build outputs) and they're not regenerated when
// you bump the submodule. Without this check, stale artifacts silently run
// against fresh source.
//
// We hash every tracked file under bioscript/monty/crates/{monty,monty-js}
// and compare against a marker written by `build-monty-web.sh`. Modes:
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
const MONTY_ROOT = join(APP_ROOT, 'bioscript/monty')
const MARKER = join(
	APP_ROOT,
	'modules/expo-bioscript/web-runtime/monty-wasm32-wasi/.monty-source.sha256',
)
const WASM = join(
	APP_ROOT,
	'modules/expo-bioscript/web-runtime/monty-wasm32-wasi/monty.wasm32-wasi.wasm',
)
const BUILD = join(APP_ROOT, 'modules/expo-bioscript/scripts/build-monty-web.sh')

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

function runBuild() {
	console.log(yellow('[monty-check] artifacts missing/stale — building…'))
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
		// Submodule missing — don't block; `git submodule update --init --recursive`
		// is a separate prereq.
		console.error(
			yellow('[monty-check] submodule bioscript/monty not present; skipping staleness check'),
		)
		return
	}

	if (mode === 'write') {
		writeFileSync(MARKER, `${sourceHash}\n`, 'utf8')
		console.log(`[monty-check] wrote source hash marker → ${MARKER}`)
		return
	}

	const missingWasm = !existsSync(WASM)
	const missingMarker = !existsSync(MARKER)
	const recordedHash = missingMarker ? '' : readFileSync(MARKER, 'utf8').trim()
	const stale = missingWasm || missingMarker || recordedHash !== sourceHash
	if (stale) {
		const lines = []
		if (missingWasm) {
			lines.push(`  ${WASM}`)
			lines.push('  is missing — no compiled monty WASM to run against.')
		} else if (missingMarker) {
			lines.push('  No source-hash marker next to the WASM.')
			lines.push('  The checked-in artifacts were built before this guardrail was added,')
			lines.push('  so we can\'t prove they match the current monty source.')
		} else {
			lines.push('  The monty submodule source has changed since the WASM was last built.')
			lines.push(`  Recorded: ${recordedHash.slice(0, 16)}…`)
			lines.push(`  Current:  ${sourceHash.slice(0, 16)}…`)
		}
		if (mode === 'check') {
			fail(lines)
		}
		runBuild()
		if (!existsSync(WASM)) {
			console.error(red('[monty-check] build did not produce expected WASM artifact'))
			process.exit(1)
		}
		return
	}
	console.log('[monty-check] artifacts match submodule source ✓')
}

main()
