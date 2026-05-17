import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { test } from 'node:test'

const root = path.resolve(import.meta.dirname, '..')
const wrapper = path.join(root, 'test-web-compat-remote.sh')

test('remote compatibility wrapper points users to the matrix endpoint inputs', () => {
	const result = runWrapper({
		WEB_URL: 'https://preview.example.test/web',
		PW_CONNECT_WS_ENDPOINT: '',
	})

	assert.equal(result.status, 2)
	assert.match(result.stderr, /PW_CONNECT_WS_ENDPOINT is required/)
	assert.match(result.stderr, /test:web-compat:remote-matrix/)
	assert.match(result.stderr, /browser-compat-endpoints\.json/)
	assert.match(result.stderr, /WEB_COMPAT_REMOTE_ENDPOINTS_FILE/)
	assert.match(result.stderr, /WEB_COMPAT_REMOTE_ENDPOINTS_JSON/)
	assert.match(result.stderr, /BROWSER_COMPAT_REMOTE_ENDPOINTS_FILE/)
	assert.match(result.stderr, /BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON/)
})

test('remote compatibility wrapper requires a provider-reachable WEB_URL', () => {
	const result = runWrapper({
		PW_CONNECT_WS_ENDPOINT: 'wss://cdp.browserstack.com/playwright',
		WEB_URL: '',
	})

	assert.equal(result.status, 2)
	assert.match(result.stderr, /WEB_URL must be reachable by the remote browser provider/)
	assert.match(result.stderr, /deployed preview URL/)
})

test('remote compatibility wrapper rejects local WEB_URL unless explicitly allowed', () => {
	const blocked = runWrapper({
		PW_CONNECT_WS_ENDPOINT: 'wss://cdp.browserstack.com/playwright',
		WEB_URL: 'http://localhost:8081',
	})
	assert.equal(blocked.status, 2)
	assert.match(blocked.stderr, /local-only host/)
	assert.match(blocked.stderr, /WEB_COMPAT_ALLOW_LOCAL_WEB_URL=1/)

	const allowed = runWrapper({
		PW_CONNECT_WS_ENDPOINT: 'wss://cdp.browserstack.com/playwright',
		WEB_URL: 'http://localhost:8081',
		WEB_COMPAT_ALLOW_LOCAL_WEB_URL: '1',
		WEB_COMPAT_REMOTE_PRECHECK_ONLY: '1',
	})
	assert.equal(allowed.status, 0, allowed.stderr || allowed.stdout)
	assert.match(allowed.stdout, /precheck passed/)
	assert.doesNotMatch(allowed.stderr, /local-only host/)
})

function runWrapper(env) {
	return spawnSync('bash', [wrapper], {
		cwd: root,
		encoding: 'utf8',
		env: {
			...process.env,
			PW_CONNECT_WS_ENDPOINT: '',
			WEB_URL: '',
			...env,
		},
	})
}
