#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'

const root = path.resolve(import.meta.dirname, '..')
const file = path.resolve(root, process.env.WEB_COMPAT_REMOTE_MATRIX_FILE ?? 'tests/browser-compat-remote-matrix.yaml')
const endpointsExampleFile = path.resolve(root, process.env.WEB_COMPAT_REMOTE_ENDPOINTS_EXAMPLE_FILE ?? 'tests/browser-compat-remote-endpoints.example.json')
const providerCapabilitiesExampleFile = path.resolve(root, process.env.WEB_COMPAT_PROVIDER_CAPABILITIES_EXAMPLE_FILE ?? 'tests/browser-compat-provider-capabilities.example.json')
const endpointRendererFile = path.join(root, 'scripts/render-browser-compat-endpoints.mjs')
const completionFile = path.resolve(root, process.env.WEB_COMPAT_COMPLETION_FILE ?? 'tests/browser-compat-completion.yaml')
const errors = []
const doc = parse(fs.readFileSync(file, 'utf8'))
const targets = Array.isArray(doc?.targets) ? doc.targets : []
const completion = loadCompletionContract()
const requiredIds = arrayValue(completion.remote_targets, 'remote_targets')

const ids = new Set()
const targetsById = new Map()
for (const target of targets) {
	if (!target || typeof target !== 'object') {
		errors.push('target entries must be objects')
		continue
	}
	for (const key of ['id', 'platform', 'browser', 'version', 'device_name', 'os_version', 'project', 'required']) {
		if (!target[key]) errors.push(`${target.id ?? '<unknown>'} missing ${key}`)
	}
	if (ids.has(target.id)) errors.push(`duplicate target id: ${target.id}`)
	ids.add(target.id)
	targetsById.set(target.id, target)
	if (!['android', 'ios'].includes(target.platform)) errors.push(`${target.id} has unsupported platform ${target.platform}`)
	if (!['chromium', 'firefox', 'webkit'].includes(target.project)) errors.push(`${target.id} has unsupported project ${target.project}`)
}

for (const id of requiredIds) {
	if (!ids.has(id)) errors.push(`missing required target: ${id}`)
}

if (!fs.existsSync(endpointsExampleFile)) {
	errors.push(`missing endpoint template: ${path.relative(root, endpointsExampleFile)}`)
} else {
	const example = loadJsonObject(endpointsExampleFile, 'endpoint template')
	if (example) {
		for (const id of requiredIds) {
			const endpoint = example[id]
			if (!endpoint) {
				errors.push(`endpoint template missing ${id}`)
				continue
			}
			if (!validEndpoint(endpoint)) errors.push(`endpoint template ${id} must be a wss:// string or an object with wsEndpoint`)
		}
		for (const id of Object.keys(example)) {
			if (!ids.has(id) && id !== 'default') errors.push(`endpoint template has unknown target ${id}`)
		}
	}
}

validateCompletionContract(completion)
validateProviderCapabilitiesExample()
validateEndpointRenderer()

if (errors.length) {
	for (const error of errors) console.error(error)
	process.exit(1)
}

console.log(`Browser compatibility remote matrix OK (${targets.length} targets)`)

function validEndpoint(endpoint) {
	const value = typeof endpoint === 'string' ? endpoint : endpoint?.wsEndpoint
	return typeof value === 'string' && value.startsWith('wss://')
}

function validateProviderCapabilitiesExample() {
	if (!fs.existsSync(providerCapabilitiesExampleFile)) {
		errors.push(`missing provider capability template: ${path.relative(root, providerCapabilitiesExampleFile)}`)
		return
	}
	const example = loadJsonObject(providerCapabilitiesExampleFile, 'provider capability template')
	if (!example) return
	for (const provider of ['browserstack', 'lambdatest']) {
		const block = example[provider]
		if (!block || typeof block !== 'object' || Array.isArray(block)) {
			errors.push(`provider capability template missing ${provider} object`)
			continue
		}
		for (const id of requiredIds) {
			const caps = block[id]
			if (!caps || typeof caps !== 'object' || Array.isArray(caps)) {
				errors.push(`provider capability template ${provider}.${id} must be an object`)
				continue
			}
			const browserName = providerBrowserName(caps, provider)
			const browserVersion = providerBrowserVersion(caps, provider)
			if (!browserName) {
				errors.push(`provider capability template ${provider}.${id} missing ${provider === 'browserstack' ? 'browser' : 'browserName'}`)
			} else if (!browserNameMatchesTarget(browserName, targetsById.get(id))) {
				errors.push(
					`provider capability template ${provider}.${id} browser ${browserName} does not match target browser ${targetsById.get(id)?.browser}`
				)
			}
			if (!browserVersion) {
				errors.push(`provider capability template ${provider}.${id} missing ${provider === 'browserstack' ? 'browser_version' : 'browserVersion'}`)
			}
			if (!providerDeviceNameMatches(caps, provider, targetsById.get(id))) {
				errors.push(`provider capability template ${provider}.${id} device does not match target device ${targetsById.get(id)?.device_name}`)
			}
			if (!providerOsVersionMatches(caps, provider, targetsById.get(id))) {
				errors.push(`provider capability template ${provider}.${id} OS version does not match target OS version ${targetsById.get(id)?.os_version}`)
			}
			if (!hasTargetMetadata(caps, id)) {
				errors.push(`provider capability template ${provider}.${id} should include target id in name/session metadata`)
			}
		}
		for (const id of Object.keys(block)) {
			if (!ids.has(id)) errors.push(`provider capability template ${provider} has unknown target ${id}`)
		}
	}
}

