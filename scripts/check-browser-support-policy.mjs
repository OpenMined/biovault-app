#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'

const root = path.resolve(import.meta.dirname, '..')
const resultsFile = path.resolve(root, process.env.WEB_COMPAT_RESULTS_FILE ?? 'test-output/browser-compat/results.json')
const generated = path.resolve(root, process.env.WEB_COMPAT_POLICY_FILE ?? 'lib/browser-support.generated.ts')
const todoFile = path.resolve(root, process.env.WEB_COMPAT_TODO_FILE ?? 'TODO.md')
const remoteMatrixFile = path.resolve(root, process.env.WEB_COMPAT_REMOTE_MATRIX_FILE ?? 'tests/browser-compat-remote-matrix.yaml')

if (!fs.existsSync(resultsFile)) {
	console.error(`Missing compatibility results: ${path.relative(root, resultsFile)}`)
	console.error('Run npm run test:web-compat first.')
	process.exit(1)
}
if (!fs.existsSync(generated)) {
	console.error(`Missing browser support policy: ${path.relative(root, generated)}`)
	process.exit(1)
}

const rows = JSON.parse(fs.readFileSync(resultsFile, 'utf8'))
if (!Array.isArray(rows)) {
	console.error('Compatibility results must be an array.')
	process.exit(1)
}
const policy = parseGeneratedPolicy(fs.readFileSync(generated, 'utf8'))
const errors = []
const passingMajors = new Set()
const providerOnlyMajors = new Map()
const compatibilitySources = new Set(['local-playwright', 'android-local', 'remote-provider'])
const providerOnlyPolicyFamilies = new Set(['samsungInternet', 'chromeIos', 'firefoxIos'])
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
const trustedRows = rows.filter((row) => trustedEvidence(row))

for (const row of trustedRows) {
	const family = browserFamily(row.browserName, row.capabilities?.userAgent)
	const major = majorVersionForFamily(row, family)
	if (major && row.status === 'passed' && row.reportRunStatus === 'passed' && row.artifactValidationStatus === 'passed') {
		passingMajors.add(`${family}:${major}`)
		if (providerOnlyPolicyFamilies.has(family)) {
			const majors = providerOnlyMajors.get(family) ?? []
			majors.push(major)
			providerOnlyMajors.set(family, majors)
		}
	}
}

for (const row of trustedRows) {
	const family = browserFamily(row.browserName, row.capabilities?.userAgent)
	const major = majorVersionForFamily(row, family)
	if (!major) continue
	const familyPolicy = policy[family]
	if (!familyPolicy) {
		errors.push(`${row.projectName} ${row.browserVersion} maps to unsupported policy family ${family}`)
		continue
	}
	const label = `${family} ${major} (${row.remoteTargetId || row.projectName})`
	if (row.status === 'passed' && row.reportRunStatus === 'passed' && row.artifactValidationStatus === 'passed') {
		if (familyPolicy.knownFailing.includes(major)) {
			errors.push(`${label} passed but is still listed as known failing`)
		}
		if (familyPolicy.minimumKnownGood === null || major < familyPolicy.minimumKnownGood) {
			errors.push(`${label} passed below the committed minimum known-good ${familyPolicy.minimumKnownGood}`)
		}
		if (familyPolicy.latestKnownGood === null || major > familyPolicy.latestKnownGood) {
			errors.push(`${label} passed above the committed latest known-good ${familyPolicy.latestKnownGood}; run npm run update:browser-support after a clean compatibility run`)
		}
	} else if (row.status === 'failed' && !passingMajors.has(`${family}:${major}`) && !familyPolicy.knownFailing.includes(major)) {
		errors.push(`${label} failed but is not listed as known failing`)
	}
}
for (const [family, majors] of providerOnlyMajors) {
	const familyPolicy = policy[family]
	if (!familyPolicy) continue
	const expectedMinimum = Math.min(...majors)
	const expectedLatest = Math.max(...majors)
	if (familyPolicy.minimumKnownGood !== expectedMinimum || familyPolicy.latestKnownGood !== expectedLatest) {
		errors.push(`${family} generated policy range ${familyPolicy.minimumKnownGood}-${familyPolicy.latestKnownGood} does not match provider evidence range ${expectedMinimum}-${expectedLatest}`)
	}
}
if (fs.existsSync(todoFile)) {
	errors.push(...todoPolicyErrors(fs.readFileSync(todoFile, 'utf8'), policy))
}

