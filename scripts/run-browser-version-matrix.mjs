#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { parse } from 'yaml'

const root = path.resolve(import.meta.dirname, '..')
const matrixFile = path.join(root, 'tests/browser-compat-version-matrix.yaml')
const resultsDir = path.resolve(root, process.env.WEB_COMPAT_OUTPUT_DIR ?? 'test-output/browser-compat')
const matrix = parse(fs.readFileSync(matrixFile, 'utf8'))
const targets = Array.isArray(matrix?.targets) ? matrix.targets : []
const selected = setFromCsv(process.env.WEB_COMPAT_VERSION_TARGETS)
const allowMissing = process.env.WEB_COMPAT_ALLOW_MISSING_VERSION_TARGETS === '1'
const runnable = targets.filter((target) => !selected.size || selected.has(target.id))
const missing = []
let failures = 0
let serverProcess = null

process.on('exit', cleanup)
process.on('SIGINT', () => {
	cleanup()
	process.exit(130)
})

for (const target of runnable) {
	const env = {
		...process.env,
		WEB_COMPAT_APPEND_RESULTS: '1',
		PW_BROWSER_PROJECTS: target.project,
		WEB_COMPAT_REMOTE_TARGET_ID: target.id,
		WEB_COMPAT_REMOTE_BROWSER: target.family,
		WEB_COMPAT_REMOTE_BROWSER_VERSION: String(target.version_label),
	}
	const executable = executableFor(target)
	const endpoint = endpointFor(target)
	if (target.docker_image) {
		// Docker targets run the isolated Playwright runner inside an image that owns
		// the browser dependencies, so no host executable path is needed.
		env.WEB_URL = env.WEB_URL || await startLocalWebServer(Number(process.env.PORT ?? '8081'))
		if (target.docker_executable_path) env.PW_EXECUTABLE_PATH = target.docker_executable_path
	} else if (executable) {
		env.PW_EXECUTABLE_PATH = executable
	} else if (endpoint) {
		env.PW_CONNECT_WS_ENDPOINT = endpoint
		if (!env.WEB_URL) {
			missing.push(`${target.id}: WEB_URL is required for remote endpoint targets`)
			continue
		}
	} else {
		missing.push(`${target.id}: no executable or endpoint available`)
		continue
	}

	console.log(`==> Historical browser compatibility: ${target.id}`)
	if (target.runner_version) {
		env.PW_ISOLATED_RUNNER_PACKAGE = target.runner_package ?? '@playwright/test'
		env.PW_ISOLATED_RUNNER_VERSION = String(target.runner_version)
	}
	const command = target.docker_image ? 'docker' : target.runner_version ? 'node' : 'npm'
	const args = target.docker_image
		? dockerArgs(target, env)
		: target.runner_version
			? ['./scripts/run-isolated-playwright-compat.mjs']
			: ['run', endpoint ? 'test:web-compat:remote' : 'test:web-compat']
	const child = spawnSync(command, args, {
		cwd: root,
		env,
		stdio: 'inherit',
	})
	const expectedStatus = target.expected_status ?? 'pass'
	if (expectedStatus === 'fail') {
		const result = latestResultFor(target.id)
		if (result?.status === 'failed') {
			console.log(`${target.id} recorded expected compatibility failure.`)
		} else if (child.status !== 0 && !result) {
			writeFallbackFailureResult(target, child.status)
			console.log(`${target.id} recorded expected compatibility failure from runner exit status ${child.status}.`)
		} else {
			console.error(`${target.id} was expected to fail, but did not record a failed compatibility result.`)
			failures += 1
		}
	} else if (child.status !== 0) {
		failures += 1
	}
}

if (missing.length) {
	for (const item of missing) console.log(`Skipping ${item}`)
	if (!allowMissing) {
		console.error('Set WEB_COMPAT_ALLOW_MISSING_VERSION_TARGETS=1 to allow unavailable optional historical targets.')
		process.exit(2)
	}
}

