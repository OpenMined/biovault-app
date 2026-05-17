import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, test } from 'node:test'

const root = path.resolve(import.meta.dirname, '..')
const completionChecker = path.join(root, 'scripts/check-browser-compat-completion.mjs')
const policyUpdater = path.join(root, 'scripts/update-browser-support.mjs')
const todoUpdater = path.join(root, 'scripts/update-browser-compat-todo.mjs')
const tempPaths = []

afterEach(() => {
	for (const item of tempPaths.splice(0)) fs.rmSync(item, { force: true, recursive: true })
})

test('strict completion audit passes with complete local and provider evidence plus updated TODO', () => {
	const fixture = createFixture(completeRows())
	const policyUpdate = runNode(policyUpdater, fixture)
	assert.equal(policyUpdate.status, 0, policyUpdate.stderr || policyUpdate.stdout)
	const update = runNode(todoUpdater, fixture)
	assert.equal(update.status, 0, update.stderr || update.stdout)

	const audit = runNode(completionChecker, fixture)
	assert.equal(audit.status, 0, audit.stderr || audit.stdout)
	assert.match(audit.stdout, /Browser compatibility TODO is complete/)
})

test('strict completion audit fails when provider evidence is not reflected in generated policy', () => {
	const fixture = createFixture(completeRows())
	const update = runNode(todoUpdater, fixture)
	assert.equal(update.status, 0, update.stderr || update.stdout)

	const audit = runNode(completionChecker, fixture)
	assert.equal(audit.status, 1)
	assert.match(audit.stderr, /android-samsung-internet-latest has passing evidence for samsungInternet, but generated policy has no minimum\/latest known-good version/)
	assert.match(audit.stderr, /ios-chrome-latest has passing evidence for chromeIos, but generated policy has no minimum\/latest known-good version/)
	assert.match(audit.stderr, /ios-firefox-latest has passing evidence for firefoxIos, but generated policy has no minimum\/latest known-good version/)
})

test('strict completion audit fails when a required provider target is missing', () => {
	const rows = completeRows().filter((row) => row.remoteTargetId !== 'ios-firefox-latest')
	const fixture = createFixture(rows)
	const policyUpdate = runNode(policyUpdater, fixture)
	assert.equal(policyUpdate.status, 0, policyUpdate.stderr || policyUpdate.stdout)
	const update = runNode(todoUpdater, fixture)
	assert.equal(update.status, 0, update.stderr || update.stdout)

	const audit = runNode(completionChecker, fixture)
	assert.equal(audit.status, 1)
	assert.match(audit.stderr, /missing passing real-browser provider evidence for ios-firefox-latest/)
	assert.match(audit.stderr, /TODO\.md:\d+ remains unchecked: - \[ \] Firefox iOS latest\./)
	assert.match(audit.stderr, /WEB_COMPAT_INCLUDE_DEFERRED=1 npm run check:browser-compat-provider-secret/)
	assert.match(audit.stderr, /WEB_URL=https:\/\/app\.biovault\.net\/web\/ WEB_COMPAT_CHECK_WEB_URL_REACHABLE=1 WEB_COMPAT_REQUIRE_REMOTE_IOS=1 WEB_COMPAT_INCLUDE_DEFERRED=1 npm run check:browser-compat-infra/)
	assert.match(audit.stderr, /WEB_COMPAT_REMOTE_ENDPOINTS_JSON/)
	assert.match(audit.stderr, /browser-compat-endpoints\.json/)
	assert.match(audit.stderr, /WEB_COMPAT_REMOTE_ENDPOINTS_FILE/)
	assert.match(audit.stderr, /BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON/)
	assert.match(audit.stderr, /BROWSER_COMPAT_REMOTE_ENDPOINTS_FILE/)
	assert.match(audit.stderr, /CI-visible BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON secret/)
	assert.match(audit.stderr, /Missing remote target ids: ios-firefox-latest/)
})

