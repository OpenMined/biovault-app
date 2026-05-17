import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, test } from 'node:test'

const root = path.resolve(import.meta.dirname, '..')
const merger = path.join(root, 'scripts/merge-browser-compat-results.mjs')
const tempDirs = []

afterEach(() => {
	for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { force: true, recursive: true })
})

test('normalizes legacy local evidence source without promoting provider targets', () => {
	const inputDir = tempDir()
	const outputDir = tempDir()
	fs.writeFileSync(path.join(inputDir, 'results.json'), JSON.stringify([
		{ id: 'local', projectName: 'chromium', browserName: 'chromium', browserVersion: '148.0.0.0' },
		{ id: 'android-local', projectName: 'android-local', remoteTargetId: 'android-local', browserName: 'android-chrome', browserVersion: '133.0.0.0' },
		{ id: 'provider', projectName: 'chromium', remoteTargetId: 'android-chrome-latest', browserName: 'chrome', browserVersion: '148.0.0.0' },
	], null, 2))

	const result = spawnSync(process.execPath, [merger, inputDir], {
		cwd: root,
		encoding: 'utf8',
		env: {
			...process.env,
			WEB_COMPAT_MERGE_OUTPUT_DIR: outputDir,
		},
	})
	assert.equal(result.status, 0, result.stderr || result.stdout)

	const rows = JSON.parse(fs.readFileSync(path.join(outputDir, 'results.json'), 'utf8'))
	assert.equal(rows.find((row) => row.id === 'local').compatibilitySource, 'local-playwright')
	assert.equal(rows.find((row) => row.id === 'android-local').compatibilitySource, 'android-local')
	assert.equal(rows.find((row) => row.id === 'provider').compatibilitySource, undefined)
})

test('keeps Markdown failure summaries compact and plain text', () => {
	const inputDir = tempDir()
	const outputDir = tempDir()
	fs.writeFileSync(path.join(inputDir, 'results.json'), JSON.stringify([
		{
			id: 'failed',
			projectName: 'chromium',
			browserName: 'chromium',
			browserVersion: '94.0.0.0',
			status: 'failed',
			failureMessage: `Error: \x1B[31m${'very long message '.repeat(40)}\x1B[39m`,
		},
	], null, 2))

	const result = spawnSync(process.execPath, [merger, inputDir], {
		cwd: root,
		encoding: 'utf8',
		env: {
			...process.env,
			WEB_COMPAT_MERGE_OUTPUT_DIR: outputDir,
		},
	})
	assert.equal(result.status, 0, result.stderr || result.stdout)

	const summary = fs.readFileSync(path.join(outputDir, 'results.md'), 'utf8')
	assert.match(summary, /\| Status \| Target \| Source \| Project \| Browser \| Version \| Device \| OS \|/)
	assert.doesNotMatch(summary, /\x1B\[/)
	assert.doesNotMatch(summary, /very long message (?:very long message ){25}/)
	assert.match(summary, /Error: very long message/)
	assert.match(summary, /\.\.\./)
})

test('recursively reads downloaded GitHub Actions artifact directories', () => {
	const inputDir = tempDir()
	const outputDir = tempDir()
	const artifactResultsDir = path.join(inputDir, 'web-compat-remote-artifacts', 'test-output', 'browser-compat')
	fs.mkdirSync(artifactResultsDir, { recursive: true })
	fs.writeFileSync(path.join(artifactResultsDir, 'results.json'), JSON.stringify([
		{
			id: 'android-chrome-latest',
			projectName: 'chromium',
			remoteTargetId: 'android-chrome-latest',
			browserName: 'chrome',
			browserVersion: '148.0.0.0',
			compatibilitySource: 'remote-provider',
		},
	], null, 2))

	const result = spawnSync(process.execPath, [merger, inputDir], {
		cwd: root,
		encoding: 'utf8',
		env: {
			...process.env,
			WEB_COMPAT_MERGE_OUTPUT_DIR: outputDir,
		},
	})
	assert.equal(result.status, 0, result.stderr || result.stdout)

	const rows = JSON.parse(fs.readFileSync(path.join(outputDir, 'results.json'), 'utf8'))
	assert.equal(rows.length, 1)
	assert.equal(rows[0].remoteTargetId, 'android-chrome-latest')
	assert.equal(rows[0].compatibilitySource, 'remote-provider')
})

test('deduplicates reruns by compatibility target id instead of browser version', () => {
	const inputDir = tempDir()
	const outputDir = tempDir()
	fs.writeFileSync(path.join(inputDir, 'results.json'), JSON.stringify([
		{
			id: 'old-provider-run',
			startedAt: '2026-05-17T00:00:00.000Z',
			projectName: 'chromium',
			remoteTargetId: 'android-chrome-latest',
			browserName: 'chrome',
			browserVersion: '147.0.0.0',
			compatibilitySource: 'remote-provider',
		},
		{
			id: 'new-provider-run',
			startedAt: '2026-05-17T01:00:00.000Z',
			projectName: 'chromium',
			remoteTargetId: 'android-chrome-latest',
			browserName: 'chrome',
			browserVersion: '148.0.0.0',
			compatibilitySource: 'remote-provider',
		},
	], null, 2))

	const result = spawnSync(process.execPath, [merger, inputDir], {
		cwd: root,
		encoding: 'utf8',
		env: {
			...process.env,
			WEB_COMPAT_MERGE_OUTPUT_DIR: outputDir,
		},
	})
	assert.equal(result.status, 0, result.stderr || result.stdout)

	const rows = JSON.parse(fs.readFileSync(path.join(outputDir, 'results.json'), 'utf8'))
	assert.equal(rows.length, 1)
	assert.equal(rows[0].id, 'new-provider-run')
	assert.equal(rows[0].browserVersion, '148.0.0.0')
})

test('fails clearly when artifact directories contain no result rows', () => {
	const inputDir = tempDir()
	const outputDir = tempDir()
	fs.mkdirSync(path.join(inputDir, 'web-compat-remote-artifacts', 'test-results'), { recursive: true })

	const result = spawnSync(process.execPath, [merger, inputDir], {
		cwd: root,
		encoding: 'utf8',
		env: {
			...process.env,
			WEB_COMPAT_MERGE_OUTPUT_DIR: outputDir,
		},
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /No browser compatibility result rows found/)
	assert.equal(fs.existsSync(path.join(outputDir, 'results.json')), false)
})

function tempDir() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'biovault-browser-compat-merge-'))
	tempDirs.push(dir)
	return dir
}
