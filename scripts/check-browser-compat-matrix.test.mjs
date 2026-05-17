import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, test } from 'node:test'

const root = path.resolve(import.meta.dirname, '..')
const checker = path.join(root, 'scripts/check-browser-compat-matrix.mjs')
const tempDirs = []

afterEach(() => {
	for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { force: true, recursive: true })
})

test('uses completion remote_targets as the required provider target set', () => {
	const fixture = createFixture()

	const result = runChecker(fixture)
	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.match(result.stdout, /Browser compatibility remote matrix OK \(1 targets\)/)
})

test('rejects endpoint templates that omit a completion remote target', () => {
	const fixture = createFixture({ endpoints: {} })

	const result = runChecker(fixture)
	assert.equal(result.status, 1)
	assert.match(result.stderr, /endpoint template missing android-chrome-latest/)
})

test('rejects provider capability templates that omit a completion remote target', () => {
	const fixture = createFixture({ capabilities: providerCapabilities({ includeTarget: false }) })

	const result = runChecker(fixture)
	assert.equal(result.status, 1)
	assert.match(result.stderr, /provider capability template browserstack\.android-chrome-latest must be an object/)
	assert.match(result.stderr, /provider capability template lambdatest\.android-chrome-latest must be an object/)
})

test('rejects provider capability templates that mismatch matrix device metadata', () => {
	const capabilities = providerCapabilities()
	capabilities.browserstack['android-chrome-latest'].deviceName = 'Google Pixel 8'
	capabilities.lambdatest['android-chrome-latest'].platformVersion = '14'
	const fixture = createFixture({ capabilities })

	const result = runChecker(fixture)
	assert.equal(result.status, 1)
	assert.match(result.stderr, /provider capability template browserstack\.android-chrome-latest device does not match target device Google Pixel 9/)
	assert.match(result.stderr, /provider capability template lambdatest\.android-chrome-latest OS version does not match target OS version 15\.0/)
})

function createFixture({ endpoints = endpointTemplate(), capabilities = providerCapabilities() } = {}) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'biovault-browser-compat-matrix-'))
	tempDirs.push(dir)
	const matrixFile = path.join(dir, 'remote-matrix.yaml')
	const endpointsFile = path.join(dir, 'endpoints.json')
	const capabilitiesFile = path.join(dir, 'capabilities.json')
	const completionFile = path.join(dir, 'completion.yaml')
	const todoFile = path.join(dir, 'TODO.md')
	fs.writeFileSync(matrixFile, remoteMatrixYaml())
	fs.writeFileSync(endpointsFile, `${JSON.stringify(endpoints, null, 2)}\n`)
	fs.writeFileSync(capabilitiesFile, `${JSON.stringify(capabilities, null, 2)}\n`)
	fs.writeFileSync(completionFile, completionYaml(todoFile))
	fs.writeFileSync(todoFile, '# TODO\n')
	return { matrixFile, endpointsFile, capabilitiesFile, completionFile }
}

function runChecker({ matrixFile, endpointsFile, capabilitiesFile, completionFile }) {
	return spawnSync(process.execPath, [checker], {
		cwd: root,
		encoding: 'utf8',
		env: {
			...process.env,
			WEB_COMPAT_REMOTE_MATRIX_FILE: matrixFile,
			WEB_COMPAT_REMOTE_ENDPOINTS_EXAMPLE_FILE: endpointsFile,
			WEB_COMPAT_PROVIDER_CAPABILITIES_EXAMPLE_FILE: capabilitiesFile,
			WEB_COMPAT_COMPLETION_FILE: completionFile,
		},
	})
}

function remoteMatrixYaml() {
	return [
		'targets:',
		'  - id: android-chrome-latest',
		'    platform: android',
		'    browser: chrome',
		'    version: latest',
		'    device_name: Google Pixel 9',
		'    os_version: "15.0"',
		'    project: chromium',
		'    required: true',
		'',
	].join('\n')
}

function completionYaml(todoFile) {
	return [
		'local_projects:',
		'  - chromium',
		'local_targets:',
		'  - android-local',
		'remote_targets:',
		'  - android-chrome-latest',
		'minimum_brackets:',
		'  - chromium',
		'policy_families:',
		'  - chromium',
		'todo_file: ' + todoFile,
		'',
	].join('\n')
}

function endpointTemplate() {
	return {
		'android-chrome-latest': {
			wsEndpoint: 'wss://provider.example/playwright?target=android-chrome-latest',
		},
	}
}

function providerCapabilities({ includeTarget = true } = {}) {
	const targets = includeTarget ? {
		'android-chrome-latest': {
			browser: 'chrome',
			browser_version: 'latest',
			deviceName: 'Google Pixel 9',
			osVersion: '15.0',
			sessionName: 'android-chrome-latest',
		},
	} : {}
	const lambdaTargets = includeTarget ? {
		'android-chrome-latest': {
			browserName: 'Chrome',
			browserVersion: 'latest',
			platformName: 'Android',
			deviceName: 'Pixel 9',
			platformVersion: '15.0',
			name: 'android-chrome-latest',
		},
	} : {}
	return {
		browserstack: targets,
		lambdatest: lambdaTargets,
	}
}