test('strict completion audit fails when the completion contract omits a remote matrix target', () => {
	const fixture = createFixture(completeRows(), {
		completionTransform: (text) => text.replace(/\n  - ios-firefox-latest\n/, '\n'),
	})
	const policyUpdate = runNode(policyUpdater, fixture)
	assert.equal(policyUpdate.status, 0, policyUpdate.stderr || policyUpdate.stdout)
	const update = runNode(todoUpdater, fixture)
	assert.equal(update.status, 0, update.stderr || update.stdout)

	const audit = runNode(completionChecker, fixture)
	assert.equal(audit.status, 1)
	assert.match(audit.stderr, /completion contract is missing remote target ios-firefox-latest/)
})

test('strict completion audit fails when WebKit local evidence is missing', () => {
	const rows = completeRows().filter((row) => row.projectName !== 'webkit')
	const fixture = createFixture(rows)
	const policyUpdate = runNode(policyUpdater, fixture)
	assert.equal(policyUpdate.status, 0, policyUpdate.stderr || policyUpdate.stdout)
	const update = runNode(todoUpdater, fixture)
	assert.equal(update.status, 0, update.stderr || update.stdout)

	const audit = runNode(completionChecker, fixture)
	assert.equal(audit.status, 1)
	assert.match(audit.stderr, /missing passing local project evidence for webkit/)
})

test('strict completion audit does not count provider rows as local project evidence', () => {
	const rows = completeRows().filter((row) => !(row.projectName === 'chromium' && !row.remoteTargetId))
	const fixture = createFixture(rows)
	const policyUpdate = runNode(policyUpdater, fixture)
	assert.equal(policyUpdate.status, 0, policyUpdate.stderr || policyUpdate.stdout)
	const update = runNode(todoUpdater, fixture)
	assert.equal(update.status, 0, update.stderr || update.stdout)

	const audit = runNode(completionChecker, fixture)
	assert.equal(audit.status, 1)
	assert.match(audit.stderr, /missing passing local project evidence for chromium/)
})

test('strict completion audit rejects remote target rows from local Android evidence', () => {
	const rows = completeRows().map((row) => row.remoteTargetId === 'android-samsung-internet-latest'
		? { ...row, compatibilitySource: 'android-local' }
		: row)
	const fixture = createFixture(rows)
	const policyUpdate = runNode(policyUpdater, fixture)
	assert.equal(policyUpdate.status, 0, policyUpdate.stderr || policyUpdate.stdout)
	const update = runNode(todoUpdater, fixture)
	assert.equal(update.status, 0, update.stderr || update.stdout)

	const audit = runNode(completionChecker, fixture)
	assert.equal(audit.status, 1)
	assert.match(audit.stderr, /android-samsung-internet-latest must be recorded from remote-provider evidence/)
	assert.match(audit.stderr, /TODO\.md:\d+ remains unchecked: - \[ \] Samsung Internet latest\./)
})

test('strict completion audit rejects provider rows without user-agent evidence', () => {
	const rows = completeRows().map((row) => row.remoteTargetId === 'android-samsung-internet-latest'
		? { ...row, capabilities: {} }
		: row)
	const fixture = createFixture(rows)
	const policyUpdate = runNode(policyUpdater, fixture)
	assert.equal(policyUpdate.status, 0, policyUpdate.stderr || policyUpdate.stdout)
	const update = runNode(todoUpdater, fixture)
	assert.equal(update.status, 0, update.stderr || update.stdout)

	const audit = runNode(completionChecker, fixture)
	assert.equal(audit.status, 1)
	assert.match(audit.stderr, /android-samsung-internet-latest passed without user-agent evidence/)
	assert.match(audit.stderr, /TODO\.md:\d+ remains unchecked: - \[ \] Samsung Internet latest\./)
})

test('strict completion audit rejects provider rows with mismatched device metadata', () => {
	const rows = completeRows().map((row) => row.remoteTargetId === 'ios-safari-oldest-supported'
		? { ...row, remoteDeviceName: 'iPhone 16', remoteOsVersion: '18' }
		: row)
	const fixture = createFixture(rows)
	const policyUpdate = runNode(policyUpdater, fixture)
	assert.equal(policyUpdate.status, 0, policyUpdate.stderr || policyUpdate.stdout)
	const update = runNode(todoUpdater, fixture)
	assert.equal(update.status, 0, update.stderr || update.stdout)

	const audit = runNode(completionChecker, fixture)
	assert.equal(audit.status, 1)
	assert.match(audit.stderr, /ios-safari-oldest-supported recorded device iPhone 16, expected iPhone 14/)
	assert.match(audit.stderr, /ios-safari-oldest-supported recorded OS version 18, expected 16/)
})

