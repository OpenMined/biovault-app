import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, test } from 'node:test'

const root = path.resolve(import.meta.dirname, '..')
const tempDirs = []

afterEach(() => {
	for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { force: true, recursive: true })
})

test('does not check provider rows without passing remote evidence', () => {
	const fixture = createFixture([])

	runUpdater(fixture)

	const todo = fs.readFileSync(fixture.todoFile, 'utf8')
	assert.match(todo, /- \[ \] Chrome on Android latest\./)
	assert.match(todo, /- \[ \] Samsung Internet latest\./)
	assert.match(todo, /- \[ \] Safari latest\./)
	assert.match(todo, /- \[ \] Firefox iOS latest\./)
})

test('checks Android and iOS provider rows when every target has passing evidence', () => {
	const fixture = createFixture([
		'android-chrome-latest',
		'android-chrome-previous',
		'android-firefox-latest',
		'android-samsung-internet-latest',
		'ios-safari-latest',
		'ios-safari-oldest-supported',
		'ios-chrome-latest',
		'ios-firefox-latest',
	])

	runUpdater(fixture)

	const todo = fs.readFileSync(fixture.todoFile, 'utf8')
	for (const label of [
		'Test at minimum:',
		'Chrome on Android latest.',
		'Chrome on Android one or two older major versions.',
		'Firefox Android latest.',
		'Samsung Internet latest.',
		'Safari latest.',
		'Safari on the oldest iOS version we intend to support.',
		'Chrome iOS latest.',
		'Firefox iOS latest.',
	]) {
		assert.match(todo, new RegExp(`- \\[x\\] ${escapeRegex(label)}`))
	}
})

test('does not check provider rows from local Android evidence', () => {
	const fixture = createFixture([
		{ remoteTargetId: 'android-chrome-latest', compatibilitySource: 'android-local' },
		{ remoteTargetId: 'android-chrome-previous', compatibilitySource: 'remote-provider' },
		{ remoteTargetId: 'android-firefox-latest', compatibilitySource: 'remote-provider' },
		{ remoteTargetId: 'android-samsung-internet-latest', compatibilitySource: 'remote-provider' },
	])

	runUpdater(fixture)

	const todo = fs.readFileSync(fixture.todoFile, 'utf8')
	assert.match(todo, /- \[ \] Test at minimum:/)
	assert.match(todo, /- \[ \] Chrome on Android latest\./)
	assert.match(todo, /- \[x\] Chrome on Android one or two older major versions\./)
})

test('does not check provider rows with mismatched target metadata', () => {
	const fixture = createFixture([
		{ remoteTargetId: 'android-chrome-previous', remoteBrowserVersionLabel: 'latest' },
		'android-firefox-latest',
		'android-samsung-internet-latest',
	])

	runUpdater(fixture)

	const todo = fs.readFileSync(fixture.todoFile, 'utf8')
	assert.match(todo, /- \[ \] Chrome on Android one or two older major versions\./)
	assert.match(todo, /- \[x\] Firefox Android latest\./)
	assert.match(todo, /- \[x\] Samsung Internet latest\./)
})

test('does not check provider rows whose browserName only names the Playwright engine', () => {
	const fixture = createFixture([
		{ remoteTargetId: 'ios-firefox-latest', browserName: 'webkit' },
	])

	runUpdater(fixture)

	const todo = fs.readFileSync(fixture.todoFile, 'utf8')
	assert.match(todo, /- \[ \] Firefox iOS latest\./)
})

test('uses an overridden remote matrix when validating provider rows', () => {
	const fixture = createFixture(['android-chrome-latest'])
	const matrixFile = path.join(fixture.dir, 'remote-matrix.yaml')
	fs.writeFileSync(matrixFile, [
		'targets:',
		'  - id: android-chrome-latest',
		'    platform: android',
		'    browser: firefox',
		'    version: latest',
		'    project: firefox',
		'',
	].join('\n'))

	runUpdater(fixture, { WEB_COMPAT_REMOTE_MATRIX_FILE: matrixFile })

	const todo = fs.readFileSync(fixture.todoFile, 'utf8')
	assert.match(todo, /- \[ \] Chrome on Android latest\./)
})

test('does not check provider rows without user-agent evidence', () => {
	const fixture = createFixture([
		{ remoteTargetId: 'android-samsung-internet-latest', capabilities: {} },
	])

	runUpdater(fixture)

	const todo = fs.readFileSync(fixture.todoFile, 'utf8')
	assert.match(todo, /- \[ \] Test at minimum:/)
	assert.match(todo, /- \[ \] Samsung Internet latest\./)
})

test('does not check provider rows without complete compatibility evidence', () => {
	const fixture = createFixture([
		{ remoteTargetId: 'android-firefox-latest', capabilities: capabilityProbe({
			userAgent: remoteTargetMeta('android-firefox-latest').capabilities.userAgent,
			moduleWorker: false,
		}) },
		{ remoteTargetId: 'android-samsung-internet-latest', consoleErrors: ['pageerror: RuntimeError: unreachable'] },
		{ remoteTargetId: 'ios-chrome-latest', deviceProfile: '' },
		{ remoteTargetId: 'ios-firefox-latest', artifactNames: ['observations.tsv', 'analysis.jsonl', 'index.html'] },
	])

	runUpdater(fixture)

	const todo = fs.readFileSync(fixture.todoFile, 'utf8')
	assert.match(todo, /- \[ \] Firefox Android latest\./)
	assert.match(todo, /- \[ \] Samsung Internet latest\./)
	assert.match(todo, /- \[ \] Chrome iOS latest\./)
	assert.match(todo, /- \[ \] Firefox iOS latest\./)
})

