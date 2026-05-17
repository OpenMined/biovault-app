import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, test } from 'node:test'

const root = path.resolve(import.meta.dirname, '..')
const checker = path.join(root, 'scripts/check-browser-compat-infra.mjs')
const tempDirs = []
const androidTargets = [
	'android-chrome-latest',
	'android-chrome-previous',
	'android-firefox-latest',
	'android-samsung-internet-latest',
]

afterEach(() => {
	for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { force: true, recursive: true })
})

test('remote Android requirement accepts complete wss endpoints', () => {
	const result = runInfra({
		WEB_COMPAT_REQUIRE_REMOTE_ANDROID: '1',
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: JSON.stringify(Object.fromEntries(androidTargets.map((id) => [
			id,
			`wss://cdp.browserstack.com/playwright?target=${id}`,
		]))),
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.match(result.stdout, /android-samsung-internet-latest: available/)
})

test('remote Android requirement accepts a default endpoint for selected targets', () => {
	const result = runInfra({
		WEB_COMPAT_REQUIRE_REMOTE_ANDROID: '1',
		WEB_COMPAT_REMOTE_TARGETS: 'android-chrome-latest,android-firefox-latest',
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: JSON.stringify({
			default: 'wss://cdp.browserstack.com/playwright',
		}),
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.match(result.stdout, /android-chrome-latest: available/)
	assert.match(result.stdout, /android-firefox-latest: available/)
	assert.doesNotMatch(result.stdout, /android-samsung-internet-latest/)
})

test('remote Android requirement accepts endpoints from a local JSON file', () => {
	const file = writeEndpointFile({
		default: 'wss://cdp.browserstack.com/playwright',
	})
	const result = runInfra({
		WEB_COMPAT_REQUIRE_REMOTE_ANDROID: '1',
		WEB_COMPAT_REMOTE_TARGETS: 'android-chrome-latest',
		WEB_COMPAT_REMOTE_ENDPOINTS_FILE: file,
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.match(result.stdout, /android-chrome-latest: available/)
})

test('remote Android requirement accepts endpoints from the repository-named file alias', () => {
	const file = writeEndpointFile({
		default: 'wss://cdp.browserstack.com/playwright',
	})
	const result = runInfra({
		WEB_COMPAT_REQUIRE_REMOTE_ANDROID: '1',
		WEB_COMPAT_REMOTE_TARGETS: 'android-chrome-latest',
		BROWSER_COMPAT_REMOTE_ENDPOINTS_FILE: file,
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.match(result.stdout, /android-chrome-latest: available/)
})

test('remote Android requirement accepts endpoints from the default local JSON file', () => {
	const file = writeEndpointFile({
		default: 'wss://cdp.browserstack.com/playwright',
	})
	const result = runInfra({
		WEB_COMPAT_REQUIRE_REMOTE_ANDROID: '1',
		WEB_COMPAT_REMOTE_TARGETS: 'android-chrome-latest',
		WEB_COMPAT_REMOTE_ENDPOINTS_DEFAULT_FILE: file,
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.match(result.stdout, /android-chrome-latest: available/)
})

test('remote provider defaults use completion remote targets instead of every matrix target', () => {
	const fixture = createTargetFixture({
		matrixTargets: ['android-chrome-latest', 'android-firefox-latest'],
		completionTargets: ['android-chrome-latest'],
	})
	const result = runInfra({
		WEB_COMPAT_REMOTE_MATRIX_FILE: fixture.matrixFile,
		WEB_COMPAT_COMPLETION_FILE: fixture.completionFile,
		WEB_COMPAT_VERSION_MATRIX_FILE: fixture.versionFile,
		WEB_COMPAT_REQUIRE_REMOTE_ANDROID: '1',
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: JSON.stringify({
			'android-chrome-latest': 'wss://cdp.browserstack.com/playwright?target=android-chrome-latest',
		}),
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.match(result.stdout, /android-chrome-latest: available/)
	assert.doesNotMatch(result.stdout, /android-firefox-latest/)
})

test('remote provider requires selected matrix targets outside completion scope', () => {
	const fixture = createTargetFixture({
		matrixTargets: ['android-chrome-latest', 'android-firefox-latest'],
		completionTargets: ['android-chrome-latest'],
	})
	const result = runInfra({
		WEB_COMPAT_REMOTE_MATRIX_FILE: fixture.matrixFile,
		WEB_COMPAT_COMPLETION_FILE: fixture.completionFile,
		WEB_COMPAT_VERSION_MATRIX_FILE: fixture.versionFile,
		WEB_COMPAT_REQUIRE_REMOTE_ANDROID: '1',
		WEB_COMPAT_REMOTE_TARGETS: 'android-firefox-latest',
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: JSON.stringify({
			'android-chrome-latest': 'wss://cdp.browserstack.com/playwright?target=android-chrome-latest',
		}),
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /invalid remote Android endpoint for android-firefox-latest: missing/)
})

test('remote provider requirement reports endpoint input options when endpoints are missing', () => {
	const result = runInfra({
		WEB_COMPAT_REQUIRE_REMOTE_ANDROID: '1',
		WEB_COMPAT_REMOTE_TARGETS: 'android-chrome-latest',
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /invalid remote Android endpoint for android-chrome-latest: missing/)
	assert.match(result.stderr, /WEB_COMPAT_REMOTE_ENDPOINTS_JSON/)
	assert.match(result.stderr, /browser-compat-endpoints\.json/)
	assert.match(result.stderr, /WEB_COMPAT_REMOTE_ENDPOINTS_FILE/)
	assert.match(result.stderr, /BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON/)
	assert.match(result.stderr, /BROWSER_COMPAT_REMOTE_ENDPOINTS_FILE/)
})

test('remote provider rejects completion targets missing from the remote matrix', () => {
	const fixture = createTargetFixture({
		matrixTargets: ['android-chrome-latest'],
		completionTargets: ['android-firefox-latest'],
	})
	const result = runInfra({
		WEB_COMPAT_REMOTE_MATRIX_FILE: fixture.matrixFile,
		WEB_COMPAT_COMPLETION_FILE: fixture.completionFile,
		WEB_COMPAT_VERSION_MATRIX_FILE: fixture.versionFile,
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: JSON.stringify({
			'android-chrome-latest': 'wss://cdp.browserstack.com/playwright?target=android-chrome-latest',
		}),
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /completion contract remote target android-firefox-latest is missing from the remote matrix/)
})

test('remote Android requirement rejects invalid endpoint JSON files', () => {
	const dir = tempDir()
	const file = path.join(dir, 'endpoints.json')
	fs.writeFileSync(file, '{')
	const result = runInfra({
		WEB_COMPAT_REQUIRE_REMOTE_ANDROID: '1',
		WEB_COMPAT_REMOTE_TARGETS: 'android-chrome-latest',
		WEB_COMPAT_REMOTE_ENDPOINTS_FILE: file,
	})

	assert.equal(result.status, 2)
	assert.match(result.stderr, /endpoint file is not valid JSON/)
})

test('remote Android requirement rejects endpoint JSON files that are not objects', () => {
	const file = writeEndpointFile([])
	const result = runInfra({
		WEB_COMPAT_REQUIRE_REMOTE_ANDROID: '1',
		WEB_COMPAT_REMOTE_ENDPOINTS_FILE: file,
	})

	assert.equal(result.status, 2)
	assert.match(result.stderr, /endpoint file must be a JSON object keyed by remote target id/)
})

test('remote provider endpoint maps reject unknown target ids', () => {
	const result = runInfra({
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: JSON.stringify({
			'android-crome-latest': 'wss://cdp.browserstack.com/playwright',
		}),
	})

	assert.equal(result.status, 2)
	assert.match(result.stderr, /unknown remote target id\(s\): android-crome-latest/)
})

test('remote Android requirement rejects a default endpoint with a template host', () => {
	const result = runInfra({
		WEB_COMPAT_REQUIRE_REMOTE_ANDROID: '1',
		WEB_COMPAT_REMOTE_TARGETS: 'android-firefox-latest',
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: JSON.stringify({
			default: 'wss://provider.example/playwright',
		}),
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /invalid remote Android endpoint for android-firefox-latest: wsEndpoint still points at template host provider\.example/)
})

test('remote Android requirement rejects non-wss endpoints', () => {
	const endpoints = Object.fromEntries(androidTargets.map((id) => [id, `wss://cdp.browserstack.com/playwright?target=${id}`]))
	endpoints['android-chrome-latest'] = 'http://provider.example/playwright'
	const result = runInfra({
		WEB_COMPAT_REQUIRE_REMOTE_ANDROID: '1',
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: JSON.stringify(endpoints),
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /invalid remote Android endpoint for android-chrome-latest: wsEndpoint must start with wss:\/\//)
})

test('remote Android requirement rejects checked-in template endpoint hosts', () => {
	const endpoints = Object.fromEntries(androidTargets.map((id) => [id, `wss://cdp.browserstack.com/playwright?target=${id}`]))
	endpoints['android-chrome-latest'] = 'wss://provider.example/playwright?target=android-chrome-latest'
	const result = runInfra({
		WEB_COMPAT_REQUIRE_REMOTE_ANDROID: '1',
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: JSON.stringify(endpoints),
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /invalid remote Android endpoint for android-chrome-latest: wsEndpoint still points at template host provider\.example/)
})

test('remote Android requirement rejects unresolved endpoint placeholders', () => {
	const endpoints = Object.fromEntries(androidTargets.map((id) => [id, `wss://cdp.browserstack.com/playwright?target=${id}`]))
	endpoints['android-chrome-latest'] = {
		wsEndpoint: 'wss://cdp.browserstack.com/playwright?target=android-chrome-latest',
		headers: { Authorization: 'Bearer ${BROWSER_PROVIDER_TOKEN}' },
	}
	const result = runInfra({
		WEB_COMPAT_REQUIRE_REMOTE_ANDROID: '1',
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: JSON.stringify(endpoints),
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /invalid remote Android endpoint for android-chrome-latest: missing env BROWSER_PROVIDER_TOKEN/)
})

test('remote Android requirement accepts a full endpoint environment placeholder', () => {
	const result = runInfra({
		WEB_COMPAT_REQUIRE_REMOTE_ANDROID: '1',
		WEB_COMPAT_REMOTE_TARGETS: 'android-chrome-latest',
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: JSON.stringify({
			'android-chrome-latest': '${BROWSER_PROVIDER_WS}',
		}),
		BROWSER_PROVIDER_WS: 'wss://cdp.browserstack.com/playwright?target=android-chrome-latest',
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.match(result.stdout, /android-chrome-latest: available/)
})

test('remote Android requirement rejects full endpoint placeholders that resolve to template hosts', () => {
	const result = runInfra({
		WEB_COMPAT_REQUIRE_REMOTE_ANDROID: '1',
		WEB_COMPAT_REMOTE_TARGETS: 'android-chrome-latest',
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: JSON.stringify({
			'android-chrome-latest': '${BROWSER_PROVIDER_WS}',
		}),
		BROWSER_PROVIDER_WS: 'wss://provider.example/playwright?target=android-chrome-latest',
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /invalid remote Android endpoint for android-chrome-latest: wsEndpoint still points at template host provider\.example/)
})

test('remote Android requirement respects selected remote targets', () => {
	const result = runInfra({
		WEB_COMPAT_REQUIRE_REMOTE_ANDROID: '1',
		WEB_COMPAT_REMOTE_TARGETS: 'android-firefox-latest',
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: JSON.stringify({
			'android-firefox-latest': 'wss://cdp.browserstack.com/playwright?target=android-firefox-latest',
		}),
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.match(result.stdout, /android-firefox-latest: available/)
	assert.doesNotMatch(result.stdout, /android-chrome-latest/)
})

test('selected deferred remote targets require explicit opt in', () => {
	const result = runInfra({
		WEB_COMPAT_REMOTE_TARGETS: 'ios-safari-latest',
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: JSON.stringify({
			'ios-safari-latest': 'wss://cdp.browserstack.com/playwright?target=ios-safari-latest',
		}),
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /selected deferred remote target ios-safari-latest requires WEB_COMPAT_INCLUDE_DEFERRED=1/)
})

test('selected deferred remote targets pass preflight when explicitly included', () => {
	const result = runInfra({
		WEB_COMPAT_INCLUDE_DEFERRED: '1',
		WEB_COMPAT_REMOTE_TARGETS: 'ios-safari-latest',
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: JSON.stringify({
			'ios-safari-latest': 'wss://cdp.browserstack.com/playwright?target=ios-safari-latest',
		}),
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.match(result.stdout, /ios-safari-latest: available/)
})

test('remote provider requirement rejects missing or local-only WEB_URL', () => {
	const missing = runInfra({
		WEB_URL: '',
		WEB_COMPAT_REQUIRE_REMOTE_ANDROID: '1',
		WEB_COMPAT_REMOTE_TARGETS: 'android-chrome-latest',
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: JSON.stringify({
			'android-chrome-latest': 'wss://cdp.browserstack.com/playwright?target=android-chrome-latest',
		}),
	})
	assert.equal(missing.status, 1)
	assert.match(missing.stderr, /invalid remote provider WEB_URL: missing/)

	const local = runInfra({
		WEB_URL: 'http://localhost:8081',
		WEB_COMPAT_REQUIRE_REMOTE_ANDROID: '1',
		WEB_COMPAT_REMOTE_TARGETS: 'android-chrome-latest',
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: JSON.stringify({
			'android-chrome-latest': 'wss://cdp.browserstack.com/playwright?target=android-chrome-latest',
		}),
	})
	assert.equal(local.status, 1)
	assert.match(local.stderr, /local-only host requires WEB_COMPAT_ALLOW_LOCAL_WEB_URL=1/)
})

test('remote provider requirement accepts local WEB_URL with explicit tunnel opt-in', () => {
	const result = runInfra({
		WEB_URL: 'http://localhost:8081',
		WEB_COMPAT_ALLOW_LOCAL_WEB_URL: '1',
		WEB_COMPAT_REQUIRE_REMOTE_ANDROID: '1',
		WEB_COMPAT_REMOTE_TARGETS: 'android-chrome-latest',
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: JSON.stringify({
			'android-chrome-latest': 'wss://cdp.browserstack.com/playwright?target=android-chrome-latest',
		}),
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.match(result.stdout, /WEB_URL: available/)
})

test('remote provider requirement can reject unreachable WEB_URL when reachability checking is enabled', () => {
	const result = runInfra({
		WEB_URL: 'http://127.0.0.1:9',
		WEB_COMPAT_ALLOW_LOCAL_WEB_URL: '1',
		WEB_COMPAT_CHECK_WEB_URL_REACHABLE: '1',
		WEB_COMPAT_REQUIRE_REMOTE_ANDROID: '1',
		WEB_COMPAT_REMOTE_TARGETS: 'android-chrome-latest',
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: JSON.stringify({
			'android-chrome-latest': 'wss://cdp.browserstack.com/playwright?target=android-chrome-latest',
		}),
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /invalid remote provider WEB_URL: unreachable/)
})

function runInfra(env) {
	return spawnSync(process.execPath, [checker], {
		cwd: root,
		encoding: 'utf8',
		env: {
			...process.env,
			WEB_COMPAT_REMOTE_ENDPOINTS_JSON: '',
			BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON: '',
			WEB_COMPAT_REMOTE_ENDPOINTS_FILE: '',
			BROWSER_COMPAT_REMOTE_ENDPOINTS_FILE: '',
			WEB_COMPAT_REMOTE_ENDPOINTS_DEFAULT_FILE: path.join(os.tmpdir(), `missing-browser-compat-endpoints-${process.pid}.json`),
			WEB_URL: 'https://preview.example.test/web',
			WEB_COMPAT_ALLOW_LOCAL_WEB_URL: '',
			...env,
		},
	})
}

function tempDir() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'biovault-infra-endpoints-'))
	tempDirs.push(dir)
	return dir
}

function writeEndpointFile(value) {
	const dir = tempDir()
	const file = path.join(dir, 'endpoints.json')
	fs.writeFileSync(file, JSON.stringify(value))
	return file
}

function createTargetFixture({ matrixTargets, completionTargets }) {
	const dir = tempDir()
	const matrixFile = path.join(dir, 'remote-matrix.yaml')
	const completionFile = path.join(dir, 'completion.yaml')
	const versionFile = path.join(dir, 'version-matrix.yaml')
	fs.writeFileSync(matrixFile, remoteMatrixYaml(matrixTargets))
	fs.writeFileSync(completionFile, completionYaml(completionTargets))
	fs.writeFileSync(versionFile, 'targets: []\n')
	return { matrixFile, completionFile, versionFile }
}

function remoteMatrixYaml(targetIds) {
	const metadata = {
		'android-chrome-latest': ['android', 'chrome', 'latest', 'chromium', 'true'],
		'android-firefox-latest': ['android', 'firefox', 'latest', 'firefox', 'true'],
	}
	return [
		'targets:',
		...targetIds.flatMap((targetId) => {
			const [platform, browser, version, project, required] = metadata[targetId]
			return [
				`  - id: ${targetId}`,
				`    platform: ${platform}`,
				`    browser: ${browser}`,
				`    version: ${version}`,
				`    project: ${project}`,
				`    required: ${required}`,
			]
		}),
		'',
	].join('\n')
}

function completionYaml(targetIds) {
	return [
		'remote_targets:',
		...targetIds.map((targetId) => `  - ${targetId}`),
		'',
	].join('\n')
}
