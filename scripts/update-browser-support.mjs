#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'

const root = path.resolve(import.meta.dirname, '..')
const input = path.resolve(root, process.env.WEB_COMPAT_RESULTS_FILE ?? 'test-output/browser-compat/results.json')
const output = path.resolve(root, process.env.WEB_COMPAT_POLICY_FILE ?? 'lib/browser-support.generated.ts')
const remoteMatrixFile = path.resolve(root, process.env.WEB_COMPAT_REMOTE_MATRIX_FILE ?? 'tests/browser-compat-remote-matrix.yaml')
const existingPolicy = fs.existsSync(output) ? parseGeneratedPolicy(fs.readFileSync(output, 'utf8')) : {}

if (!fs.existsSync(input)) {
	console.error(`Missing compatibility results: ${path.relative(root, input)}`)
	console.error('Run npm run test:web-compat first.')
	process.exit(1)
}

const rows = JSON.parse(fs.readFileSync(input, 'utf8'))
if (!Array.isArray(rows)) {
	console.error('Compatibility results must be an array.')
	process.exit(1)
}
const compatibilitySources = new Set(['local-playwright', 'android-local', 'remote-provider'])
const requiredSampleId = 'WEB_COMPAT_REQUIRED_SAMPLE_ID' in process.env
	? String(process.env.WEB_COMPAT_REQUIRED_SAMPLE_ID ?? '').trim()
	: '23andme-v5-hu50B3F5'
const requiredArtifacts = csvEnv('WEB_COMPAT_REQUIRED_ARTIFACTS', ['observations.tsv', 'analysis.jsonl', 'reports.jsonl', 'index.html'])
const requiredPassingCapabilityFlags = [
	'secureContext',
	'webAssembly',
	'webAssemblyValidate',
	'worker',
	'moduleWorker',
	'blob',
	'file',
	'fileReader',
	'fileReaderSyncInWorker',
	'fetch',
	'readableStream',
	'indexedDB',
	'localStorage',
	'cryptoSubtle',
]
const remoteTargets = loadRemoteTargets()
const invalidProviderOnlyFamilies = new Set()

const policy = {
	chromium: emptyPolicy(),
	firefox: emptyPolicy(),
	safari: emptyPolicy(),
	samsungInternet: emptyPolicy(),
	chromeIos: emptyPolicy(),
	firefoxIos: emptyPolicy(),
	unknown: emptyPolicy(),
}

for (const row of rows) {
	if (!trustedEvidence(row)) {
		const invalidFamily = providerOnlyFamilyForTarget(row)
		if (invalidFamily) invalidProviderOnlyFamilies.add(invalidFamily)
		continue
	}
	const family = browserFamily(row.browserName, row.capabilities?.userAgent)
	const major = majorVersionForFamily(row, family)
	if (!major) continue
	const target = policy[family]
	if (row.status === 'passed' && row.reportRunStatus === 'passed' && row.artifactValidationStatus === 'passed') {
		target.passing.add(major)
	} else if (row.status === 'failed') {
		target.failing.add(major)
	}
}

const rendered = Object.fromEntries(Object.entries(policy).map(([family, value]) => {
	const passing = Array.from(value.passing).sort((a, b) => a - b)
	const failing = Array.from(value.failing).filter((major) => !value.passing.has(major)).sort((a, b) => a - b)
	if (!passing.length && !failing.length && existingPolicy[family] && !invalidProviderOnlyFamilies.has(family)) {
		return [family, existingPolicy[family]]
	}
	return [family, {
		minimumKnownGood: passing[0] ?? null,
		latestKnownGood: passing.at(-1) ?? null,
		knownFailing: failing,
	}]
}))

fs.writeFileSync(output, renderPolicy(rendered))
console.log(`Updated ${path.relative(root, output)}`)

function emptyPolicy() {
	return {
		passing: new Set(),
		failing: new Set(),
	}
}

function isRemoteProviderTarget(row) {
	return /^(android|ios)-/.test(String(row.remoteTargetId ?? '')) && row.remoteTargetId !== 'android-local'
}

