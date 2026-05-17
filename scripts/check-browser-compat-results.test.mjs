import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, test } from 'node:test'

const root = path.resolve(import.meta.dirname, '..')
const checker = path.join(root, 'scripts/check-browser-compat-results.mjs')
const tempFiles = []

afterEach(() => {
	for (const file of tempFiles.splice(0)) fs.rmSync(file, { force: true })
})

test('accepts a remote target row with matching target metadata and version label', () => {
	const result = runChecker([remoteChromePreviousRow({ remoteBrowserVersionLabel: 'previous-major' })])

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.match(result.stdout, /Browser compatibility results OK/)
})

test('rejects a remote target row with the wrong version label', () => {
	const result = runChecker([remoteChromePreviousRow({ remoteBrowserVersionLabel: 'latest' })])

	assert.equal(result.status, 1)
	assert.match(result.stderr, /android-chrome-previous recorded version label latest, expected previous-major/)
})

test('rejects a remote target row labeled with the Playwright engine instead of the browser shell', () => {
	const result = runChecker([remoteChromePreviousRow({
		remoteTargetId: 'ios-chrome-latest',
		projectName: 'webkit',
		engine: 'webkit',
		browserName: 'webkit',
		browserVersion: '148.0',
		remotePlatform: 'ios',
		remoteBrowser: 'chrome',
		remoteBrowserVersionLabel: 'latest',
		remoteDeviceName: 'iPhone 16',
		remoteOsVersion: '18',
		capabilities: capabilityProbe({
			userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/148.0.0.0 Mobile/15E148 Safari/604.1',
		}),
	})])

	assert.equal(result.status, 1)
	assert.match(result.stderr, /ios-chrome-latest recorded browserName webkit, expected chrome/)
})

test('rejects a remote target row with the wrong provider device metadata', () => {
	const result = runChecker([remoteChromePreviousRow({
		remoteDeviceName: 'Google Pixel 9',
		remoteOsVersion: '15.0',
	})])

	assert.equal(result.status, 1)
	assert.match(result.stderr, /android-chrome-previous recorded device Google Pixel 9, expected Google Pixel 8/)
	assert.match(result.stderr, /android-chrome-previous recorded OS version 15\.0, expected 14\.0/)
})

test('rejects a remote target row without remote-provider evidence source', () => {
	const result = runChecker([remoteChromePreviousRow({ compatibilitySource: 'android-local' })])

	assert.equal(result.status, 1)
	assert.match(result.stderr, /android-chrome-previous must be recorded from remote-provider evidence/)
})

test('rejects a failed remote target row without remote-provider evidence source', () => {
	const result = runChecker([remoteChromePreviousRow({
		compatibilitySource: 'local-playwright',
		status: 'failed',
		reportRunStatus: 'failed',
		artifactValidationStatus: 'failed',
		failureMessage: 'provider run failed',
	})])

	assert.equal(result.status, 1)
	assert.match(result.stderr, /android-chrome-previous must be recorded from remote-provider evidence/)
})

test('rejects a passed remote target row without user-agent evidence', () => {
	const result = runChecker([remoteChromePreviousRow({ capabilities: {
		webAssemblyValidate: true,
		worker: true,
		file: true,
		indexedDB: true,
	} })])

	assert.equal(result.status, 1)
	assert.match(result.stderr, /android-chrome-previous passed without user-agent evidence/)
})

test('rejects a passed row without the full required capability probe', () => {
	const result = runChecker([remoteChromePreviousRow({
		capabilities: capabilityProbe({
			moduleWorker: false,
		}),
	})])

	assert.equal(result.status, 1)
	assert.match(result.stderr, /android-chrome-previous did not report module Worker support/)
})

test('rejects any row without capability probe output', () => {
	const result = runChecker([remoteChromePreviousRow({
		status: 'failed',
		failureMessage: 'provider run failed',
		capabilities: undefined,
	})])

	assert.equal(result.status, 1)
	assert.match(result.stderr, /android-chrome-previous is missing capability probe output/)
})

test('rejects capability probe output with missing boolean flags', () => {
	const result = runChecker([remoteChromePreviousRow({
		status: 'failed',
		failureMessage: 'provider run failed',
		capabilities: capabilityProbe({
			readableStream: undefined,
		}),
	})])

	assert.equal(result.status, 1)
	assert.match(result.stderr, /android-chrome-previous capability probe is missing boolean readableStream/)
})

