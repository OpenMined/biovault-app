import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, test } from 'node:test'

const root = path.resolve(import.meta.dirname, '..')
const renderer = path.join(root, 'scripts/render-browser-compat-endpoints.mjs')
const tempFiles = []

afterEach(() => {
	for (const file of tempFiles.splice(0)) fs.rmSync(file, { force: true })
})

test('renders provider endpoints after expanding required environment placeholders', () => {
	const file = capabilityFile('${BROWSERSTACK_USERNAME}', '${BROWSERSTACK_ACCESS_KEY}')
	const result = runRenderer(file, {
		BROWSERSTACK_USERNAME: 'user',
		BROWSERSTACK_ACCESS_KEY: 'key',
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	const endpoints = JSON.parse(result.stdout)
	const wsEndpoint = endpoints['android-chrome-latest']?.wsEndpoint
	assert.match(wsEndpoint, /^wss:\/\/cdp\.browserstack\.com\/playwright\?caps=/)
	const url = new URL(wsEndpoint)
	const caps = JSON.parse(url.searchParams.get('caps'))
	assert.equal(caps['browserstack.username'], 'user')
	assert.equal(caps['browserstack.accessKey'], 'key')
})

test('rejects missing or empty environment placeholders', () => {
	const missing = runRenderer(capabilityFile('${BROWSERSTACK_USERNAME}', '${BROWSERSTACK_ACCESS_KEY}'), {
		BROWSERSTACK_USERNAME: 'user',
	})
	assert.equal(missing.status, 1)
	assert.match(missing.stderr, /android-chrome-latest references missing environment variable BROWSERSTACK_ACCESS_KEY/)

	const empty = runRenderer(capabilityFile('${BROWSERSTACK_USERNAME}', '${BROWSERSTACK_ACCESS_KEY}'), {
		BROWSERSTACK_USERNAME: 'user',
		BROWSERSTACK_ACCESS_KEY: '',
	})
	assert.equal(empty.status, 1)
	assert.match(empty.stderr, /android-chrome-latest references missing environment variable BROWSERSTACK_ACCESS_KEY/)
})

test('renders provider-targets capability file shape', () => {
	const file = path.join(os.tmpdir(), `biovault-browser-compat-caps-${process.pid}-${tempFiles.length}.json`)
	tempFiles.push(file)
	fs.writeFileSync(file, JSON.stringify({
		provider: 'browserstack',
		targets: {
			'android-chrome-latest': {
				browser: 'chrome',
				browser_version: 'latest',
				deviceName: 'Google Pixel 9',
				osVersion: '15.0',
				name: 'android-chrome-latest',
				'browserstack.username': '${BROWSERSTACK_USERNAME}',
				'browserstack.accessKey': '${BROWSERSTACK_ACCESS_KEY}',
			},
		},
	}, null, 2))

	const result = runRenderer(file, {
		BROWSERSTACK_USERNAME: 'user',
		BROWSERSTACK_ACCESS_KEY: 'key',
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	const endpoints = JSON.parse(result.stdout)
	const caps = JSON.parse(new URL(endpoints['android-chrome-latest'].wsEndpoint).searchParams.get('caps'))
	assert.equal(caps.provider, undefined)
	assert.equal(caps.targets, undefined)
	assert.equal(caps.browser, 'chrome')
	assert.equal(caps['browserstack.username'], 'user')
	assert.equal(caps['browserstack.accessKey'], 'key')
})

test('rejects capability files that do not match remote matrix device metadata', () => {
	const file = capabilityFile('${BROWSERSTACK_USERNAME}', '${BROWSERSTACK_ACCESS_KEY}', {
		deviceName: 'Google Pixel 8',
		osVersion: '14.0',
	})
	const result = runRenderer(file, {
		BROWSERSTACK_USERNAME: 'user',
		BROWSERSTACK_ACCESS_KEY: 'key',
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /android-chrome-latest browserstack device Google Pixel 8 does not match target device Google Pixel 9/)
	assert.match(result.stderr, /android-chrome-latest browserstack OS version 14\.0 does not match target OS version 15\.0/)
})

test('renders checked-in BrowserStack capability template with documented keys', () => {
	const result = spawnSync(process.execPath, [renderer, 'browserstack', 'tests/browser-compat-provider-capabilities.example.json'], {
		cwd: root,
		encoding: 'utf8',
		env: {
			...process.env,
			WEB_COMPAT_ENDPOINT_ALLOW_PLACEHOLDERS: '1',
		},
	})
	assert.equal(result.status, 0, result.stderr || result.stdout)
	const endpoints = JSON.parse(result.stdout)
	const chromeEndpoint = endpoints['android-chrome-previous']?.wsEndpoint
	assert.match(chromeEndpoint, /^wss:\/\/cdp\.browserstack\.com\/playwright\?caps=/)
	const caps = JSON.parse(new URL(chromeEndpoint).searchParams.get('caps'))
	assert.equal(caps.browser, 'chrome')
	assert.equal(caps.browser_version, 'latest-1')
	assert.equal(caps.browserName, undefined)
	assert.equal(caps.browserVersion, undefined)
})

function capabilityFile(username, accessKey, overrides = {}) {
	const file = path.join(os.tmpdir(), `biovault-browser-compat-caps-${process.pid}-${tempFiles.length}.json`)
	tempFiles.push(file)
	fs.writeFileSync(file, JSON.stringify({
		browserstack: {
			'android-chrome-latest': {
				browser: 'chrome',
				browser_version: 'latest',
				deviceName: 'Google Pixel 9',
				osVersion: '15.0',
				sessionName: 'android-chrome-latest',
				'browserstack.username': username,
				'browserstack.accessKey': accessKey,
				...overrides,
			},
		},
	}, null, 2))
	return file
}

function runRenderer(file, env = {}) {
	return spawnSync(process.execPath, [renderer, 'browserstack', file], {
		cwd: root,
		encoding: 'utf8',
		env: {
			...process.env,
			...env,
		},
	})
}