test('strict completion audit rejects provider rows labeled with the Playwright engine instead of browser shell', () => {
	const rows = completeRows().map((row) => row.remoteTargetId === 'ios-chrome-latest'
		? { ...row, browserName: 'webkit' }
		: row)
	const fixture = createFixture(rows)
	const policyUpdate = runNode(policyUpdater, fixture)
	assert.equal(policyUpdate.status, 0, policyUpdate.stderr || policyUpdate.stdout)
	const update = runNode(todoUpdater, fixture)
	assert.equal(update.status, 0, update.stderr || update.stdout)

	const audit = runNode(completionChecker, fixture)
	assert.equal(audit.status, 1)
	assert.match(audit.stderr, /ios-chrome-latest recorded browserName webkit, expected chrome/)
	assert.match(audit.stderr, /TODO\.md:\d+ remains unchecked: - \[ \] Chrome iOS latest\./)
})

test('strict completion audit rejects passed rows without the full capability probe', () => {
	const rows = completeRows().map((row) => row.projectName === 'mobile-firefox'
		? { ...row, capabilities: { ...row.capabilities, moduleWorker: false } }
		: row)
	const fixture = createFixture(rows)
	const policyUpdate = runNode(policyUpdater, fixture)
	assert.equal(policyUpdate.status, 0, policyUpdate.stderr || policyUpdate.stdout)
	const update = runNode(todoUpdater, fixture)
	assert.equal(update.status, 0, update.stderr || update.stdout)

	const audit = runNode(completionChecker, fixture)
	assert.equal(audit.status, 1)
	assert.match(audit.stderr, /mobile-firefox did not report module Worker support/)
})

test('strict completion audit rejects passed rows with relevant console or page errors', () => {
	const rows = completeRows().map((row) => row.projectName === 'mobile-firefox'
		? { ...row, consoleErrors: ['pageerror: RuntimeError: unreachable'] }
		: row)
	const fixture = createFixture(rows)
	const policyUpdate = runNode(policyUpdater, fixture)
	assert.equal(policyUpdate.status, 0, policyUpdate.stderr || policyUpdate.stdout)
	const update = runNode(todoUpdater, fixture)
	assert.equal(update.status, 0, update.stderr || update.stdout)

	const audit = runNode(completionChecker, fixture)
	assert.equal(audit.status, 1)
	assert.match(audit.stderr, /mobile-firefox has relevant console\/page errors: pageerror: RuntimeError: unreachable/)
})

test('strict completion audit rejects passed rows without required artifact evidence', () => {
	const rows = completeRows().map((row) => row.projectName === 'mobile-firefox'
		? { ...row, artifactNames: ['observations.tsv', 'analysis.jsonl', 'index.html'] }
		: row)
	const fixture = createFixture(rows)
	const policyUpdate = runNode(policyUpdater, fixture)
	assert.equal(policyUpdate.status, 0, policyUpdate.stderr || policyUpdate.stdout)
	const update = runNode(todoUpdater, fixture)
	assert.equal(update.status, 0, update.stderr || update.stdout)

	const audit = runNode(completionChecker, fixture)
	assert.equal(audit.status, 1)
	assert.match(audit.stderr, /mobile-firefox is missing required artifact evidence: reports\.jsonl/)
})

test('strict completion audit rejects missing required Markdown summary', () => {
	const fixture = createFixture(completeRows(), { writeResultsMd: false })
	const policyUpdate = runNode(policyUpdater, fixture)
	assert.equal(policyUpdate.status, 0, policyUpdate.stderr || policyUpdate.stdout)
	const update = runNode(todoUpdater, fixture)
	assert.equal(update.status, 0, update.stderr || update.stdout)

	const audit = runNode(completionChecker, fixture, { WEB_COMPAT_REQUIRE_RESULTS_MD: '1' })
	assert.equal(audit.status, 1)
	assert.match(audit.stderr, /missing Markdown compatibility summary/)
})

