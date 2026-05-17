#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'

const root = path.resolve(import.meta.dirname, '..')
const remoteMatrixFile = path.resolve(root, process.env.WEB_COMPAT_REMOTE_MATRIX_FILE ?? 'tests/browser-compat-remote-matrix.yaml')
const completionFile = path.resolve(root, process.env.WEB_COMPAT_COMPLETION_FILE ?? 'tests/browser-compat-completion.yaml')
const secretName = process.env.WEB_COMPAT_PROVIDER_SECRET_NAME ?? 'BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON'
const providerRepository = process.env.WEB_COMPAT_PROVIDER_REPOSITORY || process.env.GITHUB_REPOSITORY || 'OpenMined/biovault-app'
const endpointJson = endpointJsonInput()
const remoteTargets = loadRemoteTargets()
const remoteTargetIds = remoteTargets.map((target) => target.id)
const strictRemoteTargetIds = loadCompletionRemoteTargetIds()
const strictRemoteTargets = strictRemoteTargetIds
	.map((id) => remoteTargets.find((target) => target.id === id))
	.filter(Boolean)
const knownEndpointKeys = new Set(['default', ...remoteTargetIds])
const selectedRemoteTargets = setFromCsv(process.env.WEB_COMPAT_REMOTE_TARGETS)
const includeDeferredRemoteTargets = process.env.WEB_COMPAT_INCLUDE_DEFERRED === '1'
const knownRemoteTargetIds = new Set(remoteTargetIds)
const unknownSelectedRemoteTargets = Array.from(selectedRemoteTargets).filter((id) => !knownRemoteTargetIds.has(id))
const missingStrictRemoteTargets = strictRemoteTargetIds.filter((id) => !knownRemoteTargetIds.has(id))
const selectedDeferredRemoteTargets = remoteTargets.filter((target) => selectedRemoteTargets.has(target.id) && target.required === 'deferred')
const targetSelectionErrors = selectedTargetErrors()

if (targetSelectionErrors.length) {
	console.error('Browser compatibility provider target selection is invalid.')
	for (const error of targetSelectionErrors) console.error(error)
	process.exit(1)
}

if (endpointJson) {
	validateEndpointJson(endpointJson)
	console.log('Browser compatibility provider endpoints are available in the current environment.')
	process.exit(0)
}

if (process.env.WEB_COMPAT_SKIP_GH_SECRET_LOOKUP === '1') {
	reportMissingSecret()
	process.exit(1)
}

const gh = spawnSync('gh', ['secret', 'list', '--repo', providerRepository], { encoding: 'utf8' })
if (gh.status !== 0) {
	console.error('Browser compatibility provider endpoints are not available in the environment.')
	console.error('GitHub CLI secret lookup also failed; install/authenticate gh or set WEB_COMPAT_REMOTE_ENDPOINTS_JSON locally.')
	if (gh.stderr.trim()) console.error(gh.stderr.trim())
	process.exit(1)
}

const hasSecret = gh.stdout.split(/\r?\n/)
	.map((line) => line.trim().split(/\s+/)[0])
	.includes(secretName)

if (!hasSecret) {
	reportMissingSecret()
	process.exit(1)
}

console.log(`GitHub Actions repository secret ${secretName} is configured.`)

function reportMissingSecret() {
	console.error(`Missing provider endpoint input ${secretName}.`)
	console.error('Remote Android/iOS browser compatibility provider runs cannot complete until endpoint JSON is provided in the environment, a local file, a repo-root browser-compat-endpoints.json file, a GitHub Actions endpoint JSON secret visible to the workflow, or CI-visible BrowserStack/LambdaTest credential secrets that can render endpoint JSON.')
	const requiredTargets = requiredEndpointTargets().map((target) => target.id)
	if (requiredTargets.length) {
		console.error(`Required endpoint target ids for this run: ${requiredTargets.join(', ')}`)
	}
	if (strictRemoteTargetIds.length && strictRemoteTargetIds.join(',') !== requiredTargets.join(',')) {
		console.error(`Strict completion remote target ids: ${strictRemoteTargetIds.join(', ')}`)
	}
	console.error('Use tests/browser-compat-remote-endpoints.example.json as the JSON shape.')
	console.error('For a local run, export WEB_COMPAT_REMOTE_ENDPOINTS_JSON="$(cat browser-compat-endpoints.json)".')
	console.error('Or place browser-compat-endpoints.json at the repo root.')
	console.error('Or set WEB_COMPAT_REMOTE_ENDPOINTS_FILE=browser-compat-endpoints.json.')
	console.error('The BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON and BROWSER_COMPAT_REMOTE_ENDPOINTS_FILE aliases are also accepted.')
	console.error(`For a repository-level CI secret, configure it with: gh secret set ${secretName} --repo ${providerRepository} < browser-compat-endpoints.json`)
	console.error('Alternatively, configure BROWSERSTACK_USERNAME plus BROWSERSTACK_ACCESS_KEY/BROWSERSTACK_ACCESSKEY, or LT_USERNAME/LAMBDATEST_USERNAME plus LT_ACCESS_KEY/LAMBDATEST_ACCESS_KEY, so the manual remote CI job can render browser-compat-endpoints.json from tests/browser-compat-provider-capabilities.example.json in runner temp storage.')
}