function trustedEvidence(row) {
	if (!compatibilitySources.has(row.compatibilitySource)) return false
	if (!hasResultMetadata(row)) return false
	if (row.status === 'passed' && !hasPassingEvidence(row)) return false
	if (row.status === 'failed' && !row.failureMessage) return false
	if (row.remoteTargetId === 'android-local') return row.compatibilitySource === 'android-local'
	if (row.compatibilitySource === 'android-local') return false
	if (!isRemoteProviderTarget(row)) return true
	if (row.compatibilitySource !== 'remote-provider') return false
	const target = remoteTargets.get(String(row.remoteTargetId ?? ''))
	if (!target) return false
	if (row.projectName !== target.project) return false
	if (row.remotePlatform !== target.platform) return false
	if (row.remoteBrowser !== target.browser) return false
	if (!browserNameMatchesRemoteTarget(row.browserName, target)) return false
	if (row.remoteBrowserVersionLabel !== String(target.version)) return false
	if (target.device_name && row.remoteDeviceName !== String(target.device_name)) return false
	if (target.os_version && row.remoteOsVersion !== String(target.os_version)) return false
	return targetUserAgentErrors(row, target).length === 0
}

function hasResultMetadata(row) {
	for (const key of ['id', 'sampleId', 'engine', 'deviceProfile', 'startedAt', 'finishedAt']) {
		if (typeof row[key] !== 'string' || !row[key].trim()) return false
	}
	if (requiredSampleId && row.sampleId !== requiredSampleId) return false
	if (!Number.isFinite(row.durationMs) || row.durationMs < 0) return false
	if (!row.os || typeof row.os !== 'object' || Array.isArray(row.os)) return false
	for (const key of ['platform', 'release', 'arch']) {
		if (typeof row.os[key] !== 'string' || !row.os[key].trim()) return false
	}
	return true
}

function hasPassingEvidence(row) {
	if (row.reportRunStatus !== 'passed' || row.artifactValidationStatus !== 'passed') return false
	if (!Array.isArray(row.artifactNames)) return false
	if (row.artifactNames.some((item) => typeof item !== 'string' || !item.trim())) return false
	if (requiredArtifacts.some((artifact) => !row.artifactNames.includes(artifact))) return false
	if (!row.capabilities || typeof row.capabilities !== 'object') return false
	for (const key of requiredPassingCapabilityFlags) {
		if (row.capabilities[key] !== true) return false
	}
	for (const key of ['userAgent', 'platform', 'language']) {
		if (typeof row.capabilities[key] !== 'string' || !row.capabilities[key].trim()) return false
	}
	if (!Array.isArray(row.capabilities.failures) || row.capabilities.failures.length) return false
	if (!Array.isArray(row.consoleErrors)) return false
	return !row.consoleErrors.some(isRelevantCompatibilityError)
}

function isRelevantCompatibilityError(value) {
	return /Run failed|unreachable|wasm|webassembly/i.test(String(value ?? ''))
}

function csvEnv(name, fallback) {
	if (!(name in process.env)) return fallback
	return String(process.env[name] ?? '').split(',').map((item) => item.trim()).filter(Boolean)
}

function providerOnlyFamilyForTarget(row) {
	if (!isRemoteProviderTarget(row)) return null
	const target = remoteTargets.get(String(row.remoteTargetId ?? ''))
	if (!target) return null
	if (target.browser === 'samsung-internet') return 'samsungInternet'
	if (target.platform === 'ios' && target.browser === 'chrome') return 'chromeIos'
	if (target.platform === 'ios' && target.browser === 'firefox') return 'firefoxIos'
	return null
}

function loadRemoteTargets() {
	if (!fs.existsSync(remoteMatrixFile)) return new Map()
	const doc = parse(fs.readFileSync(remoteMatrixFile, 'utf8')) ?? {}
	return new Map((doc.targets ?? []).map((target) => [String(target.id), target]))
}

