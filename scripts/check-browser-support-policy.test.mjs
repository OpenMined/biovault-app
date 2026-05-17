import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, test } from 'node:test'

const root = path.resolve(import.meta.dirname, '..')
const checker = path.join(root, 'scripts/check-browser-support-policy.mjs')
const tempDirs = []

afterEach(() => {
	for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { force: true, recursive: true })
})

test('accepts rows with trusted evidence sources', () => {
	const result = runChecker([
		row({ projectName: 'chromium', browserName: 'chromium', browserVersion: '97.0.0.0', compatibilitySource: 'local-playwright' }),
		row({ projectName: 'android-local', remoteTargetId: 'android-local', browserName: 'android-chrome', browserVersion: '133.0.0.0', compatibilitySource: 'android-local' }),
	])

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.match(result.stdout, /Browser support policy is compatible/)
})

test('rejects missing or unsupported evidence sources', () => {
	const result = runChecker([
		row({ projectName: 'chromium', browserName: 'chromium', browserVersion: '96.0.0.0' }),
		row({ projectName: 'firefox', browserName: 'firefox', browserVersion: '127.0', compatibilitySource: 'provider-ish' }),
	])

	assert.equal(result.status, 1)
	assert.match(result.stderr, /chromium is missing compatibilitySource/)
	assert.match(result.stderr, /firefox has unsupported compatibilitySource: provider-ish/)
})

test('rejects provider target rows without remote-provider source', () => {
	const result = runChecker([
		row({
			projectName: 'chromium',
			remoteTargetId: 'android-samsung-internet-latest',
			browserName: 'samsung',
			browserVersion: '26.0',
			compatibilitySource: 'android-local',
			userAgent: 'Mozilla/5.0 (Linux; Android 14) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
		}),
	])

	assert.equal(result.status, 1)
	assert.match(result.stderr, /android-samsung-internet-latest has android-local evidence source but target is not android-local/)
})

test('rejects provider target rows with mismatched target metadata', () => {
	const result = runChecker([
		row({
			projectName: 'chromium',
			remoteTargetId: 'android-samsung-internet-latest',
			browserName: 'samsung',
			browserVersion: '26.0',
			compatibilitySource: 'remote-provider',
			remotePlatform: 'android',
			remoteBrowser: 'chrome',
			remoteBrowserVersionLabel: 'latest',
			userAgent: 'Mozilla/5.0 (Linux; Android 14) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
		}),
	])

	assert.equal(result.status, 1)
	assert.match(result.stderr, /android-samsung-internet-latest recorded browser chrome, expected samsung-internet/)
})

test('rejects provider target rows whose browserName only names the Playwright engine', () => {
	const result = runChecker([
		row({
			projectName: 'webkit',
			remoteTargetId: 'ios-firefox-latest',
			browserName: 'webkit',
			browserVersion: '150.0',
			compatibilitySource: 'remote-provider',
			remotePlatform: 'ios',
			remoteBrowser: 'firefox',
			remoteBrowserVersionLabel: 'latest',
			remoteDeviceName: 'iPhone 16',
			remoteOsVersion: '18',
			userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/150.0 Mobile/15E148 Safari/605.1.15',
		}),
	])

	assert.equal(result.status, 1)
	assert.match(result.stderr, /ios-firefox-latest recorded browserName webkit, expected firefox/)
})

test('rejects provider target rows without user-agent evidence', () => {
	const result = runChecker([
		row({
			projectName: 'chromium',
			remoteTargetId: 'android-samsung-internet-latest',
			browserName: 'samsung',
			browserVersion: '26.0',
			compatibilitySource: 'remote-provider',
			remotePlatform: 'android',
			remoteBrowser: 'samsung-internet',
			remoteBrowserVersionLabel: 'latest',
			capabilities: capabilityProbe({ userAgent: '' }),
		}),
	])

	assert.equal(result.status, 1)
	assert.match(result.stderr, /android-samsung-internet-latest did not record userAgent capability evidence/)
})

test('rejects rows without complete compatibility evidence', () => {
	const result = runChecker([
		row({
			projectName: 'chromium',
			browserName: 'chromium',
			browserVersion: '96.0.0.0',
			compatibilitySource: 'local-playwright',
			capabilities: capabilityProbe({ moduleWorker: false }),
		}),
		row({
			projectName: 'firefox',
			browserName: 'firefox',
			browserVersion: '127.0',
			compatibilitySource: 'local-playwright',
			consoleErrors: ['console.error: RuntimeError: unreachable'],
		}),
		row({
			projectName: 'webkit',
			browserName: 'webkit',
			browserVersion: '17.4',
			compatibilitySource: 'local-playwright',
			os: { platform: 'linux', release: '', arch: 'x64' },
		}),
		row({
			projectName: 'mobile-firefox',
			browserName: 'firefox',
			browserVersion: '150.0',
			compatibilitySource: 'local-playwright',
			artifactNames: ['observations.tsv', 'analysis.jsonl', 'index.html'],
		}),
	])

	assert.equal(result.status, 1)
	assert.match(result.stderr, /chromium did not report moduleWorker/)
	assert.match(result.stderr, /firefox has relevant console\/page errors: console\.error: RuntimeError: unreachable/)
	assert.match(result.stderr, /webkit is missing os\.release/)
	assert.match(result.stderr, /mobile-firefox is missing required artifact evidence: reports\.jsonl/)
})

