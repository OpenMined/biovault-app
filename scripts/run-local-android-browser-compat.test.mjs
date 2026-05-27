import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach } from 'node:test'
import { test } from 'node:test'

const root = path.resolve(import.meta.dirname, '..')
const runner = path.join(root, 'scripts/run-local-android-browser-compat.mjs')
const tempDirs = []

afterEach(() => {
	for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { force: true, recursive: true })
})

test('dry run resolves Samsung Internet package target mapping', () => {
	const result = runAndroidDryRun({
		WEB_COMPAT_ANDROID_BROWSER: 'samsung-internet',
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	const config = JSON.parse(result.stdout)
	assert.equal(config.pkg, 'com.sec.android.app.sbrowser')
	assert.equal(config.remoteBrowser, 'samsung-internet')
	assert.equal(config.projectName, 'chromium')
	assert.equal(config.engine, 'chromium')
	assert.equal(config.targetId, 'android-samsung-internet-latest')
	assert.equal(config.versionLabel, 'latest')
})

test('dry run resolves WEB_COMPAT_OUTPUT_DIR for local Android artifacts', () => {
	const outputDir = tempDir()
	const result = runAndroidDryRun({
		WEB_COMPAT_OUTPUT_DIR: outputDir,
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	const config = JSON.parse(result.stdout)
	assert.equal(config.outputDir, outputDir)
})

test('dry run rejects Firefox Android because the local launcher is Chromium-based', () => {
	const result = runAndroidDryRun({
		WEB_COMPAT_ANDROID_BROWSER: 'firefox',
	})

	assert.equal(result.status, 2)
	assert.match(result.stderr, /cannot produce Firefox Android evidence/)
})

test('dry run rejects unknown Android target ids', () => {
	const result = runAndroidDryRun({
		WEB_COMPAT_ANDROID_BROWSER: 'chrome',
		WEB_COMPAT_ANDROID_TARGET_ID: 'not-real',
	})

	assert.equal(result.status, 2)
	assert.match(result.stderr, /Unknown Android compatibility target id/)
})

test('dry run rejects browser and Android target mismatches', () => {
	const result = runAndroidDryRun({
		WEB_COMPAT_ANDROID_BROWSER: 'chrome',
		WEB_COMPAT_ANDROID_TARGET_ID: 'android-samsung-internet-latest',
	})

	assert.equal(result.status, 2)
	assert.match(result.stderr, /cannot satisfy target android-samsung-internet-latest/)
})

function runAndroidDryRun(env) {
	return spawnSync(process.execPath, [runner], {
		cwd: root,
		encoding: 'utf8',
		env: {
			...process.env,
			...env,
			WEB_COMPAT_ANDROID_DRY_RUN: '1',
		},
	})
}

function tempDir() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'biovault-android-compat-'))
	tempDirs.push(dir)
	return dir
}