if (failures) {
	console.error(`Historical browser compatibility failed for ${failures} target(s).`)
	process.exit(1)
}

console.log(`Historical browser compatibility complete (${runnable.length - missing.length} target(s) run).`)
cleanup()

function executableFor(target) {
	const configured = target.executable_env ? expandHome(process.env[target.executable_env] ?? '') : ''
	if (configured && fs.existsSync(configured)) return configured
	const fallback = expandHome(target.fallback_executable ?? '')
	if (fallback && fs.existsSync(fallback)) return fallback
	return ''
}

function endpointFor(target) {
	return target.endpoint_env ? process.env[target.endpoint_env] : ''
}

function setFromCsv(value) {
	return new Set(String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean))
}

function expandHome(value) {
	return value.replace(/^~(?=$|\/)/, process.env.HOME ?? '~')
}

async function startLocalWebServer(startPort) {
	const port = await findPort(startPort)
	const url = `http://localhost:${port}`
	if (await isServing(url)) return url
	const logDir = path.join(root, '.maestro-web/logs')
	fs.mkdirSync(logDir, { recursive: true })
	const logPath = path.join(logDir, 'version-matrix-web.log')
	const logFd = fs.openSync(logPath, 'w')
	serverProcess = spawn('npx', ['expo', 'start', '--web', '--localhost', '--port', String(port)], {
		cwd: root,
		env: { ...process.env, BROWSER: 'none', EXPO_PUBLIC_DISABLE_ANALYTICS: '1' },
		stdio: ['ignore', logFd, logFd],
	})
	for (let attempt = 0; attempt < 90; attempt += 1) {
		if (await isServing(url)) return url
		if (serverProcess.exitCode !== null) break
		await new Promise((resolve) => setTimeout(resolve, 1000))
	}
	throw new Error(`Expo web failed to start at ${url}; see ${path.relative(root, logPath)}.`)
}

async function findPort(start) {
	for (let port = start; port < start + 100; port += 1) {
		if (!(await portHasListener(port))) return port
	}
	throw new Error(`No free port found starting at ${start}.`)
}

function portHasListener(port) {
	return new Promise((resolve) => {
		const socket = net.connect(port, '127.0.0.1')
		socket.once('connect', () => {
			socket.destroy()
			resolve(true)
		})
		socket.once('error', () => resolve(false))
	})
}

async function isServing(url) {
	try {
		const response = await fetch(url, { redirect: 'follow' })
		return response.ok
	} catch {
		return false
	}
}

function cleanup() {
	if (serverProcess) {
		serverProcess.kill()
		serverProcess = null
	}
}