test('strict completion audit rejects stale Markdown summary row count', () => {
	const fixture = createFixture(completeRows(), { markdownRowCount: 1 })
	const policyUpdate = runNode(policyUpdater, fixture)
	assert.equal(policyUpdate.status, 0, policyUpdate.stderr || policyUpdate.stdout)
	const update = runNode(todoUpdater, fixture)
	assert.equal(update.status, 0, update.stderr || update.stdout)

	const audit = runNode(completionChecker, fixture, { WEB_COMPAT_REQUIRE_RESULTS_MD: '1' })
	assert.equal(audit.status, 1)
	assert.match(audit.stderr, /results\.md has 1 result row\(s\), expected 17/)
})

test('strict completion audit rejects duplicate result ids and invalid timing', () => {
	const rows = completeRows().map((row) => row.projectName === 'mobile-firefox'
		? {
			...row,
			id: 'chromium-23andme-v5-hu50B3F5-1',
			finishedAt: '2026-05-16T23:59:59.000Z',
			durationMs: 9000,
		}
		: row)
	const fixture = createFixture(rows)
	const policyUpdate = runNode(policyUpdater, fixture)
	assert.equal(policyUpdate.status, 0, policyUpdate.stderr || policyUpdate.stdout)
	const update = runNode(todoUpdater, fixture)
	assert.equal(update.status, 0, update.stderr || update.stdout)

	const audit = runNode(completionChecker, fixture)
	assert.equal(audit.status, 1)
	assert.match(audit.stderr, /mobile-firefox duplicates result id chromium-23andme-v5-hu50B3F5-1/)
	assert.match(audit.stderr, /mobile-firefox finishedAt is before startedAt/)
	assert.match(audit.stderr, /mobile-firefox durationMs 9000 does not match startedAt\/finishedAt interval -1000/)
})

test('strict completion audit rejects unsupported row status metadata', () => {
	const rows = completeRows().map((row) => row.projectName === 'chromium-cache-94'
		? {
			...row,
			reportRunStatus: 'done',
			artifactValidationStatus: 'missing',
			failureMessage: '',
			consoleErrors: ['warning', 123],
			capabilities: { ...row.capabilities, failures: ['expected failure', 123] },
		}
		: row)
	const fixture = createFixture(rows)
	const policyUpdate = runNode(policyUpdater, fixture)
	assert.equal(policyUpdate.status, 0, policyUpdate.stderr || policyUpdate.stdout)
	const update = runNode(todoUpdater, fixture)
	assert.equal(update.status, 0, update.stderr || update.stdout)

	const audit = runNode(completionChecker, fixture)
	assert.equal(audit.status, 1)
	assert.match(audit.stderr, /chromium-cache-94 has unsupported reportRunStatus: done/)
	assert.match(audit.stderr, /chromium-cache-94 has unsupported artifactValidationStatus: missing/)
	assert.match(audit.stderr, /chromium-cache-94 failed without a failureMessage/)
	assert.match(audit.stderr, /chromium-cache-94 consoleErrors must contain only strings/)
	assert.match(audit.stderr, /chromium-cache-94 capability failures must contain only strings/)
})

test('strict completion audit rejects rows missing required result metadata', () => {
	const rows = completeRows().map((row) => row.projectName === 'mobile-firefox'
		? { ...row, deviceProfile: '', os: { platform: 'linux', release: '6.19.13-arch1-1', arch: '' } }
		: row)
	const fixture = createFixture(rows)
	const policyUpdate = runNode(policyUpdater, fixture)
	assert.equal(policyUpdate.status, 0, policyUpdate.stderr || policyUpdate.stdout)
	const update = runNode(todoUpdater, fixture)
	assert.equal(update.status, 0, update.stderr || update.stdout)

	const audit = runNode(completionChecker, fixture)
	assert.equal(audit.status, 1)
	assert.match(audit.stderr, /mobile-firefox is missing deviceProfile/)
	assert.match(audit.stderr, /mobile-firefox is missing os\.arch/)
})

test('strict completion audit fails when a result row is missing evidence source', () => {
	const rows = completeRows().map((row) => row.projectName === 'chromium' && !row.remoteTargetId
		? { ...row, compatibilitySource: undefined }
		: row)
	const fixture = createFixture(rows)
	const policyUpdate = runNode(policyUpdater, fixture)
	assert.equal(policyUpdate.status, 0, policyUpdate.stderr || policyUpdate.stdout)
	const update = runNode(todoUpdater, fixture)
	assert.equal(update.status, 0, update.stderr || update.stdout)

	const audit = runNode(completionChecker, fixture)
	assert.equal(audit.status, 1)
	assert.match(audit.stderr, /chromium is missing compatibilitySource/)
})