if (errors.length) {
	console.error('Browser support policy is not compatible with current compatibility results:')
	for (const error of errors) console.error(`- ${error}`)
	process.exit(1)
}

console.log('Browser support policy is compatible with current compatibility results.')

function trustedEvidence(row) {
	const label = row.remoteTargetId || row.projectName || '<unknown>'
	if (!hasResultMetadata(row, label)) return false
	if (!row.compatibilitySource) {
		errors.push(`${label} is missing compatibilitySource`)
		return false
	}
	if (!compatibilitySources.has(row.compatibilitySource)) {
		errors.push(`${label} has unsupported compatibilitySource: ${row.compatibilitySource}`)
		return false
	}
	if (row.status === 'passed' && !hasPassingEvidence(row, label)) return false
	if (row.status === 'failed' && !row.failureMessage) {
		errors.push(`${label} failed without a failureMessage`)
		return false
	}
	if (row.remoteTargetId === 'android-local' && row.compatibilitySource !== 'android-local') {
		errors.push(`${label} must be recorded from android-local evidence`)
		return false
	}
	if (row.compatibilitySource === 'android-local' && row.remoteTargetId !== 'android-local') {
		errors.push(`${label} has android-local evidence source but target is not android-local`)
		return false
	}
	if (isRemoteProviderTarget(row) && row.compatibilitySource !== 'remote-provider') {
		errors.push(`${label} must be recorded from remote-provider evidence`)
		return false
	}
	if (isRemoteProviderTarget(row)) {
		const target = remoteTargets.get(String(row.remoteTargetId ?? ''))
		if (!target) {
			errors.push(`${label} is not a known remote provider target`)
			return false
		}
		if (row.projectName !== target.project) errors.push(`${label} used project ${row.projectName || '<missing>'}, expected ${target.project}`)
		if (row.remotePlatform !== target.platform) errors.push(`${label} recorded platform ${row.remotePlatform || '<missing>'}, expected ${target.platform}`)
		if (row.remoteBrowser !== target.browser) errors.push(`${label} recorded browser ${row.remoteBrowser || '<missing>'}, expected ${target.browser}`)
		if (!browserNameMatchesRemoteTarget(row.browserName, target)) errors.push(`${label} recorded browserName ${row.browserName || '<missing>'}, expected ${target.browser}`)
		if (row.remoteBrowserVersionLabel !== String(target.version)) errors.push(`${label} recorded version label ${row.remoteBrowserVersionLabel || '<missing>'}, expected ${target.version}`)
		if (target.device_name && row.remoteDeviceName !== String(target.device_name)) errors.push(`${label} recorded device ${row.remoteDeviceName || '<missing>'}, expected ${target.device_name}`)
		if (target.os_version && row.remoteOsVersion !== String(target.os_version)) errors.push(`${label} recorded OS version ${row.remoteOsVersion || '<missing>'}, expected ${target.os_version}`)
		const targetErrors = targetUserAgentErrors(row, target, label)
		for (const error of targetErrors) errors.push(error)
		if (
			row.projectName !== target.project ||
			row.remotePlatform !== target.platform ||
			row.remoteBrowser !== target.browser ||
			!browserNameMatchesRemoteTarget(row.browserName, target) ||
			row.remoteBrowserVersionLabel !== String(target.version) ||
			(target.device_name && row.remoteDeviceName !== String(target.device_name)) ||
			(target.os_version && row.remoteOsVersion !== String(target.os_version)) ||
			targetErrors.length
		) return false
	}
	return true
}

