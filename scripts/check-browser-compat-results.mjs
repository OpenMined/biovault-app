#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'

const root = path.resolve(import.meta.dirname, '..')
const resultsFileIsDefault = !('WEB_COMPAT_RESULTS_FILE' in process.env)
const resultsFile = path.resolve(root, process.env.WEB_COMPAT_RESULTS_FILE ?? 'test-output/browser-compat/results.json')
const resultsMdFile = path.resolve(root, process.env.WEB_COMPAT_RESULTS_MD_FILE ?? path.join(path.dirname(resultsFile), 'results.md'))
const remoteMatrixFile = path.resolve(root, process.env.WEB_COMPAT_REMOTE_MATRIX_FILE ?? 'tests/browser-compat-remote-matrix.yaml')
const versionMatrixFile = path.resolve(root, process.env.WEB_COMPAT_VERSION_MATRIX_FILE ?? 'tests/browser-compat-version-matrix.yaml')
const requireHistorical = process.env.WEB_COMPAT_REQUIRE_HISTORICAL === '1'
const requireMarkdownSummary = resultsFileIsDefault || process.env.WEB_COMPAT_REQUIRE_RESULTS_MD === '1'
const requiredSampleId = 'WEB_COMPAT_REQUIRED_SAMPLE_ID' in process.env
	? String(process.env.WEB_COMPAT_REQUIRED_SAMPLE_ID ?? '').trim()
	: '23andme-v5-hu50B3F5'
const requiredArtifacts = csvEnv('WEB_COMPAT_REQUIRED_ARTIFACTS', ['observations.tsv', 'analysis.jsonl', 'reports.jsonl', 'index.html'])
const requiredProjects = csvEnv('WEB_COMPAT_REQUIRED_PROJECTS', [
	'chromium',
	'firefox',
	'webkit',
	'mobile-chromium',
	'mobile-firefox',
	'mobile-webkit',
])
const requiredTargets = [
	...csvEnv('WEB_COMPAT_REQUIRED_TARGETS', []),
	...(requireHistorical ? ['chromium-system'] : []),
]
const remoteTargets = loadRemoteTargets()
const knownTargets = new Set(['android-local', ...remoteTargets.keys(), ...loadVersionTargetIds()])

if (!fs.existsSync(resultsFile)) {
	console.error(`Missing compatibility results: ${path.relative(root, resultsFile)}`)
	process.exit(1)
}

const rows = JSON.parse(fs.readFileSync(resultsFile, 'utf8'))
if (!Array.isArray(rows)) {
	console.error('Compatibility results must be an array.')
	process.exit(1)
}

const errors = []
const compatibilitySources = new Set(['local-playwright', 'android-local', 'remote-provider'])
const runStatuses = new Set(['not-started', 'passed', 'failed'])
const requiredPassingCapabilityFlags = [
	['secureContext', 'secure context'],
	['webAssembly', 'WebAssembly support'],
	['webAssemblyValidate', 'WebAssembly validation support'],
	['worker', 'Worker support'],
	['moduleWorker', 'module Worker support'],
	['blob', 'Blob support'],
	['file', 'File API support'],
	['fileReader', 'FileReader support'],
	['fileReaderSyncInWorker', 'FileReaderSync worker support'],
	['fetch', 'fetch support'],
	['readableStream', 'ReadableStream support'],
	['indexedDB', 'IndexedDB support'],
	['localStorage', 'localStorage support'],
	['cryptoSubtle', 'crypto.subtle support'],
]
const requiredCapabilityFlags = requiredPassingCapabilityFlags.map(([key]) => key)
const seenResultIds = new Set()
for (const row of rows) {
	const label = row.remoteTargetId || row.projectName || '<unknown>'
	if (typeof row.id === 'string' && row.id.trim()) {
		if (seenResultIds.has(row.id)) errors.push(`${label} duplicates result id ${row.id}`)
		seenResultIds.add(row.id)
	}
	validateResultMetadata(row, label)
	if (!row.projectName) errors.push(`${label} is missing projectName`)
	if (!row.browserName) errors.push(`${label} is missing browserName`)
	if (!row.browserVersion) errors.push(`${label} is missing browserVersion`)
	if (!row.compatibilitySource) errors.push(`${label} is missing compatibilitySource`)
	if (row.compatibilitySource && !compatibilitySources.has(row.compatibilitySource)) errors.push(`${label} has unsupported compatibilitySource: ${row.compatibilitySource}`)
	if (row.remoteTargetId && !knownTargets.has(row.remoteTargetId)) {
		errors.push(`${label} uses unknown compatibility target id`)
	}
	validateEngineForProject(row, label)
	validateConsoleErrors(row, label)
	validateCapabilityProbe(row, label)
	validateRunStatuses(row, label)
	validateSampleId(row, label)
	validateCompatibilitySource(row, label)
	validateRemoteTargetRow(row, label)
	if (row.status === 'passed') {
		if (row.reportRunStatus !== 'passed') errors.push(`${label} did not pass report run`)
		if (row.artifactValidationStatus !== 'passed') errors.push(`${label} did not pass artifact validation`)
		validatePassingArtifacts(row, label)
		validatePassingCapabilityStatus(row, label)
		validateRelevantConsoleErrors(row, label)
	} else if (row.status === 'failed') {
		if (!row.failureMessage) errors.push(`${label} failed without a failureMessage`)
	} else {
		errors.push(`${label} has unsupported status: ${row.status}`)
	}
}