function createFixture(remoteTargetIds) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'biovault-browser-compat-todo-'))
	tempDirs.push(dir)
	const todoFile = path.join(dir, 'TODO.md')
	const policyFile = path.join(dir, 'browser-support.generated.ts')
	const resultsFile = path.join(dir, 'results.json')
	fs.copyFileSync(path.join(root, 'TODO.md'), todoFile)
	fs.copyFileSync(path.join(root, 'lib/browser-support.generated.ts'), policyFile)
	fs.writeFileSync(resultsFile, JSON.stringify(remoteTargetIds.map(providerRow), null, 2))
	return { dir, todoFile, policyFile, resultsFile }
}

function providerRow(target) {
	const targetId = typeof target === 'string' ? target : target.remoteTargetId
	const meta = remoteTargetMeta(targetId)
	return {
		...baseMetadata(targetId, meta.browserName),
		...meta,
		remoteTargetId: targetId,
		compatibilitySource: 'remote-provider',
		status: 'passed',
		reportRunStatus: 'passed',
		artifactValidationStatus: 'passed',
		artifactNames: ['observations.tsv', 'analysis.jsonl', 'reports.jsonl', 'index.html'],
		consoleErrors: [],
		...(typeof target === 'string' ? {} : target),
	}
}

function remoteTargetMeta(targetId) {
	const targets = {
		'android-chrome-latest': {
			projectName: 'chromium',
			browserName: 'chrome',
			browserVersion: '148.0.0.0',
			remotePlatform: 'android',
			remoteBrowser: 'chrome',
			remoteBrowserVersionLabel: 'latest',
			remoteDeviceName: 'Google Pixel 9',
			remoteOsVersion: '15.0',
			capabilities: capabilityProbe({ userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36' }),
		},
		'android-chrome-previous': {
			projectName: 'chromium',
			browserName: 'chrome',
			browserVersion: '147.0.0.0',
			remotePlatform: 'android',
			remoteBrowser: 'chrome',
			remoteBrowserVersionLabel: 'previous-major',
			remoteDeviceName: 'Google Pixel 8',
			remoteOsVersion: '14.0',
			capabilities: capabilityProbe({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36' }),
		},
		'android-firefox-latest': {
			projectName: 'firefox',
			browserName: 'firefox',
			browserVersion: '150.0',
			remotePlatform: 'android',
			remoteBrowser: 'firefox',
			remoteBrowserVersionLabel: 'latest',
			remoteDeviceName: 'Google Pixel 9',
			remoteOsVersion: '15.0',
			capabilities: capabilityProbe({ userAgent: 'Mozilla/5.0 (Android 15; Mobile; rv:150.0) Gecko/150.0 Firefox/150.0' }),
		},
		'android-samsung-internet-latest': {
			projectName: 'chromium',
			browserName: 'samsung',
			browserVersion: '26.0',
			remotePlatform: 'android',
			remoteBrowser: 'samsung-internet',
			remoteBrowserVersionLabel: 'latest',
			remoteDeviceName: 'Samsung Galaxy S24',
			remoteOsVersion: '14.0',
			capabilities: capabilityProbe({ userAgent: 'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36' }),
		},
		'ios-safari-latest': {
			projectName: 'webkit',
			browserName: 'safari',
			browserVersion: '18.0',
			remotePlatform: 'ios',
			remoteBrowser: 'safari',
			remoteBrowserVersionLabel: 'latest',
			remoteDeviceName: 'iPhone 16',
			remoteOsVersion: '18',
			capabilities: capabilityProbe({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' }),
		},
		'ios-safari-oldest-supported': {
			projectName: 'webkit',
			browserName: 'safari',
			browserVersion: '16.0',
			remotePlatform: 'ios',
			remoteBrowser: 'safari',
			remoteBrowserVersionLabel: 'oldest-supported',
			remoteDeviceName: 'iPhone 14',
			remoteOsVersion: '16',
			capabilities: capabilityProbe({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1' }),
		},
		'ios-chrome-latest': {
			projectName: 'webkit',
			browserName: 'chrome',
			browserVersion: '148.0',
			remotePlatform: 'ios',
			remoteBrowser: 'chrome',
			remoteBrowserVersionLabel: 'latest',
			remoteDeviceName: 'iPhone 16',
			remoteOsVersion: '18',
			capabilities: capabilityProbe({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/148.0.0.0 Mobile/15E148 Safari/604.1' }),
		},
		'ios-firefox-latest': {
			projectName: 'webkit',
			browserName: 'firefox',
			browserVersion: '150.0',
			remotePlatform: 'ios',
			remoteBrowser: 'firefox',
			remoteBrowserVersionLabel: 'latest',
			remoteDeviceName: 'iPhone 16',
			remoteOsVersion: '18',
			capabilities: capabilityProbe({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/150.0 Mobile/15E148 Safari/605.1.15' }),
		},
	}
	return targets[targetId] ?? {}
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

function runUpdater({ todoFile, policyFile, resultsFile }, env = {}) {
	const result = spawnSync(process.execPath, [path.join(root, 'scripts/update-browser-compat-todo.mjs')], {
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
	assert.equal(result.status, 0, result.stderr || result.stdout)
}

function escapeRegex(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