test('strict completion audit fails when a result row has unsupported evidence source', () => {
	const rows = completeRows().map((row) => row.projectName === 'chromium' && !row.remoteTargetId
		? { ...row, compatibilitySource: 'provider-ish' }
		: row)
	const fixture = createFixture(rows)
	const policyUpdate = runNode(policyUpdater, fixture)
	assert.equal(policyUpdate.status, 0, policyUpdate.stderr || policyUpdate.stdout)
	const update = runNode(todoUpdater, fixture)
	assert.equal(update.status, 0, update.stderr || update.stdout)

	const audit = runNode(completionChecker, fixture)
	assert.equal(audit.status, 1)
	assert.match(audit.stderr, /chromium has unsupported compatibilitySource: provider-ish/)
})

test('strict completion audit rejects android-local target with wrong evidence source', () => {
	const rows = completeRows().map((row) => row.remoteTargetId === 'android-local'
		? { ...row, compatibilitySource: 'local-playwright' }
		: row)
	const fixture = createFixture(rows)
	const policyUpdate = runNode(policyUpdater, fixture)
	assert.equal(policyUpdate.status, 0, policyUpdate.stderr || policyUpdate.stdout)
	const update = runNode(todoUpdater, fixture)
	assert.equal(update.status, 0, update.stderr || update.stdout)

	const audit = runNode(completionChecker, fixture)
	assert.equal(audit.status, 1)
	assert.match(audit.stderr, /android-local must be recorded from android-local evidence/)
})

test('strict completion audit rejects stale generated policy table in TODO', () => {
	const fixture = createFixture(completeRows())
	const policyUpdate = runNode(policyUpdater, fixture)
	assert.equal(policyUpdate.status, 0, policyUpdate.stderr || policyUpdate.stdout)
	const update = runNode(todoUpdater, fixture)
	assert.equal(update.status, 0, update.stderr || update.stdout)
	const todo = fs.readFileSync(fixture.todoFile, 'utf8')
	fs.writeFileSync(fixture.todoFile, todo.replace(
		'| Chrome iOS | 148 | 148 | None |',
		'| Chrome iOS | None | None | None |',
	))

	const audit = runNode(completionChecker, fixture)
	assert.equal(audit.status, 1)
	assert.match(audit.stderr, /TODO\.md Chrome iOS minimum known-good null does not match generated policy 148/)
	assert.match(audit.stderr, /TODO\.md Chrome iOS latest known-good null does not match generated policy 148/)
})

test('strict completion audit rejects provider-only policy ranges broader than provider evidence', () => {
	const fixture = createFixture(completeRows())
	const policyUpdate = runNode(policyUpdater, fixture)
	assert.equal(policyUpdate.status, 0, policyUpdate.stderr || policyUpdate.stdout)
	const update = runNode(todoUpdater, fixture)
	assert.equal(update.status, 0, update.stderr || update.stdout)
	const policyText = fs.readFileSync(fixture.policyFile, 'utf8')
	fs.writeFileSync(fixture.policyFile, policyText.replace(
		/chromeIos: \{\n\t\tminimumKnownGood: 148,\n\t\tlatestKnownGood: 148,/,
		'chromeIos: {\n\t\tminimumKnownGood: 1,\n\t\tlatestKnownGood: 999,',
	))
	const todo = fs.readFileSync(fixture.todoFile, 'utf8')
	fs.writeFileSync(fixture.todoFile, todo.replace(
		'| Chrome iOS | 148 | 148 | None |',
		'| Chrome iOS | 1 | 999 | None |',
	))

	const audit = runNode(completionChecker, fixture)
	assert.equal(audit.status, 1)
	assert.match(audit.stderr, /chromeIos generated policy range 1-999 does not match provider evidence range 148-148/)
})

function createFixture(rows, options = {}) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'biovault-browser-compat-completion-'))
	tempPaths.push(dir)
	const resultsFile = path.join(dir, 'results.json')
	const resultsMdFile = path.join(dir, 'results.md')
	const policyFile = path.join(dir, 'browser-support.generated.ts')
	const todoFile = path.join(dir, 'TODO.md')
	const completionFile = path.join(dir, 'browser-compat-completion.yaml')
	fs.writeFileSync(resultsFile, JSON.stringify(rows, null, 2))
	if (options.writeResultsMd !== false) {
		fs.writeFileSync(resultsMdFile, renderResultsMd(options.markdownRowCount ?? rows.length))
	}
	fs.copyFileSync(path.join(root, 'lib/browser-support.generated.ts'), policyFile)
	fs.copyFileSync(path.join(root, 'TODO.md'), todoFile)
	const completionText = fs.readFileSync(path.join(root, 'tests/browser-compat-completion.yaml'), 'utf8')
	fs.writeFileSync(completionFile, options.completionTransform?.(completionText) ?? completionText)
	return { resultsFile, resultsMdFile, policyFile, todoFile, completionFile }
}