if (requireMarkdownSummary) {
	validateMarkdownSummary(rows)
}

for (const project of requiredProjects) {
	if (!rows.some((row) => isPassingLocalProject(row, project))) {
		errors.push(`missing passing local compatibility project: ${project}`)
	}
}

for (const target of requiredTargets) {
	if (!knownTargets.has(target)) {
		errors.push(`required compatibility target is unknown: ${target}`)
		continue
	}
	if (!rows.some((row) => row.remoteTargetId === target && row.status === 'passed')) {
		errors.push(`missing passing compatibility target: ${target}`)
	}
}

if (errors.length) {
	console.error('Browser compatibility results are incomplete:')
	for (const error of errors) console.error(`- ${error}`)
	process.exit(1)
}

console.log(`Browser compatibility results OK (${rows.length} rows)`)

function isPassingLocalProject(row, project) {
	return row.projectName === project &&
		row.status === 'passed' &&
		row.compatibilitySource === 'local-playwright' &&
		!isProviderTargetId(row.remoteTargetId)
}

function validateMarkdownSummary(rows) {
	if (!fs.existsSync(resultsMdFile)) {
		errors.push(`missing Markdown compatibility summary: ${path.relative(root, resultsMdFile)}`)
		return
	}
	const text = fs.readFileSync(resultsMdFile, 'utf8')
	if (!text.includes('# Browser Compatibility Results')) {
		errors.push(`${path.relative(root, resultsMdFile)} is missing the Browser Compatibility Results heading`)
	}
	if (!text.includes('| Status | Target | Source | Project | Browser | Version | Device | OS |')) {
		errors.push(`${path.relative(root, resultsMdFile)} is missing the compatibility result table header`)
	}
	const bodyRows = text.split(/\r?\n/).filter((line) => line.startsWith('| ') && !line.includes('---') && !line.startsWith('| Status |'))
	if (bodyRows.length !== rows.length) {
		errors.push(`${path.relative(root, resultsMdFile)} has ${bodyRows.length} result row(s), expected ${rows.length}`)
	}
}

function isProviderTargetId(targetId) {
	return /^(android|ios)-/.test(String(targetId ?? '')) && targetId !== 'android-local'
}

function loadRemoteTargets() {
	if (!fs.existsSync(remoteMatrixFile)) return new Map()
	const doc = parse(fs.readFileSync(remoteMatrixFile, 'utf8')) ?? {}
	const targets = Array.isArray(doc.targets) ? doc.targets : []
	return new Map(targets.map((target) => [String(target.id), target]))
}

function loadVersionTargetIds() {
	if (!fs.existsSync(versionMatrixFile)) return []
	const doc = parse(fs.readFileSync(versionMatrixFile, 'utf8')) ?? {}
	const targets = Array.isArray(doc.targets) ? doc.targets : []
	return targets.map((target) => String(target.id))
}

function validateRemoteTargetRow(row, label) {
	if (!row.remoteTargetId || !remoteTargets.has(row.remoteTargetId)) return
	const target = remoteTargets.get(row.remoteTargetId)
	if (row.projectName !== target.project) {
		errors.push(`${label} used project ${row.projectName || '<missing>'}, expected ${target.project}`)
	}
	if (row.remotePlatform !== target.platform) {
		errors.push(`${label} recorded platform ${row.remotePlatform || '<missing>'}, expected ${target.platform}`)
	}
	if (row.remoteBrowser !== target.browser) {
		errors.push(`${label} recorded browser ${row.remoteBrowser || '<missing>'}, expected ${target.browser}`)
	}
	if (!browserNameMatchesRemoteTarget(row.browserName, target)) {
		errors.push(`${label} recorded browserName ${row.browserName || '<missing>'}, expected ${target.browser}`)
	}
	if (row.remoteBrowserVersionLabel !== String(target.version)) {
		errors.push(`${label} recorded version label ${row.remoteBrowserVersionLabel || '<missing>'}, expected ${target.version}`)
	}
	if (target.device_name && row.remoteDeviceName !== String(target.device_name)) {
		errors.push(`${label} recorded device ${row.remoteDeviceName || '<missing>'}, expected ${target.device_name}`)
	}
	if (target.os_version && row.remoteOsVersion !== String(target.os_version)) {
		errors.push(`${label} recorded OS version ${row.remoteOsVersion || '<missing>'}, expected ${target.os_version}`)
	}
	if (row.compatibilitySource !== 'remote-provider') {
		errors.push(`${label} must be recorded from remote-provider evidence`)
	}
	if (row.status === 'passed') {
		for (const error of targetUserAgentErrors(row, target, label)) errors.push(error)
	}
}