function hasResultMetadata(row, label) {
	let valid = true
	for (const key of ['id', 'sampleId', 'engine', 'deviceProfile', 'startedAt', 'finishedAt']) {
		if (typeof row[key] !== 'string' || !row[key].trim()) {
			errors.push(`${label} is missing ${key}`)
			valid = false
		}
	}
	if (requiredSampleId && row.sampleId !== requiredSampleId) {
		errors.push(`${label} used sampleId ${row.sampleId || '<missing>'}, expected ${requiredSampleId}`)
		valid = false
	}
	if (!Number.isFinite(row.durationMs) || row.durationMs < 0) {
		errors.push(`${label} is missing valid durationMs`)
		valid = false
	}
	if (!row.os || typeof row.os !== 'object' || Array.isArray(row.os)) {
		errors.push(`${label} is missing os metadata`)
		return false
	}
	for (const key of ['platform', 'release', 'arch']) {
		if (typeof row.os[key] !== 'string' || !row.os[key].trim()) {
			errors.push(`${label} is missing os.${key}`)
			valid = false
		}
	}
	return valid
}

function hasPassingEvidence(row, label) {
	let valid = true
	if (row.reportRunStatus !== 'passed') {
		errors.push(`${label} did not pass report run`)
		valid = false
	}
	if (row.artifactValidationStatus !== 'passed') {
		errors.push(`${label} did not pass artifact validation`)
		valid = false
	}
	if (!Array.isArray(row.artifactNames)) {
		errors.push(`${label} is missing artifactNames evidence`)
		valid = false
	} else if (row.artifactNames.some((item) => typeof item !== 'string' || !item.trim())) {
		errors.push(`${label} artifactNames must contain only non-empty strings`)
		valid = false
	} else {
		const missing = requiredArtifacts.filter((artifact) => !row.artifactNames.includes(artifact))
		if (missing.length) {
			errors.push(`${label} is missing required artifact evidence: ${missing.join(', ')}`)
			valid = false
		}
	}
	if (!row.capabilities || typeof row.capabilities !== 'object') {
		errors.push(`${label} is missing capability probe output`)
		return false
	}
	for (const key of requiredPassingCapabilityFlags) {
		if (row.capabilities[key] !== true) {
			errors.push(`${label} did not report ${key}`)
			valid = false
		}
	}
	for (const key of ['userAgent', 'platform', 'language']) {
		if (typeof row.capabilities[key] !== 'string' || !row.capabilities[key].trim()) {
			errors.push(`${label} did not record ${key} capability evidence`)
			valid = false
		}
	}
	if (!Array.isArray(row.capabilities.failures)) {
		errors.push(`${label} capability failures must be an array`)
		valid = false
	} else if (row.capabilities.failures.length) {
		errors.push(`${label} capability probe reported failures: ${row.capabilities.failures.join('; ')}`)
		valid = false
	}
	if (!Array.isArray(row.consoleErrors)) {
		errors.push(`${label} consoleErrors must be an array`)
		valid = false
	} else {
		const relevant = row.consoleErrors.filter(isRelevantCompatibilityError)
		if (relevant.length) {
			errors.push(`${label} has relevant console/page errors: ${relevant.join('; ')}`)
			valid = false
		}
	}
	return valid
}

function isRelevantCompatibilityError(value) {
	return /Run failed|unreachable|wasm|webassembly/i.test(String(value ?? ''))
}

function isRemoteProviderTarget(row) {
	return /^(android|ios)-/.test(String(row.remoteTargetId ?? '')) && row.remoteTargetId !== 'android-local'
}

function loadRemoteTargets() {
	if (!fs.existsSync(remoteMatrixFile)) return new Map()
	const doc = parse(fs.readFileSync(remoteMatrixFile, 'utf8')) ?? {}
	return new Map((doc.targets ?? []).map((target) => [String(target.id), target]))
}

