#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parse } from 'yaml'

const root = path.resolve(import.meta.dirname, '..')
const remoteMatrixFile = path.resolve(root, process.env.WEB_COMPAT_REMOTE_MATRIX_FILE ?? 'tests/browser-compat-remote-matrix.yaml')
const versionMatrixFile = path.resolve(root, process.env.WEB_COMPAT_VERSION_MATRIX_FILE ?? 'tests/browser-compat-version-matrix.yaml')
const completionFile = path.resolve(root, process.env.WEB_COMPAT_COMPLETION_FILE ?? 'tests/browser-compat-completion.yaml')
const remoteMatrix = parse(fs.readFileSync(remoteMatrixFile, 'utf8'))
const versionMatrix = parse(fs.readFileSync(versionMatrixFile, 'utf8'))
const remoteTargets = Array.isArray(remoteMatrix?.targets) ? remoteMatrix.targets : []
const completionRemoteTargetIds = loadCompletionRemoteTargetIds()
const completionRemoteTargets = completionRemoteTargetIds
	.map((id) => remoteTargets.find((target) => target.id === id))
	.filter(Boolean)
const versionTargets = Array.isArray(versionMatrix?.targets) ? versionMatrix.targets : []
const endpoints = parseEndpointJson() ?? {}
const selectedRemoteTargets = setFromCsv(process.env.WEB_COMPAT_REMOTE_TARGETS)
const includeDeferredRemoteTargets = process.env.WEB_COMPAT_INCLUDE_DEFERRED === '1'
const requireAndroidLocal = process.env.WEB_COMPAT_REQUIRE_ANDROID_LOCAL === '1'
const requireRemoteAndroid = process.env.WEB_COMPAT_REQUIRE_REMOTE_ANDROID === '1'
const requireRemoteIos = process.env.WEB_COMPAT_REQUIRE_REMOTE_IOS === '1'
const requireHistoricalEndpoints = process.env.WEB_COMPAT_REQUIRE_HISTORICAL_ENDPOINTS === '1'
const errors = []
const sdkRoot = androidSdkRoot()
const requireRemoteProvider = requireRemoteAndroid || requireRemoteIos

const androidTools = {
	adb: androidToolExists('adb', 'platform-tools'),
	emulator: androidToolExists('emulator', 'emulator'),
	sdkmanager: androidToolExists('sdkmanager', 'cmdline-tools/latest/bin'),
	avdmanager: androidToolExists('avdmanager', 'cmdline-tools/latest/bin'),
	androidHome: Boolean(sdkRoot),
}
report('Android local toolchain', [
	['adb', androidTools.adb],
	['emulator', androidTools.emulator],
	['sdkmanager', androidTools.sdkmanager],
	['avdmanager', androidTools.avdmanager],
	['ANDROID_HOME/ANDROID_SDK_ROOT', androidTools.androidHome],
])
if (requireAndroidLocal && Object.values(androidTools).some((value) => !value)) {
	errors.push('local Android browser compatibility requires adb, emulator, sdkmanager, avdmanager, and ANDROID_HOME or ANDROID_SDK_ROOT')
}

const unknownSelectedRemoteTargets = Array.from(selectedRemoteTargets).filter((id) => !remoteTargets.some((target) => target.id === id))
for (const id of unknownSelectedRemoteTargets) errors.push(`unknown remote browser compatibility target ${id}`)
const missingCompletionRemoteTargets = completionRemoteTargetIds.filter((id) => !remoteTargets.some((target) => target.id === id))
for (const id of missingCompletionRemoteTargets) errors.push(`completion contract remote target ${id} is missing from the remote matrix`)
const selectedDeferredRemoteTargets = remoteTargets.filter((target) => selectedRemoteTargets.has(target.id) && target.required === 'deferred')
if (selectedDeferredRemoteTargets.length && !includeDeferredRemoteTargets) {
	for (const target of selectedDeferredRemoteTargets) {
		errors.push(`selected deferred remote target ${target.id} requires WEB_COMPAT_INCLUDE_DEFERRED=1`)
	}
}
const selectedRemoteTarget = (target) => !selectedRemoteTargets.size || selectedRemoteTargets.has(target.id)
const providerScopeTargets = selectedRemoteTargets.size ? remoteTargets : completionRemoteTargets
const remoteAndroidTargets = providerScopeTargets.filter((target) => selectedRemoteTarget(target) && target.platform === 'android' && target.required === true)
const remoteIosTargets = providerScopeTargets.filter((target) => selectedRemoteTarget(target) && target.platform === 'ios')
reportTargets('Remote Android endpoints', remoteAndroidTargets, endpoints)
reportTargets('Remote iOS endpoints', remoteIosTargets, endpoints)
if (requireRemoteAndroid) requireEndpointTargets(remoteAndroidTargets, endpoints, 'remote Android')
if (requireRemoteIos) requireEndpointTargets(remoteIosTargets, endpoints, 'remote iOS')
report('Remote provider web URL', [
	['WEB_URL', webUrlStatus(process.env.WEB_URL)],
])
if (requireRemoteProvider) requireProviderWebUrl(process.env.WEB_URL)

