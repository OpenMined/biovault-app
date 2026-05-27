import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, test } from 'node:test'

const root = path.resolve(import.meta.dirname, '..')
const updater = path.join(root, 'scripts/update-browser-support.mjs')
const tempDirs = []

afterEach(() => {
	for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { force: true, recursive: true })
})

test('counts historical target rows while ignoring local evidence for provider-only targets', () => {
	const policy = updatePolicy([
		row({ remoteTargetId: 'chromium-cache-96', browserName: 'chromium', browserVersion: '96.0.0.0' }),
		row({ remoteTargetId: 'chromium-cache-94', browserName: 'chromium', browserVersion: '94.0.0.0', status: 'failed' }),
		row({
			remoteTargetId: 'android-samsung-internet-latest',
			compatibilitySource: 'android-local',
			browserName: 'samsung',
			browserVersion: '26.0',
			userAgent: 'Mozilla/5.0 (Linux; Android 14) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
		}),
	])

	assert.equal(policy.chromium.minimumKnownGood, 96)
	assert.equal(policy.chromium.latestKnownGood, 96)
	assert.deepEqual(policy.chromium.knownFailing, [94])
	assert.equal(policy.samsungInternet.minimumKnownGood, null)
	assert.equal(policy.samsungInternet.latestKnownGood, null)
})

test('uses remote-provider evidence for provider-only browser families', () => {
	const policy = updatePolicy([
		row({
			remoteTargetId: 'android-samsung-internet-latest',
			compatibilitySource: 'remote-provider',
			projectName: 'chromium',
			browserName: 'samsung',
			browserVersion: '26.0',
			remotePlatform: 'android',
			remoteBrowser: 'samsung-internet',
			remoteBrowserVersionLabel: 'latest',
			userAgent: 'Mozilla/5.0 (Linux; Android 14) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
		}),
	])

	assert.equal(policy.samsungInternet.minimumKnownGood, 26)
	assert.equal(policy.samsungInternet.latestKnownGood, 26)
})

test('ignores rows with missing or unsupported evidence source', () => {
	const policy = updatePolicy([
		row({ compatibilitySource: null, browserName: 'chromium', browserVersion: '80.0.0.0' }),
		row({ compatibilitySource: 'provider-ish', browserName: 'firefox', browserVersion: '88.0' }),
		row({ compatibilitySource: 'local-playwright', browserName: 'chromium', browserVersion: '96.0.0.0' }),
	])

	assert.equal(policy.chromium.minimumKnownGood, 96)
	assert.equal(policy.chromium.latestKnownGood, 96)
	assert.equal(policy.firefox.minimumKnownGood, null)
})

test('ignores passed rows without complete compatibility evidence', () => {
	const policy = updatePolicy([
		row({
			browserName: 'chromium',
			browserVersion: '96.0.0.0',
			capabilities: { ...capabilityProbe(), moduleWorker: false },
		}),
		row({
			browserName: 'firefox',
			browserVersion: '127.0',
			consoleErrors: ['pageerror: RuntimeError: unreachable'],
		}),
		row({
			browserName: 'webkit',
			browserVersion: '17.4',
			deviceProfile: '',
		}),
		row({
			browserName: 'safari',
			browserVersion: '18.0',
			artifactNames: ['observations.tsv', 'analysis.jsonl', 'index.html'],
		}),
	])

	assert.equal(policy.chromium.minimumKnownGood, null)
	assert.equal(policy.firefox.minimumKnownGood, null)
	assert.equal(policy.safari.minimumKnownGood, null)
})

test('ignores remote-provider rows with mismatched target metadata', () => {
	const policy = updatePolicy([
		row({
			remoteTargetId: 'android-samsung-internet-latest',
			compatibilitySource: 'remote-provider',
			projectName: 'chromium',
			browserName: 'samsung',
			browserVersion: '26.0',
			remotePlatform: 'android',
			remoteBrowser: 'chrome',
			remoteBrowserVersionLabel: 'latest',
			userAgent: 'Mozilla/5.0 (Linux; Android 14) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
		}),
	])

	assert.equal(policy.samsungInternet.minimumKnownGood, null)
	assert.equal(policy.samsungInternet.latestKnownGood, null)
})