function validateEndpointRenderer() {
	for (const provider of ['browserstack', 'lambdatest']) {
		const rendered = spawnSync(process.execPath, [endpointRendererFile, provider, providerCapabilitiesExampleFile], {
			cwd: root,
			encoding: 'utf8',
			env: { ...process.env, WEB_COMPAT_ENDPOINT_ALLOW_PLACEHOLDERS: '1', WEB_COMPAT_REMOTE_MATRIX_FILE: file },
		})
		if (rendered.status !== 0) {
			errors.push(`endpoint renderer failed for ${provider}: ${(rendered.stderr || rendered.stdout).trim()}`)
			continue
		}
		let endpoints
		try {
			endpoints = JSON.parse(rendered.stdout)
		} catch (error) {
			errors.push(`endpoint renderer produced invalid JSON for ${provider}: ${error instanceof Error ? error.message : String(error)}`)
			continue
		}
		for (const id of requiredIds) {
			if (!validEndpoint(endpoints[id])) {
				errors.push(`endpoint renderer output ${provider}.${id} must be an object with wss:// wsEndpoint`)
			}
		}
		for (const id of Object.keys(endpoints)) {
			if (!ids.has(id)) errors.push(`endpoint renderer output ${provider} has unknown target ${id}`)
		}
	}
}

function hasNonEmptyString(object, key) {
	return typeof object[key] === 'string' && object[key].trim() !== ''
}

function providerBrowserName(caps, provider) {
	return provider === 'browserstack'
		? hasNonEmptyString(caps, 'browser') && caps.browser
		: hasNonEmptyString(caps, 'browserName') && caps.browserName
}

function providerBrowserVersion(caps, provider) {
	return provider === 'browserstack'
		? hasNonEmptyString(caps, 'browser_version') && caps.browser_version
		: hasNonEmptyString(caps, 'browserVersion') && caps.browserVersion
}

function browserNameMatchesTarget(browserName, target) {
	if (!target) return false
	const normalized = String(browserName).toLowerCase().replace(/[^a-z]/g, '')
	if (target.browser === 'chrome') return normalized.includes('chrome')
	if (target.browser === 'firefox') return normalized.includes('firefox')
	if (target.browser === 'safari') return normalized.includes('safari')
	if (target.browser === 'samsung-internet') return normalized.includes('samsung')
	return false
}

function providerDeviceNameMatches(caps, provider, target) {
	if (!target?.device_name) return true
	const value = provider === 'browserstack' ? caps.deviceName : caps.deviceName
	if (!hasText(value)) return false
	const actual = normalizeDeviceName(value)
	const expected = normalizeDeviceName(target.device_name)
	return actual.includes(expected) || expected.includes(actual)
}

function providerOsVersionMatches(caps, provider, target) {
	if (!target?.os_version) return true
	const value = provider === 'browserstack' ? caps.osVersion : caps.platformVersion
	if (!hasText(value)) return false
	return normalizeVersion(value) === normalizeVersion(target.os_version)
}

function normalizeDeviceName(value) {
	return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function normalizeVersion(value) {
	const parts = String(value ?? '').trim().split('.').map((part) => Number(part))
	while (parts.length > 1 && parts.at(-1) === 0) parts.pop()
	return parts.join('.')
}

function hasText(value) {
	return typeof value === 'string' && value.trim() !== ''
}

function hasTargetMetadata(object, targetId) {
	return Object.values(object).some((value) => typeof value === 'string' && value.includes(targetId))
}

function validateCompletionContract(completion) {
	const localProjects = arrayValue(completion.local_projects, 'local_projects')
	const localTargets = arrayValue(completion.local_targets, 'local_targets')
	const minimumBrackets = arrayValue(completion.minimum_brackets, 'minimum_brackets')
	const policyFamilies = arrayValue(completion.policy_families, 'policy_families')
	for (const project of localProjects) {
		if (!['chromium', 'firefox', 'webkit', 'mobile-chromium', 'mobile-firefox'].includes(project)) {
			errors.push(`completion contract has unsupported local project ${project}`)
		}
	}
	for (const target of localTargets) {
		if (!['android-local'].includes(target)) errors.push(`completion contract has unsupported local target ${target}`)
	}
	for (const id of requiredIds) {
		if (!ids.has(id)) errors.push(`completion contract references unknown remote target ${id}`)
	}
	for (const family of minimumBrackets) {
		if (!['chromium', 'firefox', 'safari'].includes(family)) {
			errors.push(`completion contract has unsupported minimum bracket family ${family}`)
		}
	}
	for (const family of policyFamilies) {
		if (!['chromium', 'firefox', 'safari', 'samsungInternet', 'chromeIos', 'firefoxIos', 'unknown'].includes(family)) {
			errors.push(`completion contract has unsupported policy family ${family}`)
		}
	}
	const todoFile = completion.todo_file ? path.resolve(root, completion.todo_file) : ''
	if (!todoFile || !fs.existsSync(todoFile)) {
		errors.push(`completion contract todo_file is missing or does not exist: ${completion.todo_file ?? '<unset>'}`)
	}
}

function loadCompletionContract() {
	if (!fs.existsSync(completionFile)) {
		errors.push(`missing completion contract: ${path.relative(root, completionFile)}`)
		return {}
	}
	return parse(fs.readFileSync(completionFile, 'utf8')) ?? {}
}

function arrayValue(value, key) {
	if (!Array.isArray(value)) {
		errors.push(`completion contract ${key} must be an array`)
		return []
	}
	return value.map(String)
}

function loadJsonObject(jsonFile, label) {
	let value
	try {
		value = JSON.parse(fs.readFileSync(jsonFile, 'utf8'))
	} catch (error) {
		errors.push(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
		return null
	}
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		errors.push(`${label} must be a top-level object`)
		return null
	}
	return value
}