function validateEndpointJson(value) {
	try {
		const parsed = JSON.parse(value)
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			throw new Error('expected a JSON object')
		}
		if (!Object.keys(parsed).length) {
			throw new Error('expected at least one provider endpoint entry')
		}
		for (const [target, endpoint] of Object.entries(parsed)) {
			if (!knownEndpointKeys.has(target)) {
				throw new Error(`endpoint ${target} is not a known remote browser compatibility target`)
			}
			validateEndpointValue(target, endpoint)
		}
		const requiredTargets = requiredEndpointTargets()
		const missingTargets = requiredTargets.filter((target) => !endpointFor(parsed, target.id))
		if (missingTargets.length) {
			throw new Error(`missing provider endpoint(s) for required target id(s): ${missingTargets.map((target) => target.id).join(', ')}`)
		}
	} catch (error) {
		console.error('Browser compatibility provider endpoint JSON is invalid.')
		console.error(error instanceof Error ? error.message : String(error))
		process.exit(1)
	}
}

function validateEndpointValue(target, endpoint) {
	const wsEndpoint = typeof endpoint === 'string'
		? endpoint
		: endpoint && typeof endpoint === 'object' && !Array.isArray(endpoint)
			? endpoint.wsEndpoint
			: null
	if (typeof wsEndpoint !== 'string') {
		throw new Error(`endpoint ${target} must be a WebSocket endpoint string or an object with wsEndpoint`)
	}
	const missingEnv = missingPlaceholderEnv(endpoint)
	if (missingEnv.length) {
		throw new Error(`endpoint ${target} references missing environment variable(s): ${Array.from(new Set(missingEnv)).join(', ')}`)
	}
	const expanded = expandEnvPlaceholders(endpoint)
	const expandedWsEndpoint = typeof expanded === 'string' ? expanded : expanded?.wsEndpoint
	if (!expandedWsEndpoint.startsWith('wss://')) {
		throw new Error(`endpoint ${target} wsEndpoint must start with wss://`)
	}
	if (isTemplateEndpoint(expandedWsEndpoint)) {
		throw new Error(`endpoint ${target} wsEndpoint still points at the checked-in template host provider.example`)
	}
}

function requiredEndpointTargets() {
	const sourceTargets = selectedRemoteTargets.size ? remoteTargets : strictRemoteTargets
	return sourceTargets.filter((target) => {
		if (selectedRemoteTargets.size && !selectedRemoteTargets.has(target.id)) return false
		if (target.required === 'deferred' && !includeDeferredRemoteTargets) return false
		return true
	})
}

function endpointFor(endpointMap, id) {
	return endpointMap[id] ?? endpointMap.default
}

function selectedTargetErrors() {
	const errors = []
	if (unknownSelectedRemoteTargets.length) {
		errors.push(`unknown selected remote browser compatibility target(s): ${unknownSelectedRemoteTargets.join(', ')}`)
	}
	if (missingStrictRemoteTargets.length) {
		errors.push(`completion contract remote target(s) are missing from the remote matrix: ${missingStrictRemoteTargets.join(', ')}`)
	}
	if (selectedDeferredRemoteTargets.length && !includeDeferredRemoteTargets) {
		errors.push(`selected deferred remote browser compatibility target(s) require WEB_COMPAT_INCLUDE_DEFERRED=1: ${selectedDeferredRemoteTargets.map((target) => target.id).join(', ')}`)
	}
	return errors
}

function missingPlaceholderEnv(value) {
	const missing = []
	visitStrings(value, (text) => {
		for (const match of text.matchAll(/\$\{([A-Z0-9_]+)\}/g)) {
			const name = match[1]
			if (process.env[name] === undefined || process.env[name] === '') missing.push(name)
		}
	})
	return missing
}

function visitStrings(value, visit) {
	if (typeof value === 'string') {
		visit(value)
	} else if (Array.isArray(value)) {
		for (const item of value) visitStrings(item, visit)
	} else if (value && typeof value === 'object') {
		for (const item of Object.values(value)) visitStrings(item, visit)
	}
}

function expandEnvPlaceholders(value) {
	if (typeof value === 'string') {
		return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name) => process.env[name] ?? '')
	}
	if (Array.isArray(value)) return value.map(expandEnvPlaceholders)
	if (value && typeof value === 'object') {
		return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expandEnvPlaceholders(item)]))
	}
	return value
}

function isTemplateEndpoint(value) {
	try {
		return new URL(value).hostname === 'provider.example'
	} catch {
		return false
	}
}

function setFromCsv(value) {
	return new Set(String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean))
}

function loadRemoteTargets() {
	if (!fs.existsSync(remoteMatrixFile)) return []
	const doc = parse(fs.readFileSync(remoteMatrixFile, 'utf8')) ?? {}
	return Array.isArray(doc.targets)
		? doc.targets.map((target) => ({ ...target, id: String(target.id) }))
		: []
}

function loadCompletionRemoteTargetIds() {
	if (!fs.existsSync(completionFile)) return remoteTargetIds
	const doc = parse(fs.readFileSync(completionFile, 'utf8')) ?? {}
	return Array.isArray(doc.remote_targets) ? doc.remote_targets.map(String) : remoteTargetIds
}

function endpointJsonInput() {
	const envValue = process.env.WEB_COMPAT_REMOTE_ENDPOINTS_JSON || process.env.BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON
	if (envValue) return envValue
	const file = process.env.WEB_COMPAT_REMOTE_ENDPOINTS_FILE || process.env.BROWSER_COMPAT_REMOTE_ENDPOINTS_FILE
	if (file) return readEndpointFile(file)
	const defaultFile = path.resolve(root, process.env.WEB_COMPAT_REMOTE_ENDPOINTS_DEFAULT_FILE ?? 'browser-compat-endpoints.json')
	if (fs.existsSync(defaultFile)) return fs.readFileSync(defaultFile, 'utf8')
	return ''
}

function readEndpointFile(file) {
	const resolved = path.resolve(root, file)
	if (!fs.existsSync(resolved)) {
		console.error(`Missing remote browser endpoint file: ${path.relative(root, resolved)}`)
		process.exit(1)
	}
	return fs.readFileSync(resolved, 'utf8')
}