test('rejects capability probe failures with non-string entries', () => {
	const result = runChecker([remoteChromePreviousRow({
		status: 'failed',
		failureMessage: 'provider run failed',
		capabilities: capabilityProbe({
			failures: ['worker probe timed out', 123],
		}),
	})])

	assert.equal(result.status, 1)
	assert.match(result.stderr, /android-chrome-previous capability failures must contain only strings/)
})

test('rejects a passed row with capability probe failures', () => {
	const result = runChecker([remoteChromePreviousRow({
		capabilities: capabilityProbe({
			failures: ['worker probe timed out'],
		}),
	})])

	assert.equal(result.status, 1)
	assert.match(result.stderr, /android-chrome-previous capability probe reported failures: worker probe timed out/)
})

test('rejects a passed row with relevant console or page errors', () => {
	const result = runChecker([remoteChromePreviousRow({
		consoleErrors: ['console.error: RuntimeError: unreachable'],
	})])

	assert.equal(result.status, 1)
	assert.match(result.stderr, /android-chrome-previous has relevant console\/page errors: console\.error: RuntimeError: unreachable/)
})

test('rejects a passed row without artifact name evidence', () => {
	const result = runChecker([remoteChromePreviousRow({
		artifactNames: undefined,
	})])

	assert.equal(result.status, 1)
	assert.match(result.stderr, /android-chrome-previous is missing artifactNames evidence/)
})

test('rejects a passed row missing required artifact names', () => {
	const result = runChecker([remoteChromePreviousRow({
		artifactNames: ['observations.tsv', 'analysis.jsonl', 'index.html'],
	})])

	assert.equal(result.status, 1)
	assert.match(result.stderr, /android-chrome-previous did not record required artifact\(s\): reports\.jsonl/)
})

test('rejects rows with unsupported report or artifact status values', () => {
	const result = runChecker([remoteChromePreviousRow({
		status: 'failed',
		reportRunStatus: 'timed-out',
		artifactValidationStatus: 'unknown',
		failureMessage: 'provider run failed',
	})])

	assert.equal(result.status, 1)
	assert.match(result.stderr, /android-chrome-previous has unsupported reportRunStatus: timed-out/)
	assert.match(result.stderr, /android-chrome-previous has unsupported artifactValidationStatus: unknown/)
})

test('rejects rows missing required result metadata', () => {
	const result = runChecker([remoteChromePreviousRow({
		engine: '',
		os: { platform: 'linux', release: '', arch: 'x64' },
	})])

	assert.equal(result.status, 1)
	assert.match(result.stderr, /android-chrome-previous is missing engine/)
	assert.match(result.stderr, /android-chrome-previous is missing os\.release/)
})

test('rejects rows with project and engine mismatches', () => {
	const result = runChecker([remoteChromePreviousRow({
		remoteTargetId: 'android-firefox-latest',
		projectName: 'firefox',
		browserName: 'firefox',
		remoteBrowser: 'firefox',
		remoteBrowserVersionLabel: 'latest',
		engine: 'chromium',
		capabilities: capabilityProbe({
			userAgent: 'Mozilla/5.0 (Android 15; Mobile; rv:150.0) Gecko/150.0 Firefox/150.0',
		}),
	})])

	assert.equal(result.status, 1)
	assert.match(result.stderr, /android-firefox-latest recorded engine chromium, expected firefox for project firefox/)
})

test('rejects duplicate result ids', () => {
	const result = runChecker([
		remoteChromePreviousRow({ id: 'duplicated-result-id' }),
		remoteChromePreviousRow({
			id: 'duplicated-result-id',
			remoteTargetId: 'android-chrome-latest',
			remoteBrowserVersionLabel: 'latest',
			browserVersion: '148.0.0.0',
		}),
	])

	assert.equal(result.status, 1)
	assert.match(result.stderr, /android-chrome-latest duplicates result id duplicated-result-id/)
})

test('rejects rows that do not use the required compatibility sample', () => {
	const result = runChecker([remoteChromePreviousRow({
		sampleId: 'NA06985-vcf',
	})])

	assert.equal(result.status, 1)
	assert.match(result.stderr, /android-chrome-previous used sampleId NA06985-vcf, expected 23andme-v5-hu50B3F5/)
})

