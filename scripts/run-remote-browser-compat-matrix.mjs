#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'

const root = path.resolve(import.meta.dirname, '..')
const matrixFile = path.resolve(root, process.env.WEB_COMPAT_REMOTE_MATRIX_FILE ?? 'tests/browser-compat-remote-matrix.yaml')
const completionFile = path.resolve(root, process.env.WEB_COMPAT_COMPLETION_FILE ?? 'tests/browser-compat-completion.yaml')
const resultsDir = path.resolve(root, process.env.WEB_COMPAT_OUTPUT_DIR ?? 'test-output/browser-compat')
const matrix = parse(fs.readFileSync(matrixFile, 'utf8'))
const targets = Array.isArray(matrix?.targets) ? matrix.targets : []
const completionTargetIds = loadCompletionRemoteTargetIds()
const completionTargets = completionTargetIds
	.map((id) => targets.find((target) => target.id === id))
	.filter(Boolean)
const dryRun = process.env.WEB_COMPAT_REMOTE_DRY_RUN === '1'
const endpointErrors = []
const endpoints = expandEnvPlaceholders(parseEndpointJson() ?? {})
const selected = setFromCsv(process.env.WEB_COMPAT_REMOTE_TARGETS)
const includeDeferred = process.env.WEB_COMPAT_INCLUDE_DEFERRED === '1'
const allowMissing = process.env.WEB_COMPAT_ALLOW_MISSING_ENDPOINTS === '1'
const webUrl = process.env.WEB_URL
const targetIds = new Set(targets.map((target) => target.id))

const unknownSelected = Array.from(selected).filter((id) => !targetIds.has(id))
if (unknownSelected.length) {
	console.error('Unknown remote browser compatibility target(s):')
	for (const id of unknownSelected) console.error(`- ${id}`)
	process.exit(2)
}

const missingCompletionTargets = completionTargetIds.filter((id) => !targetIds.has(id))
if (missingCompletionTargets.length) {
	console.error('Completion remote browser target(s) are missing from the remote matrix:')
	for (const id of missingCompletionTargets) console.error(`- ${id}`)
	process.exit(2)
}

const unknownEndpointKeys = Object.keys(endpoints).filter((id) => id !== 'default' && !targetIds.has(id))
if (unknownEndpointKeys.length) {
	console.error('Unknown remote browser endpoint target(s):')
	for (const id of unknownEndpointKeys) console.error(`- ${id}`)
	process.exit(2)
}

const selectedDeferred = targets.filter((target) => selected.has(target.id) && target.required === 'deferred')
if (selectedDeferred.length && !includeDeferred) {
	console.error('Deferred remote browser compatibility target(s) selected without WEB_COMPAT_INCLUDE_DEFERRED=1:')
	for (const target of selectedDeferred) console.error(`- ${target.id}`)
	process.exit(2)
}

if (endpointErrors.length) {
	console.error('Remote browser endpoint configuration is incomplete:')
	for (const error of endpointErrors) console.error(`- ${error}`)
	process.exit(2)
}

if (!webUrl && !dryRun) {
	console.error('WEB_URL must be set to a URL reachable by the remote browser provider.')
	process.exit(2)
}

if (webUrl && !dryRun && isLocalWebUrl(webUrl) && process.env.WEB_COMPAT_ALLOW_LOCAL_WEB_URL !== '1') {
	console.error('WEB_URL points at a local-only host and will usually be unreachable by the remote browser provider.')
	console.error('Use a deployed preview URL, provider local tunnel URL, or set WEB_COMPAT_ALLOW_LOCAL_WEB_URL=1 when a provider tunnel maps this local host.')
	process.exit(2)
}

const targetScope = selected.size ? targets : completionTargets
const runnable = targetScope.filter((target) => {
	if (selected.size && !selected.has(target.id)) return false
	if (target.required === 'deferred' && !includeDeferred) return false
	return true
})

const missing = runnable.filter((target) => !endpointFor(target.id))
if (missing.length && !allowMissing) {
	console.error('Missing remote browser endpoints for required compatibility targets:')
	for (const target of missing) console.error(`- ${target.id}`)
	console.error('Provide WEB_COMPAT_REMOTE_ENDPOINTS_JSON as {"target-id":"wss://..."}, place browser-compat-endpoints.json at the repo root, set WEB_COMPAT_REMOTE_ENDPOINTS_FILE, set BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON, set BROWSER_COMPAT_REMOTE_ENDPOINTS_FILE, or set WEB_COMPAT_ALLOW_MISSING_ENDPOINTS=1.')
	process.exit(2)
}

const runnableWithEndpoints = runnable.filter((target) => Boolean(endpointFor(target.id)))
const endpointValidationFailures = []
const endpointValues = new Map()
for (const target of runnableWithEndpoints) {
	const endpoint = endpointFor(target.id)
	const endpointValue = typeof endpoint === 'string' ? endpoint : endpoint.wsEndpoint
	if (!endpointValue) {
		endpointValidationFailures.push(`${target.id}: endpoint object is missing wsEndpoint`)
		continue
	}
	if (dryRun && hasEnvPlaceholder(endpointValue)) {
		endpointValues.set(target.id, endpointValue)
		continue
	}
	if (!String(endpointValue).startsWith('wss://')) {
		endpointValidationFailures.push(`${target.id}: endpoint must start with wss://`)
		continue
	}
	if (!dryRun && isTemplateEndpoint(endpointValue)) {
		endpointValidationFailures.push(`${target.id}: endpoint still points at template host provider.example`)
		continue
	}
	endpointValues.set(target.id, endpointValue)
}

