import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, test } from 'node:test'

const root = path.resolve(import.meta.dirname, '..')
const wrapper = path.join(root, 'test-web-compat.sh')
const tempDirs = []

afterEach(() => {
	for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { force: true, recursive: true })
})

test('local compatibility wrapper cleans the configured output directory', () => {
	const outputDir = tempDir()
	const sentinel = path.join(outputDir, 'stale.json')
	fs.writeFileSync(sentinel, '{}\n')

	const result = runWrapper({
		WEB_COMPAT_OUTPUT_DIR: outputDir,
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.match(result.stdout, /precheck passed/)
	assert.equal(fs.existsSync(sentinel), false)
	assert.equal(fs.existsSync(outputDir), false)
})

test('local compatibility wrapper preserves output directory in append mode', () => {
	const outputDir = tempDir()
	const sentinel = path.join(outputDir, 'stale.json')
	fs.writeFileSync(sentinel, '{}\n')

	const result = runWrapper({
		WEB_COMPAT_OUTPUT_DIR: outputDir,
		WEB_COMPAT_APPEND_RESULTS: '1',
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.equal(fs.readFileSync(sentinel, 'utf8'), '{}\n')
})

function runWrapper(env) {
	return spawnSync('bash', [wrapper], {
		cwd: root,
		encoding: 'utf8',
		env: {
			...process.env,
			WEB_COMPAT_PRECHECK_ONLY: '1',
			WEB_COMPAT_OUTPUT_DIR: '',
			WEB_COMPAT_APPEND_RESULTS: '',
			...env,
		},
	})
}

function tempDir() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'biovault-web-compat-wrapper-'))
	tempDirs.push(dir)
	return dir
}