function validateResultMetadata(row, label) {
	for (const key of ['id', 'sampleId', 'engine', 'deviceProfile', 'startedAt', 'finishedAt']) {
		if (typeof row[key] !== 'string' || !row[key].trim()) errors.push(`${label} is missing ${key}`)
	}
	const startedMs = Date.parse(row.startedAt)
	const finishedMs = Date.parse(row.finishedAt)
	if (typeof row.startedAt === 'string' && row.startedAt.trim() && !Number.isFinite(startedMs)) {
		errors.push(`${label} has invalid startedAt timestamp`)
	}
	if (typeof row.finishedAt === 'string' && row.finishedAt.trim() && !Number.isFinite(finishedMs)) {
		errors.push(`${label} has invalid finishedAt timestamp`)
	}
	if (Number.isFinite(startedMs) && Number.isFinite(finishedMs) && finishedMs < startedMs) {
		errors.push(`${label} finishedAt is before startedAt`)
	}
	if (!Number.isFinite(row.durationMs) || row.durationMs < 0) {
		errors.push(`${label} is missing valid durationMs`)
	} else if (Number.isFinite(startedMs) && Number.isFinite(finishedMs)) {
		const expectedDuration = finishedMs - startedMs
		if (Math.abs(row.durationMs - expectedDuration) > 1_000) {
			errors.push(`${label} durationMs ${row.durationMs} does not match startedAt/finishedAt interval ${expectedDuration}`)
		}
	}
	if (!row.os || typeof row.os !== 'object' || Array.isArray(row.os)) {
		errors.push(`${label} is missing os metadata`)
		return
	}
	for (const key of ['platform', 'release', 'arch']) {
		if (typeof row.os[key] !== 'string' || !row.os[key].trim()) errors.push(`${label} is missing os.${key}`)
	}
}

function validateCompatibilitySource(row, label) {
	if (row.remoteTargetId === 'android-local' && row.compatibilitySource !== 'android-local') {
		errors.push(`${label} must be recorded from android-local evidence`)
	}
	if (row.compatibilitySource === 'android-local' && row.remoteTargetId !== 'android-local') {
		errors.push(`${label} has android-local evidence source but target is not android-local`)
	}
}

function validateEngineForProject(row, label) {
	const project = String(row.projectName ?? '')
	const allowed = project.includes('firefox')
		? ['firefox']
		: project.includes('webkit')
			? ['webkit', 'safari']
			: project.includes('chromium') || project === 'android-local'
				? ['chromium']
				: []
	if (allowed.length && !allowed.includes(row.engine)) {
		errors.push(`${label} recorded engine ${row.engine || '<missing>'}, expected ${formatAllowedList(allowed)} for project ${project}`)
	}
}

function browserNameMatchesRemoteTarget(browserName, target) {
	const name = String(browserName ?? '').toLowerCase()
	if (target.browser === 'chrome') return name.includes('chrome') && !name.includes('chromium')
	if (target.browser === 'firefox') return name.includes('firefox')
	if (target.browser === 'safari') return name.includes('safari')
	if (target.browser === 'samsung-internet') return name.includes('samsung')
	return name === String(target.browser ?? '').toLowerCase()
}

function validateSampleId(row, label) {
	if (requiredSampleId && row.sampleId !== requiredSampleId) {
		errors.push(`${label} used sampleId ${row.sampleId || '<missing>'}, expected ${requiredSampleId}`)
	}
}

function validatePassingArtifacts(row, label) {
	if (!Array.isArray(row.artifactNames)) {
		errors.push(`${label} is missing artifactNames evidence`)
		return
	}
	if (row.artifactNames.some((item) => typeof item !== 'string' || !item.trim())) {
		errors.push(`${label} artifactNames must contain only non-empty strings`)
		return
	}
	const missing = requiredArtifacts.filter((artifact) => !row.artifactNames.includes(artifact))
	if (missing.length) errors.push(`${label} did not record required artifact(s): ${missing.join(', ')}`)
}