test('ignores remote-provider rows whose browserName only names the Playwright engine', () => {
	const policy = updatePolicy([
		row({
			remoteTargetId: 'ios-chrome-latest',
			compatibilitySource: 'remote-provider',
			projectName: 'webkit',
			browserName: 'webkit',
			browserVersion: '148.0',
			remotePlatform: 'ios',
			remoteBrowser: 'chrome',
			remoteBrowserVersionLabel: 'latest',
			userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/148.0.0.0 Mobile/15E148 Safari/604.1',
		}),
	])

	assert.equal(policy.chromeIos.minimumKnownGood, null)
	assert.equal(policy.chromeIos.latestKnownGood, null)
})

test('clears stale provider-only family policy when current provider evidence is invalid', () => {
	const policy = updatePolicy([
		row({
			remoteTargetId: 'android-samsung-internet-latest',
			compatibilitySource: 'remote-provider',
			projectName: 'chromium',
			browserName: 'samsung',
			browserVersion: '26.0',
			remotePlatform: 'android',
			remoteBrowser: 'chrome',
			remoteBrowserVersionLabel: 'latest',
			userAgent: 'Mozilla/5.0 (Linux; Android 14) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
		}),
	], {
		samsungInternet: {
			minimumKnownGood: 26,
			latestKnownGood: 26,
			knownFailing: [],
		},
	})

	assert.equal(policy.samsungInternet.minimumKnownGood, null)
	assert.equal(policy.samsungInternet.latestKnownGood, null)
})

test('preserves stale provider-only family policy when the current run has no provider rows for that family', () => {
	const policy = updatePolicy([
		row({ remoteTargetId: 'chromium-cache-96', browserName: 'chromium', browserVersion: '96.0.0.0' }),
	], {
		samsungInternet: {
			minimumKnownGood: 26,
			latestKnownGood: 26,
			knownFailing: [],
		},
	})

	assert.equal(policy.samsungInternet.minimumKnownGood, 26)
	assert.equal(policy.samsungInternet.latestKnownGood, 26)
})

test('uses an overridden remote matrix for provider-only family policy generation', () => {
	const matrixFile = writeRemoteMatrix({
		id: 'android-custom-samsung',
		platform: 'android',
		browser: 'samsung-internet',
		version: 'latest',
		project: 'chromium',
		required: true,
	})
	const policy = updatePolicy([
		row({
			remoteTargetId: 'android-custom-samsung',
			compatibilitySource: 'remote-provider',
			projectName: 'chromium',
			browserName: 'samsung',
			browserVersion: '26.0',
			remotePlatform: 'android',
			remoteBrowser: 'samsung-internet',
			remoteBrowserVersionLabel: 'latest',
			userAgent: 'Mozilla/5.0 (Linux; Android 14) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
		}),
	], null, { WEB_COMPAT_REMOTE_MATRIX_FILE: matrixFile })

	assert.equal(policy.samsungInternet.minimumKnownGood, 26)
	assert.equal(policy.samsungInternet.latestKnownGood, 26)
})

function updatePolicy(rows, existingPolicy = null, env = {}) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'biovault-browser-support-update-'))
	tempDirs.push(dir)
	const resultsFile = path.join(dir, 'results.json')
	const policyFile = path.join(dir, 'browser-support.generated.ts')
	fs.writeFileSync(resultsFile, JSON.stringify(rows, null, 2))
	if (existingPolicy) fs.writeFileSync(policyFile, renderPolicy(existingPolicy))
	const result = spawnSync(process.execPath, [updater], {
		cwd: root,
		encoding: 'utf8',
		env: {
			...process.env,
			WEB_COMPAT_RESULTS_FILE: resultsFile,
			WEB_COMPAT_POLICY_FILE: policyFile,
			...env,
		},
	})
	assert.equal(result.status, 0, result.stderr || result.stdout)
	return parseGeneratedPolicy(fs.readFileSync(policyFile, 'utf8'))
}

