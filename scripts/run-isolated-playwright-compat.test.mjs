import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, test } from 'node:test'

const root = path.resolve(import.meta.dirname, '..')
const runner = path.join(root, 'scripts/run-isolated-playwright-compat.mjs')
const tempDirs = []

afterEach(() => {
	for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { force: true, recursive: true })
})

test('passes WEB_COMPAT_OUTPUT_DIR through to the isolated Playwright process', () => {
	const binDir = tempDir()
	const outputDir = tempDir()
	const captureFile = path.join(tempDir(), 'isolated-env.txt')
	const fakeNpm = path.join(binDir, 'npm')
	fs.writeFileSync(fakeNpm, [
		'#!/usr/bin/env bash',
		'prefix=""',
		'while [ "$#" -gt 0 ]; do',
		'  if [ "$1" = "--prefix" ]; then',
		'    prefix="$2"',
		'    shift 2',
		'  else',
		'    shift',
		'  fi',
		'done',
		'mkdir -p "$prefix/node_modules/.bin"',
		'cat > "$prefix/node_modules/.bin/playwright" <<EOF',
		'#!/usr/bin/env bash',
		'echo "WEB_COMPAT_OUTPUT_DIR=$WEB_COMPAT_OUTPUT_DIR" > "$ISOLATED_ENV_CAPTURE"',
		'echo "PW_BROWSER_PROJECTS=$PW_BROWSER_PROJECTS" >> "$ISOLATED_ENV_CAPTURE"',
		'exit 0',
		'EOF',
		'chmod +x "$prefix/node_modules/.bin/playwright"',
		'exit 0',
		'',
	].join('\n'))
	fs.chmodSync(fakeNpm, 0o755)

	const result = spawnSync(process.execPath, [runner], {
		cwd: root,
		encoding: 'utf8',
		env: {
			...process.env,
			PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
			WEB_URL: 'http://localhost:8081',
			WEB_COMPAT_OUTPUT_DIR: outputDir,
			PW_BROWSER_PROJECTS: 'firefox',
			PW_ISOLATED_RUNNER_VERSION: '1.22.0',
			ISOLATED_ENV_CAPTURE: captureFile,
		},
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	const captured = fs.readFileSync(captureFile, 'utf8')
	assert.match(captured, new RegExp(`^WEB_COMPAT_OUTPUT_DIR=${escapeRegex(outputDir)}$`, 'm'))
	assert.match(captured, /^PW_BROWSER_PROJECTS=firefox$/m)
})

function tempDir() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'biovault-isolated-pw-'))
	tempDirs.push(dir)
	return dir
}

function escapeRegex(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