function dockerArgs(target, env) {
	const passEnv = [
		'WEB_URL',
		'WEB_COMPAT_APPEND_RESULTS',
		'WEB_COMPAT_REMOTE_TARGET_ID',
		'WEB_COMPAT_REMOTE_BROWSER',
		'WEB_COMPAT_REMOTE_BROWSER_VERSION',
		'WEB_COMPAT_SAMPLE_ID',
		'WEB_COMPAT_STRICT_ARTIFACTS',
		'PW_BROWSER_PROJECTS',
		'PW_ISOLATED_RUNNER_PACKAGE',
		'PW_ISOLATED_RUNNER_VERSION',
		'PLAYWRIGHT_BROWSERS_PATH',
		'PW_EXECUTABLE_PATH',
		'WEB_COMPAT_OUTPUT_DIR',
	]
	const args = [
		'run',
		'--rm',
		'--network=host',
		'--ipc=host',
		'--user',
		`${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
		'-v',
		`${root}:${root}`,
		'-w',
		root,
		'-e',
		'HOME=/tmp',
	]
	for (const name of passEnv) {
		if (env[name]) args.push('-e', `${name}=${env[name]}`)
	}
	args.push(
		'-e',
		'CI=1',
		target.docker_image,
		'node',
		'./scripts/run-isolated-playwright-compat.mjs',
	)
	return args
}

function latestResultFor(targetId) {
	const resultsFile = path.join(resultsDir, 'results.json')
	if (!fs.existsSync(resultsFile)) return null
	const rows = JSON.parse(fs.readFileSync(resultsFile, 'utf8'))
	if (!Array.isArray(rows)) return null
	return rows.filter((row) => row.remoteTargetId === targetId)
		.sort((left, right) => String(right.startedAt ?? '').localeCompare(String(left.startedAt ?? '')))[0] ?? null
}

function writeFallbackFailureResult(target, status) {
	const runsDir = path.join(resultsDir, 'runs')
	const startedAt = new Date().toISOString()
	const result = {
		id: `${target.id}-expected-failure-${Date.now()}`,
		startedAt,
		finishedAt: startedAt,
		durationMs: 0,
		status: 'failed',
		projectName: target.project,
		sampleId: process.env.WEB_COMPAT_SAMPLE_ID ?? '23andme-v5-hu50B3F5',
		browserName: target.family,
		browserVersion: String(target.version_label),
		engine: target.project,
		os: {
			platform: process.platform,
			release: os.release(),
			arch: process.arch,
		},
		deviceProfile: target.project,
		compatibilitySource: 'local-playwright',
		remoteTargetId: target.id,
		reportRunStatus: 'failed',
		artifactValidationStatus: 'failed',
		failureMessage: `Expected historical compatibility failure: child runner exited with status ${status} before writing a compatibility result row.`,
		consoleErrors: [],
	}
	fs.mkdirSync(runsDir, { recursive: true })
	fs.writeFileSync(path.join(runsDir, `${result.id}.json`), `${JSON.stringify(result, null, 2)}\n`)
	const rows = fs.readdirSync(runsDir)
		.filter((file) => file.endsWith('.json'))
		.map((file) => JSON.parse(fs.readFileSync(path.join(runsDir, file), 'utf8')))
		.sort((left, right) => String(left.startedAt ?? '').localeCompare(String(right.startedAt ?? '')))
	fs.writeFileSync(path.join(resultsDir, 'results.json'), `${JSON.stringify(rows, null, 2)}\n`)
	fs.writeFileSync(path.join(resultsDir, 'results.md'), renderMarkdownSummary(rows))
}

function renderMarkdownSummary(results) {
	return [
		'# Browser Compatibility Results',
		'',
		'| Status | Target | Source | Project | Browser | Version | Device | OS | Secure | WASM | Worker | Report | Artifacts | Failure |',
		'| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
		...results.map((result) => `| ${[
			result.status,
			result.remoteTargetId ?? '',
			result.compatibilitySource ?? '',
			result.projectName ?? '',
			result.browserName ?? '',
			result.browserVersion ?? '',
			result.remoteDeviceName ?? result.deviceProfile ?? '',
			result.remoteOsVersion ?? formatOsForSummary(result.os),
			result.capabilities?.secureContext ? 'yes' : 'no',
			result.capabilities?.webAssemblyValidate ? 'yes' : 'no',
			result.capabilities?.worker ? 'yes' : 'no',
			result.reportRunStatus ?? '',
			result.artifactValidationStatus ?? '',
			formatFailureForSummary(result.failureMessage),
		].map(escapeMarkdownCell).join(' | ')} |`),
		'',
	].join('\n')
}

function formatOsForSummary(value) {
	return [value?.platform, value?.release].filter(Boolean).join(' ')
}

function escapeMarkdownCell(value) {
	return String(value ?? '').replace(/\|/g, '\\|')
}

function formatFailureForSummary(value) {
	const compact = String(value ?? '')
		.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
	const maxLength = 240
	return compact.length > maxLength ? `${compact.slice(0, maxLength - 1)}...` : compact
}