function targetUserAgentErrors(row, target, label) {
	const ua = String(row.capabilities?.userAgent ?? '')
	if (!ua) return [`${label} passed without user-agent evidence`]
	const errors = []
	if (target.platform === 'android' && !/Android/i.test(ua)) errors.push(`${label} user agent does not look like Android: ${ua}`)
	if (target.platform === 'ios' && !/(iPhone|iPad|iPod|CPU (?:iPhone )?OS)/i.test(ua)) errors.push(`${label} user agent does not look like iOS: ${ua}`)
	if (target.browser === 'chrome') {
		if (target.platform === 'ios' && !/CriOS\//i.test(ua)) errors.push(`${label} user agent does not look like Chrome iOS: ${ua}`)
		if (target.platform === 'android' && (!/Chrome\//i.test(ua) || /SamsungBrowser\/|Firefox\//i.test(ua))) errors.push(`${label} user agent does not look like Chrome Android: ${ua}`)
	}
	if (target.browser === 'firefox' && !/(Firefox|FxiOS)\//i.test(ua)) errors.push(`${label} user agent does not look like Firefox: ${ua}`)
	if (target.browser === 'samsung-internet' && !/SamsungBrowser\//i.test(ua)) errors.push(`${label} user agent does not look like Samsung Internet: ${ua}`)
	if (target.browser === 'safari' && (!/Safari\//i.test(ua) || /(CriOS|FxiOS|Chrome|SamsungBrowser)\//i.test(ua))) errors.push(`${label} user agent does not look like Safari: ${ua}`)
	return errors
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

function majorVersion(value) {
	const match = String(value ?? '').match(/^(\d+)/)
	return match ? Number(match[1]) : null
}

function csvEnv(name, fallback) {
	if (!(name in process.env)) return fallback
	return String(process.env[name] ?? '').split(',').map((item) => item.trim()).filter(Boolean)
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

function todoPolicyErrors(text, policy) {
	const errors = []
	const section = text.split('Current generated UI policy in `lib/browser-support.generated.ts`:')[1]?.split('Attempted but not usable as compatibility evidence:')[0] ?? ''
	const expected = [
		['Chrome/Chromium', 'chromium'],
		['Firefox', 'firefox'],
		['Safari/WebKit', 'safari'],
		['Samsung Internet', 'samsungInternet'],
		['Chrome iOS', 'chromeIos'],
		['Firefox iOS', 'firefoxIos'],
	]
	for (const [label, family] of expected) {
		const pattern = new RegExp(`\\|\\s*${escapeRegex(label)}\\s*\\|\\s*([^|]+?)\\s*\\|\\s*([^|]+?)\\s*\\|\\s*([^|]+?)\\s*\\|`)
		const match = section.match(pattern)
		if (!match) {
			errors.push(`TODO.md is missing current generated UI policy row for ${label}`)
			continue
		}
		const todoMinimum = parseTodoNumber(match[1])
		const todoLatest = parseTodoNumber(match[2])
		const todoFailing = parseTodoFailing(match[3])
		const familyPolicy = policy[family]
		if (todoMinimum !== familyPolicy.minimumKnownGood) {
			errors.push(`TODO.md ${label} minimum known-good ${todoMinimum} does not match generated policy ${familyPolicy.minimumKnownGood}`)
		}
		if (todoLatest !== familyPolicy.latestKnownGood) {
			errors.push(`TODO.md ${label} latest known-good ${todoLatest} does not match generated policy ${familyPolicy.latestKnownGood}`)
		}
		if (JSON.stringify(todoFailing) !== JSON.stringify(familyPolicy.knownFailing)) {
			errors.push(`TODO.md ${label} known failing ${JSON.stringify(todoFailing)} does not match generated policy ${JSON.stringify(familyPolicy.knownFailing)}`)
		}
	}
	return errors
}

function parseTodoNumber(value) {
	const trimmed = String(value ?? '').trim()
	if (trimmed.toLowerCase() === 'none' || trimmed === '') return null
	const parsed = Number(trimmed)
	return Number.isFinite(parsed) ? parsed : trimmed
}

function parseTodoFailing(value) {
	const trimmed = String(value ?? '').trim()
	if (!trimmed || trimmed.toLowerCase() === 'none') return []
	return trimmed.split(',').map((item) => Number(item.trim())).filter(Number.isFinite)
}

function escapeRegex(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
