#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'

const root = path.resolve(import.meta.dirname, '..')
const resultsFileIsDefault = !('WEB_COMPAT_RESULTS_FILE' in process.env)
const resultsFile = path.resolve(root, process.env.WEB_COMPAT_RESULTS_FILE ?? 'test-output/browser-compat/results.json')
const resultsMdFile = path.resolve(root, process.env.WEB_COMPAT_RESULTS_MD_FILE ?? path.join(path.dirname(resultsFile), 'results.md'))
const completionFile = path.resolve(root, process.env.WEB_COMPAT_COMPLETION_FILE ?? 'tests/browser-compat-completion.yaml')
const remoteMatrixFile = path.resolve(root, process.env.WEB_COMPAT_REMOTE_MATRIX_FILE ?? 'tests/browser-compat-remote-matrix.yaml')
const generatedPolicyFile = path.resolve(root, process.env.WEB_COMPAT_POLICY_FILE ?? 'lib/browser-support.generated.ts')
const errors = []
const warnings = []
const missingRemoteProviderTargets = []
const compatibilitySources = new Set(['local-playwright', 'android-local', 'remote-provider'])
const runStatuses = new Set(['not-started', 'passed', 'failed'])
const providerOnlyPolicyFamilies = new Set(['samsungInternet', 'chromeIos', 'firefoxIos'])
const requiredSampleId = 'WEB_COMPAT_REQUIRED_SAMPLE_ID' in process.env
	? String(process.env.WEB_COMPAT_REQUIRED_SAMPLE_ID ?? '').trim()
	: '23andme-v5-hu50B3F5'
const requiredArtifacts = csvEnv('WEB_COMPAT_REQUIRED_ARTIFACTS', ['observations.tsv', 'analysis.jsonl', 'reports.jsonl', 'index.html'])
const requireMarkdownSummary = resultsFileIsDefault || process.env.WEB_COMPAT_REQUIRE_RESULTS_MD === '1'
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

const rows = readJsonArray(resultsFile, 'compatibility results')
const completion = readYaml(completionFile)
const remoteTargets = new Map(readYamlTargets(remoteMatrixFile).map((target) => [String(target.id), target]))
const remoteTargetIds = new Set(remoteTargets.keys())
const policy = parseGeneratedPolicy(fs.readFileSync(generatedPolicyFile, 'utf8'))
const todoFile = path.resolve(root, process.env.WEB_COMPAT_TODO_FILE ?? completion.todo_file ?? 'TODO.md')
const todoText = fs.readFileSync(todoFile, 'utf8')
const seenResultIds = new Set()

if (requireMarkdownSummary) validateMarkdownSummary(rows)
requireEvidenceSources()
requirePassingCapabilityEvidence()
const completionRemoteTargets = arrayValue(completion.remote_targets, 'remote_targets')
requireKnownRemoteTargets(completionRemoteTargets, remoteTargetIds)
requireAllRemoteTargetsCovered(completionRemoteTargets, remoteTargetIds)
requirePassingProjects(arrayValue(completion.local_projects, 'local_projects'))
requirePassingTargets(arrayValue(completion.local_targets, 'local_targets'))
requirePassingRemoteTargets(completionRemoteTargets)
requirePolicyFamilies(arrayValue(completion.policy_families, 'policy_families'))
for (const family of arrayValue(completion.minimum_brackets, 'minimum_brackets')) requireMinimumBracket(family)
requireProviderEvidenceInPolicy(completionRemoteTargets)
requireTodoPolicyTable()
requireTodoChecked()

if (warnings.length) {
	console.log('Browser compatibility completion audit warnings:')
	for (const warning of warnings) console.log(`- ${warning}`)
}

