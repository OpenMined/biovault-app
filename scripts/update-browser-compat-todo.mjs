#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'

const root = path.resolve(import.meta.dirname, '..')
const resultsFile = path.resolve(root, process.env.WEB_COMPAT_RESULTS_FILE ?? 'test-output/browser-compat/results.json')
const policyFile = path.resolve(root, process.env.WEB_COMPAT_POLICY_FILE ?? 'lib/browser-support.generated.ts')
const todoFile = path.resolve(root, process.env.WEB_COMPAT_TODO_FILE ?? 'TODO.md')
const remoteMatrixFile = path.resolve(root, process.env.WEB_COMPAT_REMOTE_MATRIX_FILE ?? 'tests/browser-compat-remote-matrix.yaml')

const androidTargets = new Map([
	['Chrome on Android latest.', 'android-chrome-latest'],
	['Chrome on Android one or two older major versions.', 'android-chrome-previous'],
	['Firefox Android latest.', 'android-firefox-latest'],
	['Samsung Internet latest.', 'android-samsung-internet-latest'],
])
const iosTargets = new Map([
	['Safari latest.', 'ios-safari-latest'],
	['Safari on the oldest iOS version we intend to support.', 'ios-safari-oldest-supported'],
	['Chrome iOS latest.', 'ios-chrome-latest'],
	['Firefox iOS latest.', 'ios-firefox-latest'],
])
const policyRows = [
	['Chrome/Chromium', 'chromium'],
	['Firefox', 'firefox'],
	['Safari/WebKit', 'safari'],
	['Samsung Internet', 'samsungInternet'],
	['Chrome iOS', 'chromeIos'],
	['Firefox iOS', 'firefoxIos'],
]
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

const rows = readJsonArray(resultsFile)
const remoteTargets = loadRemoteTargets()
const passingTargets = new Set(rows
	.filter((row) => row.remoteTargetId && trustedProviderTarget(row))
	.map((row) => String(row.remoteTargetId)))
const policy = parseGeneratedPolicy(fs.readFileSync(policyFile, 'utf8'))
const original = fs.readFileSync(todoFile, 'utf8')
let updated = updateCheckboxes(original)
updated = updatePolicyTable(updated)

if (updated !== original) {
	fs.writeFileSync(todoFile, updated)
	console.log(`Updated ${path.relative(root, todoFile)}`)
} else {
	console.log(`${path.relative(root, todoFile)} already matches current browser compatibility evidence`)
}

function updateCheckboxes(text) {
	let section = ''
	return text.split(/\r?\n/).map((line) => {
		const heading = line.match(/^##\s+\d+\.\s+(.+)$/)
		if (heading) section = heading[1]
		if (section === 'Android Mobile Browser Testing') {
			if (checkboxText(line) === 'Test at minimum:') return checkboxLine(line, allPassed(androidTargets))
			return updateTargetCheckbox(line, androidTargets)
		}
		if (section === 'iOS Mobile Browser Testing, Deferred') {
			if (checkboxText(line) === 'Test at minimum:') return checkboxLine(line, allPassed(iosTargets))
			return updateTargetCheckbox(line, iosTargets)
		}
		return line
	}).join('\n')
}

function updateTargetCheckbox(line, targets) {
	const text = checkboxText(line)
	if (!text || !targets.has(text)) return line
	return checkboxLine(line, passingTargets.has(targets.get(text)))
}

function checkboxText(line) {
	const match = line.match(/^(\s*)- \[[ x]\] (.+)$/)
	return match?.[2] ?? ''
}

function checkboxLine(line, checked) {
	return line.replace(/^(\s*)- \[[ x]\]/, `$1- [${checked ? 'x' : ' '}]`)
}

function allPassed(targets) {
	return Array.from(targets.values()).every((target) => passingTargets.has(target))
}

function updatePolicyTable(text) {
	let result = text
	for (const [label, family] of policyRows) {
		const familyPolicy = policy[family]
		if (!familyPolicy) throw new Error(`Missing generated browser support policy family ${family}`)
		const row = `| ${label} | ${formatPolicyValue(familyPolicy.minimumKnownGood)} | ${formatPolicyValue(familyPolicy.latestKnownGood)} | ${formatFailing(familyPolicy.knownFailing)} |`
		const pattern = new RegExp(`^\\|\\s*${escapeRegex(label)}\\s*\\|.*$`, 'm')
		if (!pattern.test(result)) throw new Error(`TODO.md is missing current generated UI policy row for ${label}`)
		result = result.replace(pattern, row)
	}
	return result
}

function formatPolicyValue(value) {
	return Number.isFinite(value) ? String(value) : 'None'
}

function formatFailing(value) {
	return Array.isArray(value) && value.length ? value.join(', ') : 'None'
}

function readJsonArray(file) {
	if (!fs.existsSync(file)) {
		console.error(`Missing compatibility results: ${path.relative(root, file)}`)
		process.exit(1)
	}
	const value = JSON.parse(fs.readFileSync(file, 'utf8'))
	if (!Array.isArray(value)) {
		console.error('Compatibility results must be an array.')
		process.exit(1)
	}
	return value
}

function passed(row) {
	return row.status === 'passed' && row.reportRunStatus === 'passed' && row.artifactValidationStatus === 'passed'
}

function trustedProviderTarget(row) {
	if (row.compatibilitySource !== 'remote-provider' || !passed(row)) return false
	if (!hasResultMetadata(row) || !hasPassingEvidence(row)) return false
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
	if (!row.capabilities || typeof row.capabilities !== 'object') return false
	if (!Array.isArray(row.artifactNames)) return false
	if (row.artifactNames.some((item) => typeof item !== 'string' || !item.trim())) return false
	if (requiredArtifacts.some((artifact) => !row.artifactNames.includes(artifact))) return false
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

function browserNameMatchesRemoteTarget(browserName, target) {
	const name = String(browserName ?? '').toLowerCase()
	if (target.browser === 'chrome') return name.includes('chrome') && !name.includes('chromium')
	if (target.browser === 'firefox') return name.includes('firefox')
	if (target.browser === 'safari') return name.includes('safari')
	if (target.browser === 'samsung-internet') return name.includes('samsung')
	return name === String(target.browser ?? '').toLowerCase()
}

function parseGeneratedPolicy(text) {
	const match = text.match(/export const GENERATED_BROWSER_SUPPORT_POLICY = ([\s\S]*?) as const/)
	if (!match?.[1]) {
		console.error('Could not parse GENERATED_BROWSER_SUPPORT_POLICY.')
		process.exit(1)
	}
	const json = match[1]
		.replace(/([,{]\s*)([a-zA-Z_][a-zA-Z0-9_]*):/g, '$1"$2":')
		.replace(/'/g, '"')
	return JSON.parse(json)
}

function escapeRegex(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
