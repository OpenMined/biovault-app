import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, test } from 'node:test'

const root = path.resolve(import.meta.dirname, '..')
const checker = path.join(root, 'scripts/check-browser-compat-provider-workflow.mjs')
const tempDirs = []

afterEach(() => {
	for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { force: true, recursive: true })
})

test('accepts a workflow file with provider dispatch inputs and jobs', () => {
	const workflowFile = writeWorkflowFile(workflowFixture())
	const result = runChecker({
		WEB_COMPAT_PROVIDER_WORKFLOW_FILE: workflowFile,
		PATH: '/missing-gh',
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.match(result.stdout, /provider workflow is dispatchable/)
})

test('rejects a workflow file without provider dispatch inputs', () => {
	const workflowFile = writeWorkflowFile(workflowFixture().replace('      compat_web_url:\n        default: ""\n', ''))
	const result = runChecker({
		WEB_COMPAT_PROVIDER_WORKFLOW_FILE: workflowFile,
		PATH: '/missing-gh',
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /missing workflow_dispatch input compat_web_url/)
})

test('rejects a workflow file without provider jobs', () => {
	const workflowFile = writeWorkflowFile(workflowFixture().replace('  web-compat-remote:\n    steps: []\n', ''))
	const result = runChecker({
		WEB_COMPAT_PROVIDER_WORKFLOW_FILE: workflowFile,
		PATH: '/missing-gh',
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /missing job web-compat-remote/)
})

test('uses gh workflow view with the selected repository and ref', () => {
	const argsFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'biovault-provider-workflow-gh-')), 'args.txt')
	tempDirs.push(path.dirname(argsFile))
	const bin = fakeGh(workflowFixture(), argsFile)
	const result = runChecker({
		PATH: bin,
		WEB_COMPAT_PROVIDER_REPOSITORY: 'Example/biovault-fork',
		WEB_COMPAT_PROVIDER_REF: 'madhava/browser-testing',
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.equal(
		fs.readFileSync(argsFile, 'utf8').trim(),
		'workflow view CI --repo Example/biovault-fork --ref madhava/browser-testing --yaml',
	)
})

test('fails clearly when gh cannot read the selected workflow ref', () => {
	const result = runChecker({
		PATH: '/missing-gh',
		WEB_COMPAT_PROVIDER_REF: 'main',
	})

	assert.equal(result.status, 1)
	assert.match(result.stderr, /Cannot read OpenMined\/biovault-app workflow CI at ref main/)
	assert.match(result.stderr, /Push these workflow changes to the selected ref/)
})

function runChecker(env) {
	return spawnSync(process.execPath, [checker], {
		cwd: root,
		encoding: 'utf8',
		env: {
			...process.env,
			WEB_COMPAT_PROVIDER_WORKFLOW_FILE: '',
			WEB_COMPAT_PROVIDER_REPOSITORY: '',
			WEB_COMPAT_PROVIDER_REF: '',
			...env,
		},
	})
}

function writeWorkflowFile(text) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'biovault-provider-workflow-'))
	tempDirs.push(dir)
	const file = path.join(dir, 'ci.yml')
	fs.writeFileSync(file, text)
	return file
}

function fakeGh(stdout, argsFile) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'biovault-fake-gh-'))
	tempDirs.push(dir)
	const file = path.join(dir, 'gh')
	fs.writeFileSync(file, [
		'#!/bin/sh',
		`printf '%s\\n' "$*" > ${JSON.stringify(argsFile)}`,
		`printf '%s\\n' ${shellQuote(stdout)}`,
		'',
	].join('\n'), { mode: 0o755 })
	return dir
}

function shellQuote(value) {
	return `'${String(value).replaceAll("'", "'\\''")}'`
}

function workflowFixture() {
	return [
		'name: CI',
		'on:',
		'  workflow_dispatch:',
		'    inputs:',
		'      deploy_ref:',
		'        default: main',
		'      compat_web_url:',
		'        default: ""',
		'      compat_remote_targets:',
		'        default: ""',
		'      compat_include_ios:',
		'        default: false',
		'        type: boolean',
		'      compat_allow_local_web_url:',
		'        default: false',
		'        type: boolean',
		'      compat_remote_dry_run:',
		'        default: false',
		'        type: boolean',
		'      compat_local_smoke:',
		'        default: false',
		'        type: boolean',
		'      compat_versions:',
		'        default: false',
		'        type: boolean',
		'      compat_version_targets:',
		'        default: ""',
		'      compat_android_local:',
		'        default: false',
		'        type: boolean',
		'      compat_completion:',
		'        default: false',
		'        type: boolean',
		'jobs:',
		'  web-compat-remote:',
		'    steps: []',
		'  web-compat-completion:',
		'    steps: []',
		'',
	].join('\n')
}