if (errors.length) {
	console.error('Browser compatibility TODO is not complete:')
	for (const error of errors) console.error(`- ${error}`)
	if (missingRemoteProviderTargets.length) {
		console.error('Remote provider evidence is missing. Check provider endpoint and URL configuration with:')
		const includesDeferredTargets = missingRemoteProviderTargets.some((targetId) => remoteTargets.get(targetId)?.required === 'deferred')
		const includesAndroidTargets = missingRemoteProviderTargets.some((targetId) => remoteTargets.get(targetId)?.platform === 'android')
		const includesIosTargets = missingRemoteProviderTargets.some((targetId) => remoteTargets.get(targetId)?.platform === 'ios')
		console.error(includesDeferredTargets
			? '- WEB_COMPAT_INCLUDE_DEFERRED=1 npm run check:browser-compat-provider-secret'
			: '- npm run check:browser-compat-provider-secret')
		console.error(`- ${remoteInfraPreflightCommand({ includesAndroidTargets, includesIosTargets, includesDeferredTargets })}`)
		console.error('Endpoint inputs can be supplied with WEB_COMPAT_REMOTE_ENDPOINTS_JSON, a repo-root browser-compat-endpoints.json file, WEB_COMPAT_REMOTE_ENDPOINTS_FILE, BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON, BROWSER_COMPAT_REMOTE_ENDPOINTS_FILE, a CI-visible BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON secret, or CI-visible BrowserStack/LambdaTest credential secrets that render endpoint JSON in the manual remote workflow.')
		console.error(`Missing remote target ids: ${missingRemoteProviderTargets.join(', ')}`)
	}
	process.exit(1)
}

console.log('Browser compatibility TODO is complete.')

function requirePassingProjects(projects) {
	for (const project of projects) {
		if (!rows.some((row) => isPassingLocalProject(row, project))) {
			errors.push(`missing passing local project evidence for ${project}`)
		}
	}
}

function isPassingLocalProject(row, project) {
	return row.projectName === project &&
		passed(row) &&
		row.compatibilitySource === 'local-playwright' &&
		!isProviderTargetId(row.remoteTargetId)
}

function isProviderTargetId(targetId) {
	return /^(android|ios)-/.test(String(targetId ?? '')) && targetId !== 'android-local'
}

function remoteInfraPreflightCommand({ includesAndroidTargets, includesIosTargets, includesDeferredTargets }) {
	const env = ['WEB_URL=https://app.biovault.net/web/', 'WEB_COMPAT_CHECK_WEB_URL_REACHABLE=1']
	if (includesAndroidTargets) env.push('WEB_COMPAT_REQUIRE_REMOTE_ANDROID=1')
	if (includesIosTargets) env.push('WEB_COMPAT_REQUIRE_REMOTE_IOS=1')
	if (includesDeferredTargets) env.push('WEB_COMPAT_INCLUDE_DEFERRED=1')
	return `${env.join(' ')}${env.length ? ' ' : ''}npm run check:browser-compat-infra`
}

function requirePassingTargets(targetIds) {
	for (const targetId of targetIds) {
		if (!rows.some((row) => (row.remoteTargetId || row.projectName) === targetId && passed(row))) {
			errors.push(`missing passing compatibility evidence for ${targetId}`)
		}
	}
}

function requireKnownRemoteTargets(targets, ids) {
	for (const targetId of targets) {
		if (!ids.has(targetId)) errors.push(`completion contract references unknown remote target ${targetId}`)
	}
}

function requireAllRemoteTargetsCovered(targets, ids) {
	const targetSet = new Set(targets)
	for (const targetId of ids) {
		if (!targetSet.has(targetId)) errors.push(`completion contract is missing remote target ${targetId}`)
	}
}