function targetUserAgentErrors(row, target) {
	const ua = String(row.capabilities?.userAgent ?? '')
	if (!ua) return ['missing user agent']
	const errors = []
	if (target.platform === 'android' && !/Android/i.test(ua)) errors.push('not Android')
	if (target.platform === 'ios' && !/(iPhone|iPad|iPod|CPU (?:iPhone )?OS)/i.test(ua)) errors.push('not iOS')
	if (target.browser === 'chrome') {
		if (target.platform === 'ios' && !/CriOS\//i.test(ua)) errors.push('not Chrome iOS')
		if (target.platform === 'android' && (!/Chrome\//i.test(ua) || /SamsungBrowser\/|Firefox\//i.test(ua))) errors.push('not Chrome Android')
	}
	if (target.browser === 'firefox' && !/(Firefox|FxiOS)\//i.test(ua)) errors.push('not Firefox')
	if (target.browser === 'samsung-internet' && !/SamsungBrowser\//i.test(ua)) errors.push('not Samsung Internet')
	if (target.browser === 'safari' && (!/Safari\//i.test(ua) || /(CriOS|FxiOS|Chrome|SamsungBrowser)\//i.test(ua))) errors.push('not Safari')
	return errors
}

function majorVersion(value) {
	const match = String(value ?? '').match(/^(\d+)/)
	return match ? Number(match[1]) : null
}

function majorVersionForFamily(row, family) {
	if (family === 'samsungInternet') {
		const match = String(row.capabilities?.userAgent ?? '').match(/SamsungBrowser\/(\d+)/)
		return match ? Number(match[1]) : majorVersion(row.browserVersion)
	}
	if (family === 'chromeIos') {
		const match = String(row.capabilities?.userAgent ?? '').match(/CriOS\/(\d+)/)
		return match ? Number(match[1]) : majorVersion(row.browserVersion)
	}
	if (family === 'firefoxIos') {
		const match = String(row.capabilities?.userAgent ?? '').match(/FxiOS\/(\d+)/)
		return match ? Number(match[1]) : majorVersion(row.browserVersion)
	}
	return majorVersion(row.browserVersion)
}

function browserFamily(browserName, userAgent = '') {
	const name = String(browserName ?? '').toLowerCase()
	const ua = String(userAgent ?? '')
	if (/CriOS\//.test(ua)) return 'chromeIos'
	if (/FxiOS\//.test(ua)) return 'firefoxIos'
	if (name.includes('samsung') || /SamsungBrowser\//.test(ua)) return 'samsungInternet'
	if (name.includes('firefox') || /Firefox|FxiOS/.test(ua)) return 'firefox'
	if (name.includes('webkit') || name.includes('safari') || /Version\/\d+.+Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg\//.test(ua)) return 'safari'
	if (name.includes('chrom') || /Chrome|Chromium|CriOS|Edg\//.test(ua)) return 'chromium'
	return 'unknown'
}

function browserNameMatchesRemoteTarget(browserName, target) {
	const name = String(browserName ?? '').toLowerCase()
	if (target.browser === 'chrome') return name.includes('chrome') && !name.includes('chromium')
	if (target.browser === 'firefox') return name.includes('firefox')
	if (target.browser === 'safari') return name.includes('safari')
	if (target.browser === 'samsung-internet') return name.includes('samsung')
	return name === String(target.browser ?? '').toLowerCase()
}

function renderPolicy(value) {
	return `${[
		'// Generated from browser compatibility results.',
		'// Update with: npm run update:browser-support',
		'',
		'type GeneratedBrowserSupportFamily =',
		...Object.keys(policy).map((family, index) => `\t${index ? '| ' : '| '}'${family}'`),
		'',
		'type GeneratedBrowserSupportPolicy = {',
		'\tminimumKnownGood: number | null',
		'\tlatestKnownGood: number | null',
		'\tknownFailing: readonly number[]',
		'}',
		'',
		'export const GENERATED_BROWSER_SUPPORT_POLICY = ' + JSON.stringify(value, null, '\t')
			.replace(/"([^"]+)":/g, '$1:')
			.replace(/"/g, '\'') + ' as const satisfies Record<GeneratedBrowserSupportFamily, GeneratedBrowserSupportPolicy>',
		'',
	].join('\n')}`
}

function parseGeneratedPolicy(text) {
	const match = text.match(/export const GENERATED_BROWSER_SUPPORT_POLICY = ([\s\S]*?) as const/)
	if (!match?.[1]) return {}
	const json = match[1]
		.replace(/([,{]\s*)([a-zA-Z_][a-zA-Z0-9_]*):/g, '$1"$2":')
		.replace(/'/g, '"')
	return JSON.parse(json)
}