test('uses an overridden remote matrix for provider target validation', () => {
	const matrixFile = writeRemoteMatrix({
		id: 'android-custom-chrome',
		platform: 'android',
		browser: 'chrome',
		version: 'latest',
		project: 'chromium',
		required: true,
	})
	const result = runChecker([
		row({
			projectName: 'chromium',
			remoteTargetId: 'android-custom-chrome',
			browserName: 'chrome',
			browserVersion: '148.0.0.0',
			compatibilitySource: 'remote-provider',
			remotePlatform: 'android',
			remoteBrowser: 'chrome',
			remoteBrowserVersionLabel: 'latest',
			userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36',
		}),
	], { WEB_COMPAT_REMOTE_MATRIX_FILE: matrixFile })

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.match(result.stdout, /Browser support policy is compatible/)
})

test('rejects provider-only policy ranges broader than provider evidence', () => {
	const result = runChecker([
		row({
			projectName: 'chromium',
			remoteTargetId: 'android-samsung-internet-latest',
			browserName: 'samsung',
			browserVersion: '26.0',
			compatibilitySource: 'remote-provider',
			remotePlatform: 'android',
			remoteBrowser: 'samsung-internet',
			remoteBrowserVersionLabel: 'latest',
			userAgent: 'Mozilla/5.0 (Linux; Android 14) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
		}),
	], {}, {
		policyTransform: (text) => text.replace(
			/samsungInternet: \{\n\t\tminimumKnownGood: null,\n\t\tlatestKnownGood: null,/,
			'samsungInternet: {\n\t\tminimumKnownGood: 1,\n\t\tlatestKnownGood: 999,',
		),
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /samsungInternet generated policy range 1-999 does not match provider evidence range 26-26/)
})

function runChecker(rows, env = {}, options = {}) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'biovault-browser-support-policy-'))
	tempDirs.push(dir)
	const resultsFile = path.join(dir, 'results.json')
	const policyFile = path.join(dir, 'browser-support.generated.ts')
	const todoFile = path.join(dir, 'missing-TODO.md')
	fs.writeFileSync(resultsFile, JSON.stringify(rows, null, 2))
	const policyText = fs.readFileSync(path.join(root, 'lib/browser-support.generated.ts'), 'utf8')
	fs.writeFileSync(policyFile, options.policyTransform?.(policyText) ?? policyText)
	return spawnSync(process.execPath, [checker], {
		cwd: root,
		encoding: 'utf8',
		env: {
			...process.env,
			WEB_COMPAT_RESULTS_FILE: resultsFile,
			WEB_COMPAT_POLICY_FILE: policyFile,
			WEB_COMPAT_TODO_FILE: todoFile,
			...env,
		},
	})
}

function row({
	projectName,
	remoteTargetId,
	browserName,
	browserVersion,
	compatibilitySource,
	remotePlatform,
	remoteBrowser,
	remoteBrowserVersionLabel,
	remoteDeviceName = remoteTargetDevice(remoteTargetId),
	remoteOsVersion = remoteTargetOsVersion(remoteTargetId),
	userAgent,
	capabilities,
	consoleErrors = [],
	artifactNames = ['observations.tsv', 'analysis.jsonl', 'reports.jsonl', 'index.html'],
	os,
}) {
	return {
		...baseMetadata(remoteTargetId ?? projectName, browserName),
		projectName,
		remoteTargetId,
		browserName,
		browserVersion,
		compatibilitySource,
		remotePlatform,
		remoteBrowser,
		remoteBrowserVersionLabel,
		remoteDeviceName,
		remoteOsVersion,
		status: 'passed',
		reportRunStatus: 'passed',
		artifactValidationStatus: 'passed',
		artifactNames,
		capabilities: capabilities ?? capabilityProbe(userAgent ? { userAgent } : {}),
		consoleErrors,
		...(os ? { os } : {}),
	}
}

function remoteTargetDevice(targetId) {
	return {
		'android-samsung-internet-latest': 'Samsung Galaxy S24',
		'android-chrome-latest': 'Google Pixel 9',
	}[targetId]
}

function remoteTargetOsVersion(targetId) {
	return {
		'android-samsung-internet-latest': '14.0',
		'android-chrome-latest': '15.0',
	}[targetId]
}

function baseMetadata(id, engine) {
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
		deviceProfile: id,
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

function writeRemoteMatrix(target) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'biovault-browser-support-policy-matrix-'))
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