function requireEvidenceSources() {
	for (const row of rows) {
		const label = row.remoteTargetId || row.projectName || '<unknown>'
		if (typeof row.id === 'string' && row.id.trim()) {
			if (seenResultIds.has(row.id)) errors.push(`${label} duplicates result id ${row.id}`)
			seenResultIds.add(row.id)
		}
		validateResultMetadata(row, label)
		validateResultIdentity(row, label)
		validateEngineForProject(row, label)
		validateRunStatuses(row, label)
		validateCapabilityProbe(row, label)
		validateConsoleErrors(row, label)
		if (!row.compatibilitySource) {
			errors.push(`${label} is missing compatibilitySource`)
		} else if (!compatibilitySources.has(row.compatibilitySource)) {
			errors.push(`${label} has unsupported compatibilitySource: ${row.compatibilitySource}`)
		}
		if (row.remoteTargetId === 'android-local' && row.compatibilitySource !== 'android-local') {
			errors.push(`${label} must be recorded from android-local evidence`)
		}
		if (row.compatibilitySource === 'android-local' && row.remoteTargetId !== 'android-local') {
			errors.push(`${label} has android-local evidence source but target is not android-local`)
		}
		if (row.status === 'passed') {
			if (row.reportRunStatus !== 'passed') errors.push(`${label} did not pass report run`)
			if (row.artifactValidationStatus !== 'passed') errors.push(`${label} did not pass artifact validation`)
		} else if (row.status === 'failed') {
			if (!row.failureMessage) errors.push(`${label} failed without a failureMessage`)
		} else {
			errors.push(`${label} has unsupported status: ${row.status}`)
		}
	}
}

