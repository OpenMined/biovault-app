import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach } from 'node:test'
import { test } from 'node:test'

const root = path.resolve(import.meta.dirname, '..')
const runner = path.join(root, 'scripts/run-remote-browser-compat-matrix.mjs')
const tempDirs = []

afterEach(() => {
	for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { force: true, recursive: true })
})

test('dry run allows endpoint templates with unresolved placeholders', () => {
	const result = runRemoteMatrix({
		WEB_COMPAT_REMOTE_DRY_RUN: '1',
		WEB_COMPAT_REMOTE_TARGETS: 'android-chrome-latest',
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: JSON.stringify({
			'android-chrome-latest': {
				wsEndpoint: 'wss://provider.example/playwright?target=android-chrome-latest',
				headers: { Authorization: 'Bearer ${BROWSER_PROVIDER_TOKEN}' },
			},
		}),
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.match(result.stdout, /Dry run remote browser compatibility: android-chrome-latest/)
})

test('dry run allows a full endpoint environment placeholder', () => {
	const result = runRemoteMatrix({
		WEB_COMPAT_REMOTE_DRY_RUN: '1',
		WEB_COMPAT_REMOTE_TARGETS: 'android-chrome-latest',
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: JSON.stringify({
			'android-chrome-latest': '${BROWSER_PROVIDER_WS}',
		}),
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.match(result.stdout, /Dry run remote browser compatibility: android-chrome-latest/)
})

test('dry run uses a default endpoint for selected targets', () => {
	const result = runRemoteMatrix({
		WEB_COMPAT_REMOTE_DRY_RUN: '1',
		WEB_COMPAT_REMOTE_TARGETS: 'android-chrome-latest,android-firefox-latest',
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: JSON.stringify({
			default: 'wss://provider.example/playwright',
		}),
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.match(result.stdout, /Dry run remote browser compatibility: android-chrome-latest/)
	assert.match(result.stdout, /Dry run remote browser compatibility: android-firefox-latest/)
	assert.doesNotMatch(result.stdout, /android-samsung-internet-latest/)
})

test('dry run reads endpoints from a local JSON file', () => {
	const file = writeEndpointFile({
		'android-chrome-latest': 'wss://provider.example/playwright?target=android-chrome-latest',
	})
	const result = runRemoteMatrix({
		WEB_COMPAT_REMOTE_DRY_RUN: '1',
		WEB_COMPAT_REMOTE_TARGETS: 'android-chrome-latest',
		WEB_COMPAT_REMOTE_ENDPOINTS_FILE: file,
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.match(result.stdout, /Dry run remote browser compatibility: android-chrome-latest/)
})

test('dry run reads endpoints from the repository-named file alias', () => {
	const file = writeEndpointFile({
		'android-chrome-latest': 'wss://provider.example/playwright?target=android-chrome-latest',
	})
	const result = runRemoteMatrix({
		WEB_COMPAT_REMOTE_DRY_RUN: '1',
		WEB_COMPAT_REMOTE_TARGETS: 'android-chrome-latest',
		BROWSER_COMPAT_REMOTE_ENDPOINTS_FILE: file,
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.match(result.stdout, /Dry run remote browser compatibility: android-chrome-latest/)
})

test('dry run reads endpoints from the default local JSON file', () => {
	const file = writeEndpointFile({
		'android-chrome-latest': 'wss://provider.example/playwright?target=android-chrome-latest',
	})
	const result = runRemoteMatrix({
		WEB_COMPAT_REMOTE_DRY_RUN: '1',
		WEB_COMPAT_REMOTE_TARGETS: 'android-chrome-latest',
		WEB_COMPAT_REMOTE_ENDPOINTS_DEFAULT_FILE: file,
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.match(result.stdout, /Dry run remote browser compatibility: android-chrome-latest/)
})

test('default dry run uses completion remote targets instead of every matrix target', () => {
	const fixture = createTargetFixture({
		matrixTargets: ['android-chrome-latest', 'android-firefox-latest'],
		completionTargets: ['android-chrome-latest'],
	})
	const result = runRemoteMatrix({
		WEB_COMPAT_REMOTE_DRY_RUN: '1',
		WEB_COMPAT_REMOTE_MATRIX_FILE: fixture.matrixFile,
		WEB_COMPAT_COMPLETION_FILE: fixture.completionFile,
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: JSON.stringify({
			default: 'wss://provider.example/playwright',
		}),
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.match(result.stdout, /Dry run remote browser compatibility: android-chrome-latest/)
	assert.doesNotMatch(result.stdout, /android-firefox-latest/)
})

test('selected dry run can run matrix targets outside completion scope', () => {
	const fixture = createTargetFixture({
		matrixTargets: ['android-chrome-latest', 'android-firefox-latest'],
		completionTargets: ['android-chrome-latest'],
	})
	const result = runRemoteMatrix({
		WEB_COMPAT_REMOTE_DRY_RUN: '1',
		WEB_COMPAT_REMOTE_MATRIX_FILE: fixture.matrixFile,
		WEB_COMPAT_COMPLETION_FILE: fixture.completionFile,
		WEB_COMPAT_REMOTE_TARGETS: 'android-firefox-latest',
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: JSON.stringify({
			default: 'wss://provider.example/playwright',
		}),
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.doesNotMatch(result.stdout, /android-chrome-latest/)
	assert.match(result.stdout, /Dry run remote browser compatibility: android-firefox-latest/)
})

test('rejects completion remote targets that are missing from the remote matrix', () => {
	const fixture = createTargetFixture({
		matrixTargets: ['android-chrome-latest'],
		completionTargets: ['android-firefox-latest'],
	})
	const result = runRemoteMatrix({
		WEB_COMPAT_REMOTE_DRY_RUN: '1',
		WEB_COMPAT_REMOTE_MATRIX_FILE: fixture.matrixFile,
		WEB_COMPAT_COMPLETION_FILE: fixture.completionFile,
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: JSON.stringify({
			default: 'wss://provider.example/playwright',
		}),
	})

	assert.equal(result.status, 2)
	assert.match(result.stderr, /Completion remote browser target\(s\) are missing from the remote matrix/)
	assert.match(result.stderr, /android-firefox-latest/)
})

test('reports all endpoint input options when required endpoints are missing', () => {
	const result = runRemoteMatrix({
		WEB_COMPAT_REMOTE_DRY_RUN: '1',
		WEB_COMPAT_REMOTE_TARGETS: 'android-chrome-latest',
	})

	assert.equal(result.status, 2)
	assert.match(result.stderr, /Missing remote browser endpoints/)
	assert.match(result.stderr, /android-chrome-latest/)
	assert.match(result.stderr, /WEB_COMPAT_REMOTE_ENDPOINTS_JSON/)
	assert.match(result.stderr, /browser-compat-endpoints\.json/)
	assert.match(result.stderr, /WEB_COMPAT_REMOTE_ENDPOINTS_FILE/)
	assert.match(result.stderr, /BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON/)
	assert.match(result.stderr, /BROWSER_COMPAT_REMOTE_ENDPOINTS_FILE/)
	assert.match(result.stderr, /WEB_COMPAT_ALLOW_MISSING_ENDPOINTS=1/)
})

test('rejects invalid local endpoint JSON files', () => {
	const dir = tempDir()
	const file = path.join(dir, 'endpoints.json')
	fs.writeFileSync(file, '{')
	const result = runRemoteMatrix({
		WEB_COMPAT_REMOTE_DRY_RUN: '1',
		WEB_COMPAT_REMOTE_TARGETS: 'android-chrome-latest',
		WEB_COMPAT_REMOTE_ENDPOINTS_FILE: file,
	})

	assert.equal(result.status, 2)
	assert.match(result.stderr, /endpoint file is not valid JSON/)
})

test('rejects endpoint JSON files that are not objects', () => {
	const file = writeEndpointFile([])
	const result = runRemoteMatrix({
		WEB_COMPAT_REMOTE_DRY_RUN: '1',
		WEB_COMPAT_REMOTE_ENDPOINTS_FILE: file,
	})

	assert.equal(result.status, 2)
	assert.match(result.stderr, /endpoint file must be a JSON object keyed by remote target id/)
})

test('real run rejects missing or empty endpoint placeholders before launching', () => {
	const missing = runRemoteMatrix({
		WEB_URL: 'https://preview.example.test/web',
		WEB_COMPAT_REMOTE_TARGETS: 'android-chrome-latest',
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: JSON.stringify({
			'android-chrome-latest': {
				wsEndpoint: 'wss://provider.example/playwright?target=android-chrome-latest',
				headers: { Authorization: 'Bearer ${BROWSER_PROVIDER_TOKEN}' },
			},
		}),
	})
	assert.equal(missing.status, 2)
	assert.match(missing.stderr, /missing environment variable BROWSER_PROVIDER_TOKEN/)

	const empty = runRemoteMatrix({
		WEB_URL: 'https://preview.example.test/web',
		BROWSER_PROVIDER_TOKEN: '',
		WEB_COMPAT_REMOTE_TARGETS: 'android-chrome-latest',
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: JSON.stringify({
			'android-chrome-latest': {
				wsEndpoint: 'wss://provider.example/playwright?target=android-chrome-latest',
				headers: { Authorization: 'Bearer ${BROWSER_PROVIDER_TOKEN}' },
			},
		}),
	})
	assert.equal(empty.status, 2)
	assert.match(empty.stderr, /missing environment variable BROWSER_PROVIDER_TOKEN/)
})

test('real run rejects local WEB_URL unless explicitly allowed', () => {
	const blocked = runRemoteMatrix({
		WEB_URL: 'http://localhost:8081',
		WEB_COMPAT_REMOTE_TARGETS: 'android-chrome-latest',
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: JSON.stringify({
			'android-chrome-latest': 'wss://remote.example.test/playwright?target=android-chrome-latest',
		}),
	})
	assert.equal(blocked.status, 2)
	assert.match(blocked.stderr, /local-only host/)
	assert.match(blocked.stderr, /WEB_COMPAT_ALLOW_LOCAL_WEB_URL=1/)

	const binDir = tempDir()
	const fakeNpm = path.join(binDir, 'npm')
	fs.writeFileSync(fakeNpm, '#!/usr/bin/env bash\nexit 0\n')
	fs.chmodSync(fakeNpm, 0o755)
	const allowed = runRemoteMatrix({
		WEB_URL: 'http://localhost:8081',
		WEB_COMPAT_ALLOW_LOCAL_WEB_URL: '1',
		WEB_COMPAT_OUTPUT_DIR: tempDir(),
		WEB_COMPAT_REMOTE_TARGETS: 'android-chrome-latest',
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: JSON.stringify({
			'android-chrome-latest': 'wss://remote.example.test/playwright?target=android-chrome-latest',
		}),
		PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
	})
	assert.equal(allowed.status, 0, allowed.stderr || allowed.stdout)
	assert.doesNotMatch(allowed.stderr, /local-only host/)
})

test('dry run rejects non-wss endpoints', () => {
	const result = runRemoteMatrix({
		WEB_COMPAT_REMOTE_DRY_RUN: '1',
		WEB_COMPAT_REMOTE_TARGETS: 'android-chrome-latest',
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: JSON.stringify({
			'android-chrome-latest': 'http://provider.example/playwright',
		}),
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /endpoint must start with wss:\/\//)
})

test('real run rejects checked-in template endpoint hosts before launching', () => {
	const outputDir = tempDir()
	fs.mkdirSync(outputDir, { recursive: true })
	const sentinel = path.join(outputDir, 'results.json')
	fs.writeFileSync(sentinel, '[]\n')
	const result = runRemoteMatrix({
		WEB_URL: 'https://preview.example.test/web',
		WEB_COMPAT_OUTPUT_DIR: outputDir,
		WEB_COMPAT_REMOTE_TARGETS: 'android-chrome-latest',
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: JSON.stringify({
			'android-chrome-latest': 'wss://provider.example/playwright?target=android-chrome-latest',
		}),
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /provider\.example/)
	assert.equal(fs.readFileSync(sentinel, 'utf8'), '[]\n')
})

test('real run rejects a default endpoint that points at the template host', () => {
	const outputDir = tempDir()
	fs.mkdirSync(outputDir, { recursive: true })
	const sentinel = path.join(outputDir, 'results.json')
	fs.writeFileSync(sentinel, '[]\n')
	const result = runRemoteMatrix({
		WEB_URL: 'https://preview.example.test/web',
		WEB_COMPAT_OUTPUT_DIR: outputDir,
		WEB_COMPAT_REMOTE_TARGETS: 'android-firefox-latest',
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: JSON.stringify({
			default: 'wss://provider.example/playwright',
		}),
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /android-firefox-latest: endpoint still points at template host provider\.example/)
	assert.equal(fs.readFileSync(sentinel, 'utf8'), '[]\n')
})

test('real run passes remote target metadata to the compatibility wrapper', () => {
	const outputDir = tempDir()
	const binDir = tempDir()
	const captureFile = path.join(tempDir(), 'child-env.txt')
	const fakeNpm = path.join(binDir, 'npm')
	fs.writeFileSync(fakeNpm, [
		'#!/usr/bin/env bash',
		'{',
		'  echo "args=$*"',
		'  echo "WEB_URL=$WEB_URL"',
		'  echo "PW_CONNECT_WS_ENDPOINT=$PW_CONNECT_WS_ENDPOINT"',
		'  echo "PW_CONNECT_HEADERS_JSON=$PW_CONNECT_HEADERS_JSON"',
		'  echo "PW_BROWSER_PROJECTS=$PW_BROWSER_PROJECTS"',
		'  echo "WEB_COMPAT_APPEND_RESULTS=$WEB_COMPAT_APPEND_RESULTS"',
		'  echo "WEB_COMPAT_REMOTE_TARGET_ID=$WEB_COMPAT_REMOTE_TARGET_ID"',
		'  echo "WEB_COMPAT_REMOTE_PLATFORM=$WEB_COMPAT_REMOTE_PLATFORM"',
		'  echo "WEB_COMPAT_REMOTE_BROWSER=$WEB_COMPAT_REMOTE_BROWSER"',
		'  echo "WEB_COMPAT_REMOTE_BROWSER_VERSION=$WEB_COMPAT_REMOTE_BROWSER_VERSION"',
		'  echo "WEB_COMPAT_REMOTE_DEVICE_NAME=$WEB_COMPAT_REMOTE_DEVICE_NAME"',
		'  echo "WEB_COMPAT_REMOTE_OS_VERSION=$WEB_COMPAT_REMOTE_OS_VERSION"',
		'} > "$REMOTE_MATRIX_ENV_CAPTURE"',
		'exit 0',
		'',
	].join('\n'))
	fs.chmodSync(fakeNpm, 0o755)
	const result = runRemoteMatrix({
		WEB_URL: 'https://preview.example.test/web',
		WEB_COMPAT_OUTPUT_DIR: outputDir,
		WEB_COMPAT_REMOTE_TARGETS: 'android-firefox-latest',
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: JSON.stringify({
			'android-firefox-latest': {
				wsEndpoint: 'wss://remote.example.test/playwright?target=android-firefox-latest',
				headers: { Authorization: 'Bearer test-token' },
			},
		}),
		REMOTE_MATRIX_ENV_CAPTURE: captureFile,
		PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.match(result.stdout, /Remote browser compatibility: android-firefox-latest/)
	const childEnv = fs.readFileSync(captureFile, 'utf8')
	assert.match(childEnv, /^args=run test:web-compat:remote$/m)
	assert.match(childEnv, /^WEB_URL=https:\/\/preview\.example\.test\/web$/m)
	assert.match(childEnv, /^PW_CONNECT_WS_ENDPOINT=wss:\/\/remote\.example\.test\/playwright\?target=android-firefox-latest$/m)
	assert.match(childEnv, /^PW_CONNECT_HEADERS_JSON=\{"Authorization":"Bearer test-token"\}$/m)
	assert.match(childEnv, /^PW_BROWSER_PROJECTS=firefox$/m)
	assert.match(childEnv, /^WEB_COMPAT_APPEND_RESULTS=1$/m)
	assert.match(childEnv, /^WEB_COMPAT_REMOTE_TARGET_ID=android-firefox-latest$/m)
	assert.match(childEnv, /^WEB_COMPAT_REMOTE_PLATFORM=android$/m)
	assert.match(childEnv, /^WEB_COMPAT_REMOTE_BROWSER=firefox$/m)
	assert.match(childEnv, /^WEB_COMPAT_REMOTE_BROWSER_VERSION=latest$/m)
	assert.match(childEnv, /^WEB_COMPAT_REMOTE_DEVICE_NAME=Google Pixel 9$/m)
	assert.match(childEnv, /^WEB_COMPAT_REMOTE_OS_VERSION=15\.0$/m)
})

test('real run passes iOS browser shell separately from the WebKit project', () => {
	const outputDir = tempDir()
	const binDir = tempDir()
	const captureFile = path.join(tempDir(), 'child-env.txt')
	const fakeNpm = path.join(binDir, 'npm')
	fs.writeFileSync(fakeNpm, [
		'#!/usr/bin/env bash',
		'{',
		'  echo "PW_BROWSER_PROJECTS=$PW_BROWSER_PROJECTS"',
		'  echo "WEB_COMPAT_REMOTE_TARGET_ID=$WEB_COMPAT_REMOTE_TARGET_ID"',
		'  echo "WEB_COMPAT_REMOTE_PLATFORM=$WEB_COMPAT_REMOTE_PLATFORM"',
		'  echo "WEB_COMPAT_REMOTE_BROWSER=$WEB_COMPAT_REMOTE_BROWSER"',
		'  echo "WEB_COMPAT_REMOTE_BROWSER_VERSION=$WEB_COMPAT_REMOTE_BROWSER_VERSION"',
		'  echo "WEB_COMPAT_REMOTE_DEVICE_NAME=$WEB_COMPAT_REMOTE_DEVICE_NAME"',
		'  echo "WEB_COMPAT_REMOTE_OS_VERSION=$WEB_COMPAT_REMOTE_OS_VERSION"',
		'} > "$REMOTE_MATRIX_ENV_CAPTURE"',
		'exit 0',
		'',
	].join('\n'))
	fs.chmodSync(fakeNpm, 0o755)
	const result = runRemoteMatrix({
		WEB_URL: 'https://preview.example.test/web',
		WEB_COMPAT_OUTPUT_DIR: outputDir,
		WEB_COMPAT_INCLUDE_DEFERRED: '1',
		WEB_COMPAT_REMOTE_TARGETS: 'ios-chrome-latest',
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: JSON.stringify({
			'ios-chrome-latest': 'wss://remote.example.test/playwright?target=ios-chrome-latest',
		}),
		REMOTE_MATRIX_ENV_CAPTURE: captureFile,
		PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.match(result.stdout, /Remote browser compatibility: ios-chrome-latest/)
	const childEnv = fs.readFileSync(captureFile, 'utf8')
	assert.match(childEnv, /^PW_BROWSER_PROJECTS=webkit$/m)
	assert.match(childEnv, /^WEB_COMPAT_REMOTE_TARGET_ID=ios-chrome-latest$/m)
	assert.match(childEnv, /^WEB_COMPAT_REMOTE_PLATFORM=ios$/m)
	assert.match(childEnv, /^WEB_COMPAT_REMOTE_BROWSER=chrome$/m)
	assert.match(childEnv, /^WEB_COMPAT_REMOTE_BROWSER_VERSION=latest$/m)
	assert.match(childEnv, /^WEB_COMPAT_REMOTE_DEVICE_NAME=iPhone 16$/m)
	assert.match(childEnv, /^WEB_COMPAT_REMOTE_OS_VERSION=18$/m)
})

test('selected deferred targets require WEB_COMPAT_INCLUDE_DEFERRED', () => {
	const result = runRemoteMatrix({
		WEB_COMPAT_REMOTE_DRY_RUN: '1',
		WEB_COMPAT_REMOTE_TARGETS: 'ios-safari-latest',
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: JSON.stringify({
			'ios-safari-latest': 'wss://provider.example/playwright?target=ios-safari-latest',
		}),
	})

	assert.equal(result.status, 2)
	assert.match(result.stderr, /Deferred remote browser compatibility target\(s\) selected/)
	assert.match(result.stderr, /ios-safari-latest/)
})

test('rejects endpoint entries for unknown remote targets', () => {
	const result = runRemoteMatrix({
		WEB_COMPAT_REMOTE_DRY_RUN: '1',
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: JSON.stringify({
			'android-chrome-latset': 'wss://provider.example/playwright?target=android-chrome-latset',
		}),
	})

	assert.equal(result.status, 2)
	assert.match(result.stderr, /Unknown remote browser endpoint target/)
	assert.match(result.stderr, /android-chrome-latset/)
})

test('selected deferred targets run when explicitly included', () => {
	const result = runRemoteMatrix({
		WEB_COMPAT_REMOTE_DRY_RUN: '1',
		WEB_COMPAT_INCLUDE_DEFERRED: '1',
		WEB_COMPAT_REMOTE_TARGETS: 'ios-safari-latest',
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: JSON.stringify({
			'ios-safari-latest': 'wss://provider.example/playwright?target=ios-safari-latest',
		}),
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.match(result.stdout, /Dry run remote browser compatibility: ios-safari-latest/)
})

function runRemoteMatrix(env) {
	return spawnSync(process.execPath, [runner], {
		cwd: root,
		encoding: 'utf8',
		env: {
			...process.env,
			WEB_COMPAT_REMOTE_ENDPOINTS_JSON: '',
			BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON: '',
			WEB_COMPAT_REMOTE_ENDPOINTS_FILE: '',
			BROWSER_COMPAT_REMOTE_ENDPOINTS_FILE: '',
			WEB_COMPAT_REMOTE_ENDPOINTS_DEFAULT_FILE: path.join(os.tmpdir(), `missing-browser-compat-endpoints-${process.pid}.json`),
			...env,
		},
	})
}

function tempDir() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'biovault-remote-matrix-'))
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
	fs.writeFileSync(matrixFile, remoteMatrixYaml(matrixTargets))
	fs.writeFileSync(completionFile, completionYaml(completionTargets))
	return { matrixFile, completionFile }
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