function runNode(script, { resultsFile, resultsMdFile, policyFile, todoFile, completionFile }, env = {}) {
	return spawnSync(process.execPath, [script], {
		cwd: root,
		encoding: 'utf8',
		env: {
			...process.env,
			WEB_COMPAT_RESULTS_FILE: resultsFile,
			WEB_COMPAT_RESULTS_MD_FILE: resultsMdFile,
			WEB_COMPAT_POLICY_FILE: policyFile,
			WEB_COMPAT_TODO_FILE: todoFile,
			WEB_COMPAT_COMPLETION_FILE: completionFile,
			...env,
		},
	})
}

function renderResultsMd(rowCount) {
	const rows = Array.from({ length: rowCount }, (_, index) => (
		`| passed | target-${index + 1} | local-playwright | chromium | chromium | 148.0.0.0 |`
	))
	return [
		'# Browser Compatibility Results',
		'',
		'| Status | Target | Source | Project | Browser | Version | Device | OS |',
		'| --- | --- | --- | --- | --- | --- | --- | --- |',
		...rows,
		'',
	].join('\n')
}

function completeRows() {
	return [
		localRow('chromium', 'chromium', '148.0.0.0'),
		localRow('firefox', 'firefox', '150.0'),
		localRow('webkit', 'webkit', '26.4'),
		localRow('mobile-chromium', 'chromium', '148.0.0.0'),
		localRow('mobile-firefox', 'firefox', '150.0'),
		failedRow('chromium-cache-94', 'chromium', '94.0.0.0'),
		failedRow('firefox-docker-99', 'firefox', '99.0'),
		failedRow('webkit-docker-15', 'webkit', '15.4'),
		{
			...localRow('android-local', 'android-chrome', '133.0.0.0'),
			engine: 'chromium',
			remoteTargetId: 'android-local',
			compatibilitySource: 'android-local',
		},
		providerRow({
			id: 'android-chrome-latest',
			projectName: 'chromium',
			platform: 'android',
			browser: 'chrome',
			versionLabel: 'latest',
			browserName: 'chrome',
			browserVersion: '148.0.0.0',
			userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36',
		}),
		providerRow({
			id: 'android-chrome-previous',
			projectName: 'chromium',
			platform: 'android',
			browser: 'chrome',
			versionLabel: 'previous-major',
			browserName: 'chrome',
			browserVersion: '147.0.0.0',
			userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36',
		}),
		providerRow({
			id: 'android-firefox-latest',
			projectName: 'firefox',
			platform: 'android',
			browser: 'firefox',
			versionLabel: 'latest',
			browserName: 'firefox',
			browserVersion: '150.0',
			userAgent: 'Mozilla/5.0 (Android 15; Mobile; rv:150.0) Gecko/150.0 Firefox/150.0',
		}),
		providerRow({
			id: 'android-samsung-internet-latest',
			projectName: 'chromium',
			platform: 'android',
			browser: 'samsung-internet',
			versionLabel: 'latest',
			browserName: 'samsung',
			browserVersion: '26.0',
			userAgent: 'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
		}),
		providerRow({
			id: 'ios-safari-latest',
			projectName: 'webkit',
			platform: 'ios',
			browser: 'safari',
			versionLabel: 'latest',
			browserName: 'safari',
			browserVersion: '18.0',
			userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
		}),
		providerRow({
			id: 'ios-safari-oldest-supported',
			projectName: 'webkit',
			platform: 'ios',
			browser: 'safari',
			versionLabel: 'oldest-supported',
			browserName: 'safari',
			browserVersion: '16.0',
			userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
		}),
		providerRow({
			id: 'ios-chrome-latest',
			projectName: 'webkit',
			platform: 'ios',
			browser: 'chrome',
			versionLabel: 'latest',
			browserName: 'chrome',
			browserVersion: '148.0',
			userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/148.0.0.0 Mobile/15E148 Safari/604.1',
		}),
		providerRow({
			id: 'ios-firefox-latest',
			projectName: 'webkit',
			platform: 'ios',
			browser: 'firefox',
			versionLabel: 'latest',
			browserName: 'firefox',
			browserVersion: '150.0',
			userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/150.0 Mobile/15E148 Safari/605.1.15',
		}),
	]
}