function validateResultMetadata(row, label) {
	for (const key of ['id', 'sampleId', 'engine', 'deviceProfile', 'startedAt', 'finishedAt']) {
		if (typeof row[key] !== 'string' || !row[key].trim()) errors.push(`${label} is missing ${key}`)
	}
	if (requiredSampleId && row.sampleId !== requiredSampleId) {
		errors.push(`${label} used sampleId ${row.sampleId || '<missing>'}, expected ${requiredSampleId}`)
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

function validateResultIdentity(row, label) {
	if (!row.projectName) errors.push(`${label} is missing projectName`)
	if (!row.browserName) errors.push(`${label} is missing browserName`)
	if (!row.browserVersion) errors.push(`${label} is missing browserVersion`)
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

function validateConsoleErrors(row, label) {
	if (!Array.isArray(row.consoleErrors)) {
		errors.push(`${label} consoleErrors must be an array`)
		return
	}
	if (row.consoleErrors.some((item) => typeof item !== 'string')) {
		errors.push(`${label} consoleErrors must contain only strings`)
	}
}

function requirePassingCapabilityEvidence() {
	for (const row of rows) {
		if (!passed(row)) continue
		const label = row.remoteTargetId || row.projectName || '<unknown>'
		validatePassingCapabilityProbe(row, label)
		validatePassingArtifactEvidence(row, label)
		validatePassingConsoleErrors(row, label)
	}
}

function requirePassingRemoteTargets(targetIds) {
	for (const targetId of targetIds) {
		const row = rows.find((item) => item.remoteTargetId === targetId && passed(item))
		if (!row) {
			missingRemoteProviderTargets.push(targetId)
			errors.push(`missing passing real-browser provider evidence for ${targetId}`)
			continue
		}
		if (row.compatibilitySource !== 'remote-provider') {
			errors.push(`${targetId} must be recorded from remote-provider evidence`)
		}
		validateRemoteTargetEvidence(row, remoteTargets.get(targetId))
	}
}

function validatePassingCapabilityProbe(row, label) {
	if (!row.capabilities || typeof row.capabilities !== 'object') {
		errors.push(`${label} is missing capability probe output`)
		return
	}
	for (const [key, description] of requiredPassingCapabilityFlags) {
		if (row.capabilities[key] !== true) errors.push(`${label} did not report ${description}`)
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
	} else if (row.capabilities.failures.length) {
		errors.push(`${label} capability probe reported failures: ${row.capabilities.failures.join('; ')}`)
	}
}

function validatePassingArtifactEvidence(row, label) {
	if (!Array.isArray(row.artifactNames)) {
		errors.push(`${label} is missing artifactNames evidence`)
		return
	}
	if (row.artifactNames.some((item) => typeof item !== 'string' || !item.trim())) {
		errors.push(`${label} artifactNames must contain only non-empty strings`)
		return
	}
	const missing = requiredArtifacts.filter((artifact) => !row.artifactNames.includes(artifact))
	if (missing.length) {
		errors.push(`${label} is missing required artifact evidence: ${missing.join(', ')}`)
	}
}

function validatePassingConsoleErrors(row, label) {
	if (!Array.isArray(row.consoleErrors)) {
		errors.push(`${label} consoleErrors must be an array`)
		return
	}
	const relevant = row.consoleErrors.filter(isRelevantCompatibilityError)
	if (relevant.length) errors.push(`${label} has relevant console/page errors: ${relevant.join('; ')}`)
}

function validateMarkdownSummary(resultRows) {
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
	if (bodyRows.length !== resultRows.length) {
		errors.push(`${path.relative(root, resultsMdFile)} has ${bodyRows.length} result row(s), expected ${resultRows.length}`)
	}
}

function isRelevantCompatibilityError(value) {
	return /Run failed|unreachable|wasm|webassembly/i.test(String(value ?? ''))
}

function requireMinimumBracket(family) {
	const familyPolicy = policy[family]
	if (!familyPolicy) {
		errors.push(`missing generated support policy for ${family}`)
		return
	}
	if (!Number.isFinite(familyPolicy.minimumKnownGood)) {
		errors.push(`${family} has no minimum known-good version`)
	}
	if (!Number.isFinite(familyPolicy.latestKnownGood)) {
		errors.push(`${family} has no latest known-good version`)
	}
	if (!familyPolicy.knownFailing.some((version) => version < familyPolicy.minimumKnownGood)) {
		errors.push(`${family} has no known failing version below its minimum known-good version`)
	}
}

function requirePolicyFamilies(families) {
	for (const family of families) {
		const familyPolicy = policy[family]
		if (!familyPolicy) {
			errors.push(`missing generated support policy for ${family}`)
			continue
		}
		for (const key of ['minimumKnownGood', 'latestKnownGood', 'knownFailing']) {
			if (!(key in familyPolicy)) errors.push(`${family} policy is missing ${key}`)
		}
		if (!Array.isArray(familyPolicy.knownFailing)) {
			errors.push(`${family} knownFailing policy must be an array`)
		}
	}
}

function requireProviderEvidenceInPolicy(targetIds) {
	const providerOnlyMajors = new Map()
	for (const targetId of targetIds) {
		const row = rows.find((item) => item.remoteTargetId === targetId && passed(item))
		if (!row) continue
		const family = browserFamily(row.browserName, row.capabilities?.userAgent)
		const major = majorVersionForFamily(row, family)
		const familyPolicy = policy[family]
		if (!familyPolicy) {
			errors.push(`${targetId} maps to missing generated support policy family ${family}`)
			continue
		}
		if (!Number.isFinite(major)) {
			errors.push(`${targetId} has no parseable major browser version for generated support policy`)
			continue
		}
		if (!Number.isFinite(familyPolicy.minimumKnownGood) || !Number.isFinite(familyPolicy.latestKnownGood)) {
			errors.push(`${targetId} has passing evidence for ${family}, but generated policy has no minimum/latest known-good version`)
			continue
		}
		if (major < familyPolicy.minimumKnownGood || major > familyPolicy.latestKnownGood) {
			errors.push(`${targetId} version ${major} is outside generated policy range ${familyPolicy.minimumKnownGood}-${familyPolicy.latestKnownGood} for ${family}`)
		}
		if (providerOnlyPolicyFamilies.has(family)) {
			const majors = providerOnlyMajors.get(family) ?? []
			majors.push(major)
			providerOnlyMajors.set(family, majors)
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
}

function requireTodoChecked() {
	const unchecked = todoText.split(/\r?\n/)
		.map((line, index) => ({ line, lineNumber: index + 1 }))
		.filter((item) => /^\s*- \[ \]/.test(item.line))
	if (unchecked.length) {
		for (const item of unchecked) {
			errors.push(`TODO.md:${item.lineNumber} remains unchecked: ${item.line.trim()}`)
		}
	}
}

function requireTodoPolicyTable() {
	const section = todoText.split('Current generated UI policy in `lib/browser-support.generated.ts`:')[1]?.split('Attempted but not usable as compatibility evidence:')[0] ?? ''
	if (!section) {
		errors.push('TODO.md is missing the current generated UI policy table section')
		return
	}
	const expected = [
		['Chrome/Chromium', 'chromium'],
		['Firefox', 'firefox'],
		['Safari/WebKit', 'safari'],
		['Samsung Internet', 'samsungInternet'],
		['Chrome iOS', 'chromeIos'],
		['Firefox iOS', 'firefoxIos'],
	]
	for (const [label, family] of expected) {
		const familyPolicy = policy[family]
		if (!familyPolicy) {
			errors.push(`TODO.md cannot validate current generated UI policy row for ${label}: missing generated policy family ${family}`)
			continue
		}
		const pattern = new RegExp(`\\|\\s*${escapeRegex(label)}\\s*\\|\\s*([^|]+?)\\s*\\|\\s*([^|]+?)\\s*\\|\\s*([^|]+?)\\s*\\|`)
		const match = section.match(pattern)
		if (!match) {
			errors.push(`TODO.md is missing current generated UI policy row for ${label}`)
			continue
		}
		const todoMinimum = parseTodoNumber(match[1])
		const todoLatest = parseTodoNumber(match[2])
		const todoFailing = parseTodoFailing(match[3])
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
}

function passed(row) {
	return row.status === 'passed' && row.reportRunStatus === 'passed' && row.artifactValidationStatus === 'passed'
}

function validateRemoteTargetEvidence(row, target) {
	const label = row.remoteTargetId
	if (!target) return
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
	for (const error of targetUserAgentErrors(row, target, label)) errors.push(error)
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

function browserNameMatchesRemoteTarget(browserName, target) {
	const name = String(browserName ?? '').toLowerCase()
	if (target.browser === 'chrome') return name.includes('chrome') && !name.includes('chromium')
	if (target.browser === 'firefox') return name.includes('firefox')
	if (target.browser === 'safari') return name.includes('safari')
	if (target.browser === 'samsung-internet') return name.includes('samsung')
	return name === String(target.browser ?? '').toLowerCase()
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
	return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function readJsonArray(file, label) {
	if (!fs.existsSync(file)) {
		console.error(`Missing ${label}: ${path.relative(root, file)}`)
		process.exit(1)
	}
	const value = JSON.parse(fs.readFileSync(file, 'utf8'))
	if (!Array.isArray(value)) {
		console.error(`${label} must be an array`)
		process.exit(1)
	}
	return value
}

function readYamlTargets(file) {
	const doc = readYaml(file)
	return Array.isArray(doc?.targets) ? doc.targets : []
}

function readYaml(file) {
	if (!fs.existsSync(file)) {
		console.error(`Missing YAML file: ${path.relative(root, file)}`)
		process.exit(1)
	}
	return parse(fs.readFileSync(file, 'utf8')) ?? {}
}

function arrayValue(value, label) {
	if (!Array.isArray(value)) {
		console.error(`${label} must be an array in ${path.relative(root, completionFile)}`)
		process.exit(1)
	}
	return value.map(String)
}

function formatAllowedList(values) {
	return values.length === 1 ? values[0] : values.join(' or ')
}

function csvEnv(name, fallback) {
	if (!(name in process.env)) return fallback
	return String(process.env[name] ?? '').split(',').map((item) => item.trim()).filter(Boolean)
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
