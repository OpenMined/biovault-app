import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, test } from 'node:test'

const root = path.resolve(import.meta.dirname, '..')
const checker = path.join(root, 'scripts/check-browser-compat-provider-secret.mjs')
const tempDirs = []

afterEach(() => {
	for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { force: true, recursive: true })
})

test('passes when endpoint JSON is available in the current environment', () => {
	const result = runChecker({
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: '{"android-chrome-latest":"wss://cdp.browserstack.com/playwright"}',
		WEB_COMPAT_REMOTE_TARGETS: 'android-chrome-latest',
		PATH: '/missing-gh',
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.match(result.stdout, /provider endpoints are available/)
})

test('rejects invalid endpoint JSON in the current environment', () => {
	const result = runChecker({
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: 'not json',
		PATH: '/missing-gh',
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /provider endpoint JSON is invalid/)
})

test('rejects endpoint JSON that is not an object', () => {
	const result = runChecker({
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: '[]',
		PATH: '/missing-gh',
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /expected a JSON object/)
})

test('rejects empty endpoint JSON objects', () => {
	const result = runChecker({
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: '{}',
		PATH: '/missing-gh',
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /expected at least one provider endpoint entry/)
})

test('rejects endpoint entries with unsupported shape', () => {
	const result = runChecker({
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: '{"android-chrome-latest":{"headers":{"Authorization":"Bearer token"}}}',
		PATH: '/missing-gh',
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /android-chrome-latest must be a WebSocket endpoint string or an object with wsEndpoint/)
})

test('rejects endpoint entries that are not secure WebSocket URLs', () => {
	const result = runChecker({
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: '{"android-chrome-latest":"http://provider.example/playwright"}',
		PATH: '/missing-gh',
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /android-chrome-latest wsEndpoint must start with wss:\/\//)
})

test('rejects endpoint entries with unresolved environment placeholders', () => {
	const result = runChecker({
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: '{"android-chrome-latest":{"wsEndpoint":"wss://cdp.browserstack.com/playwright?caps=${BROWSER_PROVIDER_CAPS}","headers":{"Authorization":"Bearer ${BROWSER_PROVIDER_TOKEN}"}}}',
		WEB_COMPAT_REMOTE_TARGETS: 'android-chrome-latest',
		PATH: '/missing-gh',
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /android-chrome-latest references missing environment variable\(s\): BROWSER_PROVIDER_CAPS, BROWSER_PROVIDER_TOKEN/)
})

test('accepts endpoint entries after environment placeholders resolve', () => {
	const result = runChecker({
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: '{"android-chrome-latest":{"wsEndpoint":"wss://cdp.browserstack.com/playwright?caps=${BROWSER_PROVIDER_CAPS}","headers":{"Authorization":"Bearer ${BROWSER_PROVIDER_TOKEN}"}}}',
		WEB_COMPAT_REMOTE_TARGETS: 'android-chrome-latest',
		BROWSER_PROVIDER_CAPS: 'encoded-caps',
		BROWSER_PROVIDER_TOKEN: 'token',
		PATH: '/missing-gh',
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.match(result.stdout, /provider endpoints are available/)
})

test('accepts endpoint entries that resolve the full WebSocket endpoint from the environment', () => {
	const result = runChecker({
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: '{"android-chrome-latest":"${BROWSER_PROVIDER_WS}"}',
		WEB_COMPAT_REMOTE_TARGETS: 'android-chrome-latest',
		BROWSER_PROVIDER_WS: 'wss://cdp.browserstack.com/playwright',
		PATH: '/missing-gh',
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.match(result.stdout, /provider endpoints are available/)
})

test('passes when endpoint JSON is available in a local file', () => {
	const file = writeEndpointFile({
		'android-chrome-latest': 'wss://cdp.browserstack.com/playwright',
	})
	const result = runChecker({
		WEB_COMPAT_REMOTE_ENDPOINTS_FILE: file,
		WEB_COMPAT_REMOTE_TARGETS: 'android-chrome-latest',
		PATH: '/missing-gh',
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.match(result.stdout, /provider endpoints are available/)
})

test('passes when endpoint JSON is available through the repository-named file alias', () => {
	const file = writeEndpointFile({
		'android-chrome-latest': 'wss://cdp.browserstack.com/playwright',
	})
	const result = runChecker({
		BROWSER_COMPAT_REMOTE_ENDPOINTS_FILE: file,
		WEB_COMPAT_REMOTE_TARGETS: 'android-chrome-latest',
		PATH: '/missing-gh',
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.match(result.stdout, /provider endpoints are available/)
})

test('passes when endpoint JSON is available in the default local file', () => {
	const file = writeEndpointFile({
		'android-chrome-latest': 'wss://cdp.browserstack.com/playwright',
	})
	const result = runChecker({
		WEB_COMPAT_REMOTE_ENDPOINTS_DEFAULT_FILE: file,
		WEB_COMPAT_REMOTE_TARGETS: 'android-chrome-latest',
		PATH: '/missing-gh',
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.match(result.stdout, /provider endpoints are available/)
})

test('rejects a missing endpoint JSON file', () => {
	const result = runChecker({
		WEB_COMPAT_REMOTE_ENDPOINTS_FILE: '/tmp/missing-browser-compat-endpoints.json',
		PATH: '/missing-gh',
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /Missing remote browser endpoint file/)
})

test('rejects an invalid endpoint JSON file', () => {
	const file = writeRawEndpointFile('{')
	const result = runChecker({
		WEB_COMPAT_REMOTE_ENDPOINTS_FILE: file,
		PATH: '/missing-gh',
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /provider endpoint JSON is invalid/)
})

test('rejects endpoint JSON files that are not objects', () => {
	const file = writeEndpointFile([])
	const result = runChecker({
		WEB_COMPAT_REMOTE_ENDPOINTS_FILE: file,
		PATH: '/missing-gh',
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /expected a JSON object/)
})

test('rejects endpoint entries that resolve to the checked-in template host', () => {
	const result = runChecker({
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: '{"android-chrome-latest":"${BROWSER_PROVIDER_WS}"}',
		WEB_COMPAT_REMOTE_TARGETS: 'android-chrome-latest',
		BROWSER_PROVIDER_WS: 'wss://provider.example/playwright',
		PATH: '/missing-gh',
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /provider\.example/)
})

test('rejects checked-in template provider endpoint hosts', () => {
	const result = runChecker({
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: '{"android-chrome-latest":"wss://provider.example/playwright"}',
		PATH: '/missing-gh',
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /provider\.example/)
})

test('rejects endpoint entries for unknown remote targets', () => {
	const result = runChecker({
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: '{"android-crome-latest":"wss://cdp.browserstack.com/playwright"}',
		PATH: '/missing-gh',
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /android-crome-latest is not a known remote browser compatibility target/)
})

test('accepts a default endpoint entry', () => {
	const result = runChecker({
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: '{"default":"wss://cdp.browserstack.com/playwright"}',
		PATH: '/missing-gh',
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.match(result.stdout, /provider endpoints are available/)
})

test('accepts endpoint object entries with secure WebSocket URLs', () => {
	const result = runChecker({
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: '{"android-chrome-latest":{"wsEndpoint":"wss://cdp.browserstack.com/playwright","headers":{"Authorization":"Bearer token"}}}',
		WEB_COMPAT_REMOTE_TARGETS: 'android-chrome-latest',
		PATH: '/missing-gh',
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.match(result.stdout, /provider endpoints are available/)
})

test('uses completion remote targets as the default required endpoint set', () => {
	const fixture = createTargetFixture({
		matrixTargets: ['android-chrome-latest', 'android-firefox-latest'],
		completionTargets: ['android-chrome-latest'],
	})
	const result = runChecker({
		WEB_COMPAT_REMOTE_MATRIX_FILE: fixture.matrixFile,
		WEB_COMPAT_COMPLETION_FILE: fixture.completionFile,
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: '{"android-chrome-latest":"wss://cdp.browserstack.com/playwright"}',
		PATH: '/missing-gh',
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.match(result.stdout, /provider endpoints are available/)
})

test('requires explicitly selected matrix targets even when they are outside completion scope', () => {
	const fixture = createTargetFixture({
		matrixTargets: ['android-chrome-latest', 'android-firefox-latest'],
		completionTargets: ['android-chrome-latest'],
	})
	const result = runChecker({
		WEB_COMPAT_REMOTE_MATRIX_FILE: fixture.matrixFile,
		WEB_COMPAT_COMPLETION_FILE: fixture.completionFile,
		WEB_COMPAT_REMOTE_TARGETS: 'android-firefox-latest',
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: '{"android-chrome-latest":"wss://cdp.browserstack.com/playwright"}',
		PATH: '/missing-gh',
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /missing provider endpoint\(s\) for required target id\(s\): android-firefox-latest/)
})

test('rejects completion remote targets that are missing from the remote matrix', () => {
	const fixture = createTargetFixture({
		matrixTargets: ['android-chrome-latest'],
		completionTargets: ['android-firefox-latest'],
	})
	const result = runChecker({
		WEB_COMPAT_REMOTE_MATRIX_FILE: fixture.matrixFile,
		WEB_COMPAT_COMPLETION_FILE: fixture.completionFile,
		WEB_COMPAT_SKIP_GH_SECRET_LOOKUP: '1',
		PATH: '/missing-gh',
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /provider target selection is invalid/)
	assert.match(result.stderr, /completion contract remote target\(s\) are missing from the remote matrix: android-firefox-latest/)
})

test('rejects endpoint JSON missing default required Android targets', () => {
	const result = runChecker({
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: '{"android-chrome-latest":"wss://cdp.browserstack.com/playwright"}',
		PATH: '/missing-gh',
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /missing provider endpoint\(s\) for required target id\(s\): android-chrome-previous, android-firefox-latest, android-samsung-internet-latest/)
})

test('requires deferred iOS endpoints when deferred targets are included', () => {
	const result = runChecker({
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: JSON.stringify({
			'android-chrome-latest': 'wss://cdp.browserstack.com/playwright?target=android-chrome-latest',
			'android-chrome-previous': 'wss://cdp.browserstack.com/playwright?target=android-chrome-previous',
			'android-firefox-latest': 'wss://cdp.browserstack.com/playwright?target=android-firefox-latest',
			'android-samsung-internet-latest': 'wss://cdp.browserstack.com/playwright?target=android-samsung-internet-latest',
		}),
		WEB_COMPAT_INCLUDE_DEFERRED: '1',
		PATH: '/missing-gh',
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /missing provider endpoint\(s\) for required target id\(s\): ios-safari-latest, ios-safari-oldest-supported, ios-chrome-latest, ios-firefox-latest/)
})

test('rejects selected deferred targets without explicit deferred opt in', () => {
	const result = runChecker({
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: '{"ios-safari-latest":"wss://cdp.browserstack.com/playwright"}',
		WEB_COMPAT_REMOTE_TARGETS: 'ios-safari-latest',
		PATH: '/missing-gh',
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /selected deferred remote browser compatibility target\(s\) require WEB_COMPAT_INCLUDE_DEFERRED=1: ios-safari-latest/)
})

test('rejects selected deferred targets before secret lookup', () => {
	const result = runChecker({
		WEB_COMPAT_REMOTE_TARGETS: 'ios-safari-latest',
		WEB_COMPAT_SKIP_GH_SECRET_LOOKUP: '1',
		PATH: '/missing-gh',
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /provider target selection is invalid/)
	assert.match(result.stderr, /selected deferred remote browser compatibility target\(s\) require WEB_COMPAT_INCLUDE_DEFERRED=1: ios-safari-latest/)
	assert.doesNotMatch(result.stderr, /Missing provider endpoint input/)
})

test('rejects unknown selected remote targets', () => {
	const result = runChecker({
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: '{"default":"wss://cdp.browserstack.com/playwright"}',
		WEB_COMPAT_REMOTE_TARGETS: 'ios-safary-latest',
		WEB_COMPAT_INCLUDE_DEFERRED: '1',
		PATH: '/missing-gh',
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /unknown selected remote browser compatibility target\(s\): ios-safary-latest/)
})

test('rejects unknown selected remote targets before secret lookup', () => {
	const result = runChecker({
		WEB_COMPAT_REMOTE_TARGETS: 'android-crome-latest',
		WEB_COMPAT_SKIP_GH_SECRET_LOOKUP: '1',
		PATH: '/missing-gh',
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /provider target selection is invalid/)
	assert.match(result.stderr, /unknown selected remote browser compatibility target\(s\): android-crome-latest/)
	assert.doesNotMatch(result.stderr, /Missing provider endpoint input/)
})

test('rejects default as a selected remote target id', () => {
	const result = runChecker({
		WEB_COMPAT_REMOTE_ENDPOINTS_JSON: '{"default":"wss://cdp.browserstack.com/playwright"}',
		WEB_COMPAT_REMOTE_TARGETS: 'default',
		PATH: '/missing-gh',
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /unknown selected remote browser compatibility target\(s\): default/)
})

test('fails clearly when neither env nor gh secret lookup is available', () => {
	const result = runChecker({
		PATH: '/missing-gh',
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /provider endpoints are not available/)
	assert.match(result.stderr, /set WEB_COMPAT_REMOTE_ENDPOINTS_JSON locally/)
})

test('passes when the GitHub Actions endpoint secret is configured', () => {
	const bin = fakeGh(`BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON\t2026-05-17T00:00:00Z\n`)
	const result = runChecker({
		PATH: bin,
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.match(result.stdout, /repository secret BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON is configured/)
})

test('looks up the GitHub Actions endpoint secret from the configured repository', () => {
	const argsFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'biovault-fake-gh-args-')), 'args.txt')
	tempDirs.push(path.dirname(argsFile))
	const bin = fakeGh(`BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON\t2026-05-17T00:00:00Z\n`)
	const result = runChecker({
		PATH: bin,
		WEB_COMPAT_PROVIDER_REPOSITORY: 'Example/biovault-fork',
		FAKE_GH_ARGS_FILE: argsFile,
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.equal(fs.readFileSync(argsFile, 'utf8').trim(), 'secret list --repo Example/biovault-fork')
})

test('fails clearly when gh is available but the endpoint secret is missing', () => {
	const bin = fakeGh(`CLOUDFLARE_API_TOKEN\t2026-05-17T00:00:00Z\n`)
	const result = runChecker({
		PATH: bin,
		WEB_COMPAT_PROVIDER_REPOSITORY: 'OpenMined/biovault-app',
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /Missing provider endpoint input BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON/)
	assert.match(result.stderr, /Required endpoint target ids for this run: android-chrome-latest, android-chrome-previous, android-firefox-latest, android-samsung-internet-latest/)
	assert.match(result.stderr, /Strict completion remote target ids: android-chrome-latest/)
	assert.match(result.stderr, /tests\/browser-compat-remote-endpoints\.example\.json/)
	assert.match(result.stderr, /export WEB_COMPAT_REMOTE_ENDPOINTS_JSON/)
	assert.match(result.stderr, /browser-compat-endpoints\.json at the repo root/)
	assert.match(result.stderr, /WEB_COMPAT_REMOTE_ENDPOINTS_FILE/)
	assert.match(result.stderr, /BROWSER_COMPAT_REMOTE_ENDPOINTS_FILE/)
	assert.match(result.stderr, /repository-level CI secret/)
	assert.match(result.stderr, /gh secret set BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON --repo OpenMined\/biovault-app/)
})

test('can skip gh lookup and report the missing configured secret directly', () => {
	const result = runChecker({
		PATH: '/missing-gh',
		WEB_COMPAT_SKIP_GH_SECRET_LOOKUP: '1',
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /Missing provider endpoint input BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON/)
	assert.match(result.stderr, /Required endpoint target ids for this run: android-chrome-latest, android-chrome-previous, android-firefox-latest, android-samsung-internet-latest/)
	assert.match(result.stderr, /Strict completion remote target ids: android-chrome-latest/)
	assert.match(result.stderr, /tests\/browser-compat-remote-endpoints\.example\.json/)
	assert.match(result.stderr, /export WEB_COMPAT_REMOTE_ENDPOINTS_JSON/)
	assert.match(result.stderr, /browser-compat-endpoints\.json at the repo root/)
	assert.match(result.stderr, /WEB_COMPAT_REMOTE_ENDPOINTS_FILE/)
	assert.match(result.stderr, /BROWSER_COMPAT_REMOTE_ENDPOINTS_FILE/)
	assert.match(result.stderr, /gh secret set BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON/)
})

test('reports selected endpoint targets when configured secret is missing for a single-target run', () => {
	const result = runChecker({
		PATH: '/missing-gh',
		WEB_COMPAT_REMOTE_TARGETS: 'android-firefox-latest',
		WEB_COMPAT_SKIP_GH_SECRET_LOOKUP: '1',
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /Required endpoint target ids for this run: android-firefox-latest/)
	assert.match(result.stderr, /Strict completion remote target ids: android-chrome-latest/)
	assert.doesNotMatch(result.stderr, /Required endpoint target ids for this run: android-chrome-latest/)
})

function runChecker(env) {
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
			...env,
		},
	})
}

function writeEndpointFile(value) {
	return writeRawEndpointFile(JSON.stringify(value))
}

function writeRawEndpointFile(value) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'biovault-provider-endpoints-'))
	tempDirs.push(dir)
	const file = path.join(dir, 'endpoints.json')
	fs.writeFileSync(file, value)
	return file
}

function createTargetFixture({ matrixTargets, completionTargets }) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'biovault-provider-targets-'))
	tempDirs.push(dir)
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

function fakeGh(output) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'biovault-fake-gh-'))
	tempDirs.push(dir)
	const file = path.join(dir, 'gh')
	fs.writeFileSync(file, `#!/bin/sh\nif [ -n "$FAKE_GH_ARGS_FILE" ]; then\n  printf '%s\\n' "$*" > "$FAKE_GH_ARGS_FILE"\nfi\nif [ "$1" = "secret" ] && [ "$2" = "list" ]; then\n  printf '%s' '${escapeShellSingleQuoted(output)}'\n  exit 0\nfi\nexit 2\n`)
	fs.chmodSync(file, 0o755)
	return dir
}

function escapeShellSingleQuoted(value) {
	return String(value).replace(/'/g, `'\\''`)
}