if (endpointValidationFailures.length) {
	for (const failure of endpointValidationFailures) console.error(`Skipping ${failure}`)
	process.exit(1)
}

if (runnableWithEndpoints.length && !dryRun && !process.env.WEB_COMPAT_APPEND_RESULTS) {
	fs.rmSync(resultsDir, { force: true, recursive: true })
}

let failures = 0
for (const target of runnable) {
	const endpoint = endpointFor(target.id)
	if (!endpoint) {
		console.log(`Skipping ${target.id}: no endpoint configured`)
		continue
	}
	const endpointValue = endpointValues.get(target.id)
	if (dryRun) {
		console.log(`Dry run remote browser compatibility: ${target.id} (${target.platform} ${target.browser} ${target.version})`)
		continue
	}
	console.log(`==> Remote browser compatibility: ${target.id}`)
	const child = spawnSync('npm', ['run', 'test:web-compat:remote'], {
		cwd: root,
		env: {
			...process.env,
			WEB_URL: webUrl,
			PW_CONNECT_WS_ENDPOINT: endpointValue,
			PW_CONNECT_HEADERS_JSON: typeof endpoint === 'object' && endpoint.headers ? JSON.stringify(endpoint.headers) : '',
			PW_BROWSER_PROJECTS: target.project,
			WEB_COMPAT_APPEND_RESULTS: '1',
			WEB_COMPAT_REMOTE_TARGET_ID: target.id,
			WEB_COMPAT_REMOTE_PLATFORM: target.platform,
			WEB_COMPAT_REMOTE_BROWSER: target.browser,
			WEB_COMPAT_REMOTE_BROWSER_VERSION: String(target.version),
			WEB_COMPAT_REMOTE_DEVICE_NAME: String(target.device_name ?? ''),
			WEB_COMPAT_REMOTE_OS_VERSION: String(target.os_version ?? ''),
		},
		stdio: 'inherit',
	})
	if (child.status !== 0) failures += 1
}

if (failures) {
	console.error(`Remote browser compatibility failed for ${failures} target(s).`)
	process.exit(1)
}

console.log(`Remote browser compatibility complete (${runnable.length - missing.length} target(s) run).`)

function endpointFor(id) {
	return endpoints[id] ?? endpoints.default
}

function isTemplateEndpoint(value) {
	try {
		return new URL(value).hostname === 'provider.example'
	} catch {
		return false
	}
}

function hasEnvPlaceholder(value) {
	return /\$\{[A-Z0-9_]+\}/.test(String(value ?? ''))
}

function isLocalWebUrl(value) {
	try {
		const hostname = new URL(value).hostname.toLowerCase()
		return hostname === 'localhost' ||
			hostname === '127.0.0.1' ||
			hostname === '::1' ||
			hostname.endsWith('.localhost') ||
			hostname.endsWith('.local')
	} catch {
		return false
	}
}

function parseJsonEnv(name) {
	const value = process.env[name]
	if (!value) return null
	try {
		return JSON.parse(value)
	} catch (error) {
		console.error(`${name} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
		process.exit(2)
	}
}

function parseEndpointJson() {
	const envEndpoints = parseJsonEnv('WEB_COMPAT_REMOTE_ENDPOINTS_JSON') ?? parseJsonEnv('BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON')
	if (envEndpoints) return validateEndpointMap(envEndpoints, 'Remote browser endpoint JSON')
	const file = process.env.WEB_COMPAT_REMOTE_ENDPOINTS_FILE || process.env.BROWSER_COMPAT_REMOTE_ENDPOINTS_FILE
	if (file) return parseEndpointFile(file)
	const defaultFile = path.resolve(root, process.env.WEB_COMPAT_REMOTE_ENDPOINTS_DEFAULT_FILE ?? 'browser-compat-endpoints.json')
	if (fs.existsSync(defaultFile)) return parseEndpointFile(defaultFile)
	return null
}

function parseEndpointFile(file) {
	const resolved = path.resolve(root, file)
	if (!fs.existsSync(resolved)) {
		console.error(`Missing remote browser endpoint file: ${path.relative(root, resolved)}`)
		process.exit(2)
	}
	try {
		return validateEndpointMap(JSON.parse(fs.readFileSync(resolved, 'utf8')), 'Remote browser endpoint file')
	} catch (error) {
		console.error(`Remote browser endpoint file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
		process.exit(2)
	}
}

function loadCompletionRemoteTargetIds() {
	if (!fs.existsSync(completionFile)) return targets.map((target) => String(target.id))
	const doc = parse(fs.readFileSync(completionFile, 'utf8')) ?? {}
	return Array.isArray(doc.remote_targets) ? doc.remote_targets.map(String) : targets.map((target) => String(target.id))
}

function validateEndpointMap(value, label) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		console.error(`${label} must be a JSON object keyed by remote target id.`)
		process.exit(2)
	}
	return value
}

function setFromCsv(value) {
	return new Set(String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean))
}

function expandEnvPlaceholders(value) {
	if (typeof value === 'string') {
		return value.replace(/\$\{([A-Z0-9_]+)\}/g, (match, name) => {
			const replacement = process.env[name]
			if (replacement === undefined || replacement === '') {
				if (dryRun) return match
				endpointErrors.push(`missing environment variable ${name}`)
				return match
			}
			return replacement
		})
	}
	if (Array.isArray(value)) return value.map(expandEnvPlaceholders)
	if (value && typeof value === 'object') {
		return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expandEnvPlaceholders(item)]))
	}
	return value
}