const historicalEndpointTargets = versionTargets.filter((target) => target.endpoint_env)
report('Historical provider endpoints', historicalEndpointTargets.map((target) => [target.endpoint_env, Boolean(process.env[target.endpoint_env])]))
if (requireHistoricalEndpoints) {
	for (const target of historicalEndpointTargets) {
		if (!process.env[target.endpoint_env]) errors.push(`missing historical endpoint env ${target.endpoint_env} for ${target.id}`)
	}
}

const localHistoricalTargets = versionTargets.filter((target) => target.fallback_executable || target.executable_env)
report('Local historical browser binaries', localHistoricalTargets.map((target) => [target.id, Boolean(executableFor(target))]))

const dockerTargets = versionTargets.filter((target) => target.docker_image)
report('Historical Docker images', dockerTargets.map((target) => [target.id, dockerImageExists(target.docker_image)]))

if (errors.length) {
	console.error('Browser compatibility infrastructure is incomplete:')
	for (const error of errors) console.error(`- ${error}`)
	if (errors.some((error) => /^invalid remote (Android|iOS) endpoint\b/.test(error))) {
		console.error('Remote endpoint inputs can be supplied with WEB_COMPAT_REMOTE_ENDPOINTS_JSON, a repo-root browser-compat-endpoints.json file, WEB_COMPAT_REMOTE_ENDPOINTS_FILE, BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON, BROWSER_COMPAT_REMOTE_ENDPOINTS_FILE, or CI-visible BrowserStack/LambdaTest credential secrets that render endpoint JSON in the manual remote workflow.')
	}
	process.exit(1)
}

console.log('Browser compatibility infrastructure preflight complete.')

function report(title, rows) {
	console.log(`${title}:`)
	for (const [label, status] of rows) {
		const value = typeof status === 'boolean' ? (status ? 'available' : 'missing') : status
		console.log(`- ${label}: ${value}`)
	}
}

function reportTargets(title, targets, endpointMap) {
	report(title, targets.map((target) => {
		const status = endpointStatus(endpointMap, target.id)
		return [target.id, status.ok ? 'available' : status.reason]
	}))
}

function requireEndpointTargets(targets, endpointMap, label) {
	for (const target of targets) {
		const status = endpointStatus(endpointMap, target.id)
		if (!status.ok) errors.push(`invalid ${label} endpoint for ${target.id}: ${status.reason}`)
	}
}

function endpointFor(endpointMap, id) {
	return endpointMap[id] ?? endpointMap.default
}

function endpointStatus(endpointMap, id) {
	const endpoint = endpointFor(endpointMap, id)
	if (!endpoint) return { ok: false, reason: 'missing' }
	const missingEnv = missingPlaceholderEnv(endpoint)
	if (missingEnv.length) return { ok: false, reason: `missing env ${Array.from(new Set(missingEnv)).join(', ')}` }
	const expanded = expandEnvPlaceholders(endpoint)
	const wsEndpoint = typeof expanded === 'string' ? expanded : expanded?.wsEndpoint
	if (typeof wsEndpoint !== 'string' || wsEndpoint.trim() === '') return { ok: false, reason: 'missing wsEndpoint' }
	if (!wsEndpoint.startsWith('wss://')) return { ok: false, reason: 'wsEndpoint must start with wss://' }
	if (isTemplateEndpoint(wsEndpoint)) return { ok: false, reason: 'wsEndpoint still points at template host provider.example' }
	return { ok: true, reason: 'available' }
}