function row({
	remoteTargetId,
	compatibilitySource = 'local-playwright',
	projectName,
	browserName,
	browserVersion,
	remotePlatform,
	remoteBrowser,
	remoteBrowserVersionLabel,
	remoteDeviceName = remoteTargetDevice(remoteTargetId),
	remoteOsVersion = remoteTargetOsVersion(remoteTargetId),
	status = 'passed',
	userAgent,
	capabilities,
	consoleErrors = [],
	artifactNames = status === 'passed' ? ['observations.tsv', 'analysis.jsonl', 'reports.jsonl', 'index.html'] : undefined,
	deviceProfile,
}) {
	return {
		...baseMetadata(remoteTargetId ?? browserName, browserName, deviceProfile),
		remoteTargetId,
		compatibilitySource,
		projectName: projectName ?? browserName,
		browserName,
		browserVersion,
		remotePlatform,
		remoteBrowser,
		remoteBrowserVersionLabel,
		remoteDeviceName,
		remoteOsVersion,
		status,
		reportRunStatus: status,
		artifactValidationStatus: status,
		artifactNames,
		failureMessage: status === 'failed' ? 'expected fixture failure' : undefined,
		capabilities: capabilities ?? capabilityProbe(userAgent ? { userAgent } : {}),
		consoleErrors,
	}
}

function remoteTargetDevice(targetId) {
	return {
		'android-samsung-internet-latest': 'Samsung Galaxy S24',
		'android-custom-samsung': 'Samsung Galaxy S24',
	}[targetId]
}

function remoteTargetOsVersion(targetId) {
	return {
		'android-samsung-internet-latest': '14.0',
		'android-custom-samsung': '14.0',
	}[targetId]
}

function baseMetadata(id, engine, deviceProfile) {
	return {
		id: `${id}-23andme-v5-hu50B3F5-1`,
		startedAt: '2026-05-17T00:00:00.000Z',
		finishedAt: '2026-05-17T00:00:01.000Z',
		durationMs: 1000,
		sampleId: '23andme-v5-hu50B3F5',
		engine,
		os: {
			platform: 'linux',
			release: '6.19.13-arch1-1',
			arch: 'x64',
		},
		deviceProfile: deviceProfile ?? id,
	}
}

function capabilityProbe(overrides = {}) {
	return {
		userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
		platform: 'Linux x86_64',
		language: 'en-US',
		secureContext: true,
		webAssembly: true,
		webAssemblyValidate: true,
		worker: true,
		moduleWorker: true,
		blob: true,
		file: true,
		fileReader: true,
		fileReaderSyncInWorker: true,
		fetch: true,
		readableStream: true,
		indexedDB: true,
		localStorage: true,
		cryptoSubtle: true,
		failures: [],
		...overrides,
	}
}

function parseGeneratedPolicy(text) {
	const match = text.match(/export const GENERATED_BROWSER_SUPPORT_POLICY = ([\s\S]*?) as const/)
	assert.ok(match?.[1], 'generated policy export exists')
	const json = match[1]
		.replace(/([,{]\s*)([a-zA-Z_][a-zA-Z0-9_]*):/g, '$1"$2":')
		.replace(/'/g, '"')
	return JSON.parse(json)
}

function renderPolicy(overrides) {
	const value = {
		chromium: emptyPolicy(),
		firefox: emptyPolicy(),
		safari: emptyPolicy(),
		samsungInternet: emptyPolicy(),
		chromeIos: emptyPolicy(),
		firefoxIos: emptyPolicy(),
		unknown: emptyPolicy(),
		...overrides,
	}
	return `export const GENERATED_BROWSER_SUPPORT_POLICY = ${JSON.stringify(value, null, '\t')} as const\n`
}

function emptyPolicy() {
	return {
		minimumKnownGood: null,
		latestKnownGood: null,
		knownFailing: [],
	}
}

function writeRemoteMatrix(target) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'biovault-browser-support-matrix-'))
	tempDirs.push(dir)
	const file = path.join(dir, 'remote-matrix.yaml')
	fs.writeFileSync(file, [
		'targets:',
		`  - id: ${target.id}`,
		`    platform: ${target.platform}`,
		`    browser: ${target.browser}`,
		`    version: ${target.version}`,
		`    project: ${target.project}`,
		`    required: ${target.required}`,
		'',
	].join('\n'))
	return file
}
