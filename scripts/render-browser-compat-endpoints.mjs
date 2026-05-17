#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'

const root = path.resolve(import.meta.dirname, '..')
const matrixFile = path.resolve(root, process.env.WEB_COMPAT_REMOTE_MATRIX_FILE ?? 'tests/browser-compat-remote-matrix.yaml')
const provider = process.argv[2]
const inputFile = process.argv[3]
const allowPlaceholders = process.env.WEB_COMPAT_ENDPOINT_ALLOW_PLACEHOLDERS === '1'

const providers = {
	browserstack: {
		param: 'caps',
		url: 'wss://cdp.browserstack.com/playwright',
	},
	lambdatest: {
		param: 'capabilities',
		url: 'wss://cdp.lambdatest.com/playwright',
	},
}

if (!provider || !inputFile || !providers[provider]) {
	console.error('Usage: npm run render:browser-compat-endpoints -- <browserstack|lambdatest> path/to/capabilities.json')
	process.exit(2)
}

const remoteTargets = readRemoteTargets()
const targetsById = new Map(remoteTargets.map((target) => [target.id, target]))
const knownTargets = new Set(remoteTargets.map((target) => target.id))
const capabilities = readCapabilities(provider, path.resolve(root, inputFile))
const endpoints = {}
const errors = []

for (const [targetId, rawCaps] of Object.entries(capabilities)) {
	if (!knownTargets.has(targetId)) {
		errors.push(`unknown browser compatibility target: ${targetId}`)
		continue
	}
	if (!rawCaps || typeof rawCaps !== 'object' || Array.isArray(rawCaps)) {
		errors.push(`${targetId} capabilities must be an object`)
		continue
	}
	validateCapabilitiesMatchTarget(rawCaps, targetId)
	const caps = expandEnvPlaceholders(rawCaps, targetId)
	const config = providers[provider]
	endpoints[targetId] = {
		wsEndpoint: `${config.url}?${config.param}=${encodeURIComponent(JSON.stringify(caps))}`,
	}
}

if (errors.length) {
	for (const error of errors) console.error(error)
	process.exit(1)
}

console.log(JSON.stringify(endpoints, null, '\t'))

function readRemoteTargets() {
	const doc = parse(fs.readFileSync(matrixFile, 'utf8')) ?? {}
	return Array.isArray(doc.targets) ? doc.targets : []
}

function validateCapabilitiesMatchTarget(caps, targetId) {
	const target = targetsById.get(targetId)
	if (!target) return
	const browserName = provider === 'browserstack' ? caps.browser : caps.browserName
	if (browserName && !browserNameMatchesTarget(browserName, target)) {
		errors.push(`${targetId} ${provider} browser ${browserName} does not match target browser ${target.browser}`)
	}
	if (target.device_name && (!hasText(caps.deviceName) || !deviceNameMatchesTarget(caps.deviceName, target.device_name))) {
		errors.push(`${targetId} ${provider} device ${caps.deviceName || '<missing>'} does not match target device ${target.device_name}`)
	}
	const osVersion = provider === 'browserstack' ? caps.osVersion : caps.platformVersion
	if (target.os_version && normalizeVersion(osVersion) !== normalizeVersion(target.os_version)) {
		errors.push(`${targetId} ${provider} OS version ${osVersion || '<missing>'} does not match target OS version ${target.os_version}`)
	}
}

function browserNameMatchesTarget(browserName, target) {
	const normalized = String(browserName).toLowerCase().replace(/[^a-z]/g, '')
	if (target.browser === 'chrome') return normalized.includes('chrome')
	if (target.browser === 'firefox') return normalized.includes('firefox')
	if (target.browser === 'safari') return normalized.includes('safari')
	if (target.browser === 'samsung-internet') return normalized.includes('samsung')
	return false
}

function deviceNameMatchesTarget(value, expected) {
	const actual = normalizeDeviceName(value)
	const normalizedExpected = normalizeDeviceName(expected)
	return actual.includes(normalizedExpected) || normalizedExpected.includes(actual)
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

function readCapabilities(selectedProvider, file) {
	if (!fs.existsSync(file)) {
		console.error(`Missing capabilities file: ${path.relative(root, file)}`)
		process.exit(1)
	}
	const doc = JSON.parse(fs.readFileSync(file, 'utf8'))
	const providerBlock = doc[selectedProvider] ?? (doc.provider === selectedProvider ? doc : null)
	const targets = providerBlock?.targets ?? providerBlock
	if (!targets || typeof targets !== 'object' || Array.isArray(targets)) {
		console.error(`Capabilities file must contain a "${selectedProvider}" object or {"provider":"${selectedProvider}","targets":{...}}.`)
		process.exit(1)
	}
	return Object.fromEntries(Object.entries(targets).filter(([key]) => key !== 'provider' && key !== 'targets'))
}

function expandEnvPlaceholders(value, targetId) {
	if (typeof value === 'string') {
		return value.replace(/\$\{([A-Z0-9_]+)\}/g, (match, name) => {
			const replacement = process.env[name]
			if (replacement === undefined || replacement === '') {
				if (allowPlaceholders) return match
				errors.push(`${targetId} references missing environment variable ${name}`)
				return match
			}
			return replacement
		})
	}
	if (Array.isArray(value)) return value.map((item) => expandEnvPlaceholders(item, targetId))
	if (value && typeof value === 'object') {
		return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expandEnvPlaceholders(item, targetId)]))
	}
	return value
}