function formatAllowedList(values) {
	return values.length === 1 ? values[0] : values.join(' or ')
}

function validateRunStatuses(row, label) {
	if (!runStatuses.has(row.reportRunStatus)) {
		errors.push(`${label} has unsupported reportRunStatus: ${row.reportRunStatus}`)
	}
	if (!runStatuses.has(row.artifactValidationStatus)) {
		errors.push(`${label} has unsupported artifactValidationStatus: ${row.artifactValidationStatus}`)
	}
}

function validateCapabilityProbe(row, label) {
	if (!row.capabilities || typeof row.capabilities !== 'object') {
		errors.push(`${label} is missing capability probe output`)
		return
	}
	for (const key of requiredCapabilityFlags) {
		if (typeof row.capabilities[key] !== 'boolean') errors.push(`${label} capability probe is missing boolean ${key}`)
	}
	if (typeof row.capabilities.userAgent !== 'string' || !row.capabilities.userAgent.trim()) {
		errors.push(`${label} did not record userAgent capability evidence`)
	}
	if (typeof row.capabilities.platform !== 'string' || !row.capabilities.platform.trim()) {
		errors.push(`${label} did not record platform capability evidence`)
	}
	if (typeof row.capabilities.language !== 'string' || !row.capabilities.language.trim()) {
		errors.push(`${label} did not record language capability evidence`)
	}
	if (!Array.isArray(row.capabilities.failures)) {
		errors.push(`${label} capability failures must be an array`)
	} else if (row.capabilities.failures.some((item) => typeof item !== 'string')) {
		errors.push(`${label} capability failures must contain only strings`)
	}
}

function validatePassingCapabilityStatus(row, label) {
	for (const [key, description] of requiredPassingCapabilityFlags) {
		if (row.capabilities[key] !== true) errors.push(`${label} did not report ${description}`)
	}
	if (Array.isArray(row.capabilities.failures) && row.capabilities.failures.length) {
		errors.push(`${label} capability probe reported failures: ${row.capabilities.failures.join('; ')}`)
	}
}

function validateConsoleErrors(row, label) {
	if (!Array.isArray(row.consoleErrors)) {
		errors.push(`${label} consoleErrors must be an array`)
		return
	}
	if (row.consoleErrors.some((item) => typeof item !== 'string')) {
		errors.push(`${label} consoleErrors must contain only strings`)
	}
}

function validateRelevantConsoleErrors(row, label) {
	const relevant = row.consoleErrors.filter(isRelevantCompatibilityError)
	if (relevant.length) errors.push(`${label} has relevant console/page errors: ${relevant.join('; ')}`)
}

function isRelevantCompatibilityError(value) {
	return /Run failed|unreachable|wasm|webassembly/i.test(String(value ?? ''))
}

function targetUserAgentErrors(row, target, label) {
	const ua = String(row.capabilities?.userAgent ?? '')
	if (!ua) return [`${label} passed without user-agent evidence`]
	const errors = []
	if (target.platform === 'android' && !/Android/i.test(ua)) {
		errors.push(`${label} user agent does not look like Android: ${ua}`)
	}
	if (target.platform === 'ios' && !/(iPhone|iPad|iPod|CPU (?:iPhone )?OS)/i.test(ua)) {
		errors.push(`${label} user agent does not look like iOS: ${ua}`)
	}
	if (target.browser === 'chrome') {
		if (target.platform === 'ios' && !/CriOS\//i.test(ua)) {
			errors.push(`${label} user agent does not look like Chrome iOS: ${ua}`)
		}
		if (target.platform === 'android' && (!/Chrome\//i.test(ua) || /SamsungBrowser\/|Firefox\//i.test(ua))) {
			errors.push(`${label} user agent does not look like Chrome Android: ${ua}`)
		}
	}
	if (target.browser === 'firefox' && !/(Firefox|FxiOS)\//i.test(ua)) {
		errors.push(`${label} user agent does not look like Firefox: ${ua}`)
	}
	if (target.browser === 'samsung-internet' && !/SamsungBrowser\//i.test(ua)) {
		errors.push(`${label} user agent does not look like Samsung Internet: ${ua}`)
	}
	if (target.browser === 'safari' && (!/Safari\//i.test(ua) || /(CriOS|FxiOS|Chrome|SamsungBrowser)\//i.test(ua))) {
		errors.push(`${label} user agent does not look like Safari: ${ua}`)
	}
	return errors
}

function csvEnv(name, defaultValue) {
	if (!(name in process.env)) return defaultValue
	return String(process.env[name] ?? '').split(',').map((item) => item.trim()).filter(Boolean)
}