function isTemplateEndpoint(value) {
	try {
		return new URL(value).hostname === 'provider.example'
	} catch {
		return false
	}
}

function requireProviderWebUrl(value) {
	const status = webUrlStatus(value)
	if (status !== 'available') errors.push(`invalid remote provider WEB_URL: ${status}`)
}

function webUrlStatus(value) {
	if (!value) return 'missing'
	let url
	try {
		url = new URL(value)
	} catch {
		return 'invalid URL'
	}
	if (!['http:', 'https:'].includes(url.protocol)) return 'must start with http:// or https://'
	if (isLocalWebUrl(url) && process.env.WEB_COMPAT_ALLOW_LOCAL_WEB_URL !== '1') {
		return 'local-only host requires WEB_COMPAT_ALLOW_LOCAL_WEB_URL=1'
	}
	if (process.env.WEB_COMPAT_CHECK_WEB_URL_REACHABLE === '1') {
		const reachable = webUrlReachabilityStatus(url)
		if (reachable !== 'available') return reachable
	}
	return 'available'
}

function webUrlReachabilityStatus(url) {
	if (!commandExists('curl')) return 'curl unavailable for reachability check'
	const commonArgs = ['--fail', '--silent', '--show-error', '--max-time', '15']
	const head = spawnSync('curl', [...commonArgs, '--head', url.href], { encoding: 'utf8' })
	if (head.status === 0) return 'available'
	const get = spawnSync('curl', [...commonArgs, '--location', '--range', '0-0', '--output', os.devNull, url.href], { encoding: 'utf8' })
	if (get.status === 0) return 'available'
	const detail = (head.stderr || get.stderr || '').trim().split(/\r?\n/).at(-1)
	return detail ? `unreachable (${detail})` : 'unreachable'
}

function isLocalWebUrl(url) {
	const hostname = url.hostname.toLowerCase()
	return hostname === 'localhost' ||
		hostname === '127.0.0.1' ||
		hostname === '::1' ||
		hostname.endsWith('.localhost') ||
		hostname.endsWith('.local')
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

function executableFor(target) {
	const configured = target.executable_env ? expandHome(process.env[target.executable_env] ?? '') : ''
	if (configured && fs.existsSync(configured)) return configured
	const fallback = expandHome(target.fallback_executable ?? '')
	if (fallback && fs.existsSync(fallback)) return fallback
	return ''
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

function validateEndpointMap(value, label) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		console.error(`${label} must be a JSON object keyed by remote target id.`)
		process.exit(2)
	}
	const knownEndpointKeys = new Set(['default', ...remoteTargets.map((target) => target.id)])
	const unknownKeys = Object.keys(value).filter((key) => !knownEndpointKeys.has(key))
	if (unknownKeys.length) {
		console.error(`${label} has unknown remote target id(s): ${unknownKeys.join(', ')}`)
		process.exit(2)
	}
	return value
}

function loadCompletionRemoteTargetIds() {
	if (!fs.existsSync(completionFile)) return remoteTargets.map((target) => String(target.id))
	const doc = parse(fs.readFileSync(completionFile, 'utf8')) ?? {}
	return Array.isArray(doc.remote_targets) ? doc.remote_targets.map(String) : remoteTargets.map((target) => String(target.id))
}

function setFromCsv(value) {
	return new Set(String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean))
}

function commandExists(command) {
	return spawnSync('sh', ['-lc', `command -v ${command}`], { stdio: 'ignore' }).status === 0
}

function androidToolExists(command, relativeDir) {
	if (commandExists(command)) return true
	return Boolean(sdkRoot && fs.existsSync(path.join(sdkRoot, relativeDir, command)))
}

function androidSdkRoot() {
	const configured = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME
	if (configured) return configured
	const defaultRoot = path.join(os.homedir(), 'Android/Sdk')
	return fs.existsSync(defaultRoot) ? defaultRoot : ''
}

function dockerImageExists(image) {
	if (!commandExists('docker')) return false
	return spawnSync('docker', ['image', 'inspect', image], { stdio: 'ignore' }).status === 0
}

function expandHome(value) {
	return value.replace(/^~(?=$|\/)/, process.env.HOME ?? '~')
}