function localRow(projectName, browserName, browserVersion) {
	return {
		...baseMetadata(projectName, browserName),
		projectName,
		browserName,
		browserVersion,
		compatibilitySource: 'local-playwright',
		status: 'passed',
		reportRunStatus: 'passed',
		artifactValidationStatus: 'passed',
		capabilities: capabilityProbe(),
		consoleErrors: [],
	}
}

function failedRow(projectName, browserName, browserVersion) {
	return {
		...baseMetadata(projectName, browserName),
		projectName,
		browserName,
		browserVersion,
		compatibilitySource: 'local-playwright',
		status: 'failed',
		reportRunStatus: 'failed',
		artifactValidationStatus: 'failed',
		failureMessage: 'expected compatibility failure fixture',
		capabilities: capabilityProbe({ webAssembly: false, failures: ['expected compatibility failure fixture'] }),
		consoleErrors: [],
	}
}

function providerRow({ id, projectName, platform, browser, versionLabel, browserName, browserVersion, userAgent }) {
	return {
		...baseMetadata(id, engineForProject(projectName, browserName)),
		projectName,
		browserName,
		browserVersion,
		compatibilitySource: 'remote-provider',
		remoteTargetId: id,
		remotePlatform: platform,
		remoteBrowser: browser,
		remoteBrowserVersionLabel: versionLabel,
		remoteDeviceName: remoteTargetDevice(id),
		remoteOsVersion: remoteTargetOsVersion(id),
		status: 'passed',
		reportRunStatus: 'passed',
		artifactValidationStatus: 'passed',
		capabilities: capabilityProbe({ userAgent }),
		consoleErrors: [],
	}
}

function remoteTargetDevice(targetId) {
	return {
		'android-chrome-latest': 'Google Pixel 9',
		'android-chrome-previous': 'Google Pixel 8',
		'android-firefox-latest': 'Google Pixel 9',
		'android-samsung-internet-latest': 'Samsung Galaxy S24',
		'ios-safari-latest': 'iPhone 16',
		'ios-safari-oldest-supported': 'iPhone 14',
		'ios-chrome-latest': 'iPhone 16',
		'ios-firefox-latest': 'iPhone 16',
	}[targetId]
}

function remoteTargetOsVersion(targetId) {
	return {
		'android-chrome-latest': '15.0',
		'android-chrome-previous': '14.0',
		'android-firefox-latest': '15.0',
		'android-samsung-internet-latest': '14.0',
		'ios-safari-latest': '18',
		'ios-safari-oldest-supported': '16',
		'ios-chrome-latest': '18',
		'ios-firefox-latest': '18',
	}[targetId]
}

function engineForProject(projectName, fallback) {
	if (projectName.includes('firefox')) return 'firefox'
	if (projectName.includes('webkit')) return 'webkit'
	if (projectName.includes('chromium')) return 'chromium'
	return fallback
}

function baseMetadata(id, engine) {
	return {
		id: `${id}-23andme-v5-hu50B3F5-1`,
		startedAt: '2026-05-17T00:00:00.000Z',
		finishedAt: '2026-05-17T00:00:01.000Z',
		durationMs: 1000,
		sampleId: '23andme-v5-hu50B3F5',
		artifactNames: ['observations.tsv', 'analysis.jsonl', 'reports.jsonl', 'index.html'],
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
