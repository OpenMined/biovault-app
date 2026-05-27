import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, test } from 'node:test'

const root = path.resolve(import.meta.dirname, '..')
const runner = path.join(root, 'scripts/run-browser-version-matrix.mjs')
const tempDirs = []

afterEach(() => {
	for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { force: true, recursive: true })
})

test('records fallback result when an expected-failure target exits before writing a row', () => {
	const outputDir = tempDir()
	const binDir = tempDir()
	const fakeDocker = path.join(binDir, 'docker')
	fs.writeFileSync(fakeDocker, '#!/usr/bin/env bash\nexit 1\n')
	fs.chmodSync(fakeDocker, 0o755)

	const result = spawnSync(process.execPath, [runner], {
		cwd: root,
		encoding: 'utf8',
		env: {
			...process.env,
			PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
			WEB_URL: 'http://localhost:8081',
			WEB_COMPAT_OUTPUT_DIR: outputDir,
			WEB_COMPAT_VERSION_TARGETS: 'firefox-docker-99',
		},
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.match(result.stdout, /firefox-docker-99 recorded expected compatibility failure from runner exit status 1/)
	const rows = JSON.parse(fs.readFileSync(path.join(outputDir, 'results.json'), 'utf8'))
	assert.equal(rows.length, 1)
	assert.equal(rows[0].remoteTargetId, 'firefox-docker-99')
	assert.equal(rows[0].status, 'failed')
	assert.equal(rows[0].browserName, 'firefox')
	assert.equal(rows[0].browserVersion, '99')
	assert.match(rows[0].failureMessage, /before writing a compatibility result row/)
	const summary = fs.readFileSync(path.join(outputDir, 'results.md'), 'utf8')
	assert.match(summary, /\| Status \| Target \| Source \| Project \| Browser \| Version \| Device \| OS \|/)
	assert.match(summary, /\| failed \| firefox-docker-99 \| local-playwright \| firefox \| firefox \| 99 \| firefox \|/)
})

function tempDir() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'biovault-version-matrix-'))
	tempDirs.push(dir)
	return dir
}