test('allows the required compatibility sample to be overridden explicitly', () => {
	const result = runChecker([remoteChromePreviousRow({
		sampleId: 'NA06985-vcf',
	})], {
		WEB_COMPAT_REQUIRED_SAMPLE_ID: 'NA06985-vcf',
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
})

test('rejects rows with invalid or inconsistent timing metadata', () => {
	const invalid = runChecker([remoteChromePreviousRow({
		startedAt: 'not-a-date',
	})])
	assert.equal(invalid.status, 1)
	assert.match(invalid.stderr, /android-chrome-previous has invalid startedAt timestamp/)

	const backwards = runChecker([remoteChromePreviousRow({
		startedAt: '2026-05-17T00:00:02.000Z',
		finishedAt: '2026-05-17T00:00:01.000Z',
		durationMs: 1000,
	})])
	assert.equal(backwards.status, 1)
	assert.match(backwards.stderr, /android-chrome-previous finishedAt is before startedAt/)

	const mismatched = runChecker([remoteChromePreviousRow({
		durationMs: 12_000,
	})])
	assert.equal(mismatched.status, 1)
	assert.match(mismatched.stderr, /durationMs 12000 does not match startedAt\/finishedAt interval 1000/)
})

test('rejects any row without console and page error evidence', () => {
	const result = runChecker([remoteChromePreviousRow({
		status: 'failed',
		failureMessage: 'provider run failed',
		consoleErrors: undefined,
	})])

	assert.equal(result.status, 1)
	assert.match(result.stderr, /android-chrome-previous consoleErrors must be an array/)
})

test('rejects console and page error evidence with non-string entries', () => {
	const result = runChecker([remoteChromePreviousRow({
		consoleErrors: ['warning text', 123],
	})])

	assert.equal(result.status, 1)
	assert.match(result.stderr, /android-chrome-previous consoleErrors must contain only strings/)
})

test('rejects rows without an evidence source', () => {
	const result = runChecker([remoteChromePreviousRow({ compatibilitySource: undefined })])

	assert.equal(result.status, 1)
	assert.match(result.stderr, /android-chrome-previous is missing compatibilitySource/)
})

test('rejects rows with an unsupported evidence source', () => {
	const result = runChecker([remoteChromePreviousRow({ compatibilitySource: 'provider-ish' })])

	assert.equal(result.status, 1)
	assert.match(result.stderr, /android-chrome-previous has unsupported compatibilitySource: provider-ish/)
})

test('rejects android-local target rows without android-local source', () => {
	const result = runChecker([androidLocalRow({ compatibilitySource: 'local-playwright' })])

	assert.equal(result.status, 1)
	assert.match(result.stderr, /android-local must be recorded from android-local evidence/)
})

test('rejects android-local source on non-android-local targets', () => {
	const result = runChecker([androidLocalRow({ remoteTargetId: 'chromium-cache-96' })])

	assert.equal(result.status, 1)
	assert.match(result.stderr, /chromium-cache-96 has android-local evidence source but target is not android-local/)
})

test('required local projects cannot be satisfied by provider target rows', () => {
	const result = runChecker([remoteChromePreviousRow()], {
		WEB_COMPAT_REQUIRED_PROJECTS: 'chromium',
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /missing passing local compatibility project: chromium/)
})

test('validates remote target metadata against an overridden remote matrix', () => {
	const matrixFile = writeRemoteMatrix({
		id: 'android-custom-browser',
		platform: 'android',
		browser: 'firefox',
		version: 'latest',
		project: 'firefox',
		required: true,
	})
	const valid = runChecker([
		remoteChromePreviousRow({
			remoteTargetId: 'android-custom-browser',
			projectName: 'firefox',
			browserName: 'firefox',
			browserVersion: '150.0',
			engine: 'firefox',
			remoteBrowser: 'firefox',
			remoteBrowserVersionLabel: 'latest',
			capabilities: capabilityProbe({
				userAgent: 'Mozilla/5.0 (Android 15; Mobile; rv:150.0) Gecko/150.0 Firefox/150.0',
			}),
		}),
	], {
		WEB_COMPAT_REMOTE_MATRIX_FILE: matrixFile,
		WEB_COMPAT_REQUIRED_TARGETS: 'android-custom-browser',
	})
	assert.equal(valid.status, 0, valid.stderr || valid.stdout)

	const invalid = runChecker([
		remoteChromePreviousRow({
			remoteTargetId: 'android-custom-browser',
			remoteBrowser: 'chrome',
			remoteBrowserVersionLabel: 'latest',
		}),
	], {
		WEB_COMPAT_REMOTE_MATRIX_FILE: matrixFile,
		WEB_COMPAT_REQUIRED_TARGETS: 'android-custom-browser',
	})
	assert.equal(invalid.status, 1)
	assert.match(invalid.stderr, /android-custom-browser recorded browser chrome, expected firefox/)
})

test('accepts a required Markdown summary that matches the result row count', () => {
	const row = remoteChromePreviousRow()
	const summaryFile = writeSummary([row])
	const result = runChecker([row], {
		WEB_COMPAT_REQUIRE_RESULTS_MD: '1',
		WEB_COMPAT_RESULTS_MD_FILE: summaryFile,
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
})

test('rejects a missing required Markdown summary', () => {
	const result = runChecker([remoteChromePreviousRow()], {
		WEB_COMPAT_REQUIRE_RESULTS_MD: '1',
		WEB_COMPAT_RESULTS_MD_FILE: path.join(os.tmpdir(), `missing-browser-compat-summary-${process.pid}.md`),
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /missing Markdown compatibility summary/)
})

test('rejects a stale required Markdown summary row count', () => {
	const summaryFile = writeSummary([])
	const result = runChecker([remoteChromePreviousRow()], {
		WEB_COMPAT_REQUIRE_RESULTS_MD: '1',
		WEB_COMPAT_RESULTS_MD_FILE: summaryFile,
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /has 0 result row\(s\), expected 1/)
})

function remoteChromePreviousRow(overrides = {}) {
	return {
		...baseMetadata('android-chrome-previous'),
		remoteTargetId: 'android-chrome-previous',
		compatibilitySource: 'remote-provider',
		projectName: 'chromium',
		remotePlatform: 'android',
		remoteBrowser: 'chrome',
		remoteBrowserVersionLabel: 'previous-major',
		remoteDeviceName: 'Google Pixel 8',
		remoteOsVersion: '14.0',
		browserName: 'chrome',
		browserVersion: '147.0.0.0',
		status: 'passed',
		reportRunStatus: 'passed',
		artifactValidationStatus: 'passed',
		artifactNames: ['observations.tsv', 'analysis.jsonl', 'reports.jsonl', 'index.html'],
		capabilities: capabilityProbe({
			userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36',
		}),
		consoleErrors: [],
		...overrides,
	}
}

function androidLocalRow(overrides = {}) {
	return {
		...baseMetadata('android-local'),
		remoteTargetId: 'android-local',
		compatibilitySource: 'android-local',
		projectName: 'android-local',
		browserName: 'android-chrome',
		browserVersion: '133.0.0.0',
		status: 'passed',
		reportRunStatus: 'passed',
		artifactValidationStatus: 'passed',
		capabilities: capabilityProbe(),
		consoleErrors: [],
		...overrides,
	}
}

function baseMetadata(id) {
	return {
		id: `${id}-23andme-v5-hu50B3F5-1`,
		startedAt: '2026-05-17T00:00:00.000Z',
		finishedAt: '2026-05-17T00:00:01.000Z',
		durationMs: 1000,
		sampleId: '23andme-v5-hu50B3F5',
		engine: 'chromium',
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

function runChecker(rows, env = {}) {
	const file = path.join(os.tmpdir(), `biovault-browser-compat-results-${process.pid}-${tempFiles.length}.json`)
	tempFiles.push(file)
	fs.writeFileSync(file, JSON.stringify(rows, null, 2))
	return spawnSync(process.execPath, [checker], {
		cwd: root,
		encoding: 'utf8',
		env: {
			...process.env,
			WEB_COMPAT_RESULTS_FILE: file,
			WEB_COMPAT_REQUIRED_PROJECTS: '',
			WEB_COMPAT_REQUIRED_TARGETS: '',
			...env,
		},
	})
}

function writeRemoteMatrix(target) {
	const file = path.join(os.tmpdir(), `biovault-browser-compat-remote-matrix-${process.pid}-${tempFiles.length}.yaml`)
	tempFiles.push(file)
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

function writeSummary(rows) {
	const file = path.join(os.tmpdir(), `biovault-browser-compat-results-${process.pid}-${tempFiles.length}.md`)
	tempFiles.push(file)
	fs.writeFileSync(file, [
		'# Browser Compatibility Results',
		'',
		'| Status | Target | Source | Project | Browser | Version | Device | OS | Secure | WASM | Worker | Report | Artifacts | Failure |',
		'| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
		...rows.map((row) => `| ${row.status} | ${row.remoteTargetId ?? ''} | ${row.compatibilitySource} | ${row.projectName} | ${row.browserName} | ${row.browserVersion} | ${row.remoteDeviceName ?? row.deviceProfile ?? ''} | ${row.remoteOsVersion ?? ''} | yes | yes | yes | ${row.reportRunStatus} | ${row.artifactValidationStatus} |  |`),
		'',
	].join('\n'))
	return file
}
