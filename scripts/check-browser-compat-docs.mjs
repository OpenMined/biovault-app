#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'

const root = path.resolve(import.meta.dirname, '..')
const packageJsonFile = path.resolve(root, process.env.WEB_COMPAT_DOCS_PACKAGE_FILE ?? 'package.json')
const generatedPolicyFile = path.resolve(root, process.env.WEB_COMPAT_POLICY_FILE ?? 'lib/browser-support.generated.ts')
const completionContractFile = path.resolve(root, process.env.WEB_COMPAT_COMPLETION_FILE ?? 'tests/browser-compat-completion.yaml')
const packageJson = JSON.parse(fs.readFileSync(packageJsonFile, 'utf8'))
const scripts = new Set(Object.keys(packageJson.scripts ?? {}))
const publicWebUrl = process.env.WEB_COMPAT_PUBLIC_WEB_URL ?? 'https://app.biovault.net/web/'
const files = csvEnv('WEB_COMPAT_DOCS_FILES').length ? csvEnv('WEB_COMPAT_DOCS_FILES') : [
	'TODO.md',
	'docs/browser-compat-provider-runs.md',
	'docs/browser-compat-completion-audit.md',
	'.github/workflows/ci.yml',
]
const errors = []
const auditPolicyFamilies = [
	['Chromium', 'chromium'],
	['Firefox', 'firefox'],
	['Safari/WebKit', 'safari'],
]
const packageTargetScriptChecks = [
	['test:web-compat:remote-android', 'WEB_COMPAT_REMOTE_TARGETS', 'android'],
	['test:web-compat:remote-ios', 'WEB_COMPAT_REMOTE_TARGETS', 'ios'],
	['check:browser-compat-android-provider', 'WEB_COMPAT_REQUIRED_TARGETS', 'android'],
	['check:browser-compat-ios-provider', 'WEB_COMPAT_REQUIRED_TARGETS', 'ios'],
]
const endpointInputTokens = [
	'WEB_COMPAT_REMOTE_ENDPOINTS_JSON',
	'BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON',
	'WEB_COMPAT_REMOTE_ENDPOINTS_FILE',
	'BROWSER_COMPAT_REMOTE_ENDPOINTS_FILE',
	'browser-compat-endpoints.json',
	'BROWSERSTACK_USERNAME',
	'BROWSERSTACK_ACCESS_KEY',
	'LT_USERNAME',
	'LT_ACCESS_KEY',
]
const resultContractTokens = [
	'results.md',
	'artifactNames',
	'WEB_COMPAT_REQUIRED_ARTIFACTS',
	'WEB_COMPAT_REQUIRED_SAMPLE_ID',
	'WEB_COMPAT_RESULTS_MD_FILE',
	'WEB_COMPAT_REQUIRE_RESULTS_MD',
]
const providerRenderTokens = [
	['render:browser-compat-endpoints', 'endpoint renderer command'],
	['tests/browser-compat-provider-capabilities.example.json', 'checked-in provider capability template'],
	['GITHUB_SHA', 'provider build label placeholder'],
	['BROWSERSTACK_USERNAME', 'BrowserStack username placeholder'],
	['BROWSERSTACK_ACCESS_KEY', 'BrowserStack access key placeholder'],
	['LT_USERNAME', 'LambdaTest username placeholder'],
	['LT_ACCESS_KEY', 'LambdaTest access key placeholder'],
]

for (const file of files) {
	const absolute = path.resolve(root, file)
	if (!fs.existsSync(absolute)) {
		errors.push(`${file} is missing`)
		continue
	}
	const text = fs.readFileSync(absolute, 'utf8')
	for (const match of text.matchAll(/npm run(?: --silent)?\s+([A-Za-z0-9:_-]+)/g)) {
		if (!scripts.has(match[1])) errors.push(`${file} references missing package script: npm run ${match[1]}`)
	}
	if (path.basename(absolute) === 'browser-compat-completion-audit.md') {
		errors.push(...completionAuditPolicyErrors(text, file))
		errors.push(...remoteTargetListErrors(text, file, 'are not present in `test-output/browser-compat/results.json` as passing'))
		errors.push(...endpointInputErrors(text, file))
		errors.push(...resultContractErrors(text, file))
	}
	if (path.basename(absolute) === 'browser-compat-provider-runs.md') {
		errors.push(...remoteTargetListErrors(text, file, 'The current required provider targets are:'))
		errors.push(...endpointInputErrors(text, file))
		errors.push(...resultContractErrors(text, file))
		errors.push(...providerRenderInstructionErrors(text, file))
		errors.push(...providerDispatchCommandErrors(text, file))
	}
	errors.push(...workflowDispatchPrerequisiteErrors(text, file))
	errors.push(...publicWebUrlErrors(text, file, path.basename(absolute)))
	if (path.extname(absolute) === '.yml' || path.extname(absolute) === '.yaml') {
		errors.push(...workflowTargetErrors(text, file))
		errors.push(...workflowRemoteProviderErrors(text, file))
		errors.push(...workflowCompletionErrors(text, file))
	}
}
errors.push(...packageTargetScriptErrors())

if (errors.length) {
	console.error('Browser compatibility docs are out of sync:')
	for (const error of errors) console.error(`- ${error}`)
	process.exit(1)
}

console.log('Browser compatibility docs and CI references use existing package scripts.')

function csvEnv(name) {
	return String(process.env[name] ?? '').split(',').map((item) => item.trim()).filter(Boolean)
}

function completionAuditPolicyErrors(text, file) {
	if (!fs.existsSync(generatedPolicyFile)) {
		return [`${file} cannot validate generated policy prose because ${path.relative(root, generatedPolicyFile)} is missing`]
	}
	let policy
	try {
		policy = parseGeneratedPolicy(fs.readFileSync(generatedPolicyFile, 'utf8'))
	} catch (error) {
		return [`${file} cannot parse generated policy ${path.relative(root, generatedPolicyFile)}: ${error.message}`]
	}
	const section = text.split('Generated policy currently has minimum known-good brackets for:')[1]?.split('## Blocking Evidence')[0] ?? ''
	if (!section) return [`${file} is missing the generated policy summary section`]
	return auditPolicyFamilies.flatMap(([label, family]) => {
		const familyPolicy = policy[family]
		if (!familyPolicy) return [`${file} cannot find generated policy family ${family}`]
		const expected = `- ${label}: ${formatPolicyMinimum(familyPolicy.minimumKnownGood)}, ${formatKnownFailures(familyPolicy.knownFailing)}.`
		return section.includes(expected) ? [] : [`${file} generated policy summary is stale for ${label}; expected "${expected}"`]
	})
}

function remoteTargetListErrors(text, file, marker) {
	const targets = completionRemoteTargets(file)
	if (!targets.length) return []
	const section = text.split(marker)[1]?.split(/\n(?:Each target|These rows require)\b/)[0] ?? ''
	if (!section) return [`${file} is missing the required provider target list after "${marker}"`]
	return targets.flatMap((targetId) => (
		section.includes(`\`${targetId}\``) ? [] : [`${file} is missing required provider target ${targetId}`]
	))
}

function completionRemoteTargets(file) {
	if (!fs.existsSync(completionContractFile)) {
		errors.push(`${file} cannot validate provider target docs because ${path.relative(root, completionContractFile)} is missing`)
		return []
	}
	const contract = parse(fs.readFileSync(completionContractFile, 'utf8'))
	if (!Array.isArray(contract?.remote_targets)) {
		errors.push(`${file} cannot validate provider target docs because remote_targets is missing from ${path.relative(root, completionContractFile)}`)
		return []
	}
	return contract.remote_targets.map(String)
}

function endpointInputErrors(text, file) {
	return endpointInputTokens.flatMap((token) => (
		text.includes(token) ? [] : [`${file} is missing supported endpoint input ${token}`]
	))
}

function resultContractErrors(text, file) {
	return resultContractTokens.flatMap((token) => (
		text.includes(token) ? [] : [`${file} is missing result contract detail ${token}`]
	))
}

function providerRenderInstructionErrors(text, file) {
	return providerRenderTokens.flatMap(([token, label]) => (
		text.includes(token) ? [] : [`${file} is missing ${label}: ${token}`]
	))
}

function workflowDispatchPrerequisiteErrors(text, file) {
	if (path.extname(file) !== '.md') return []
	const discussesProviderWorkflowInputs = [
		'compat_web_url',
		'compat_include_ios',
		'compat_remote_targets',
		'compat_remote_dry_run',
		'compat_completion',
	].some((token) => text.includes(token))
	if (!discussesProviderWorkflowInputs) return []
	if (!text.includes('gh workflow run CI') && !text.includes('workflow inputs')) return []
	const mentionsPushedRef = /\bpushed\b/.test(text)
	const mentionsMergedRef = /\bmerged\b/.test(text)
	return mentionsPushedRef && mentionsMergedRef ? [] : [
		`${file} provider CI dispatch instructions must mention that workflow inputs need a pushed branch or merged main ref`,
	]
}

function providerDispatchCommandErrors(text, file) {
	const requiredTokens = [
		['compat_remote_dry_run=true', 'safe remote provider dry-run dispatch'],
		['compat_local_smoke=true', 'local smoke evidence dispatch'],
		['compat_versions=true', 'historical browser evidence dispatch'],
		['compat_android_local=true', 'Android-local evidence dispatch'],
		['compat_include_ios=true', 'iOS provider evidence dispatch'],
		['compat_completion=true', 'strict completion dispatch'],
	]
	return requiredTokens.flatMap(([token, label]) => (
		text.includes(token) ? [] : [`${file} is missing ${label}: ${token}`]
	))
}

function publicWebUrlErrors(text, file, basename) {
	if (!['TODO.md', 'browser-compat-provider-runs.md', 'browser-compat-completion-audit.md'].includes(basename)) return []
	const discussesRemoteProvider = text.includes('remote-provider') || text.includes('WEB_COMPAT_REMOTE_ENDPOINTS') || text.includes('BROWSER_COMPAT_REMOTE_ENDPOINTS')
	if (!discussesRemoteProvider) return []
	return text.includes(publicWebUrl) ? [] : [`${file} is missing public compatibility WEB_URL ${publicWebUrl}`]
}

function packageTargetScriptErrors() {
	return packageTargetScriptChecks.flatMap(([scriptName, envName, platform]) => {
		if (!scripts.has(scriptName)) return []
		const actual = parseEnvCsv(packageJson.scripts[scriptName], envName)
		const expected = completionRemoteTargets(`package.json script ${scriptName}`).filter((targetId) => targetId.startsWith(`${platform}-`))
		if (actual.length === 0) return [`package.json script ${scriptName} must set ${envName}`]
		if (JSON.stringify(actual) !== JSON.stringify(expected)) {
			return [`package.json script ${scriptName} ${envName} ${actual.join(',') || '<empty>'} does not match completion ${platform} targets ${expected.join(',') || '<empty>'}`]
		}
		return []
	})
}

function workflowTargetErrors(text, file) {
	if (!text.includes('WEB_COMPAT_REQUIRED_TARGETS')) return []
	const targets = completionRemoteTargets(file)
	if (!targets.length) return []
	const androidTargets = targets.filter((targetId) => targetId.startsWith('android-')).join(',')
	const allTargets = targets.join(',')
	const fileErrors = []
	if (!text.includes(androidTargets)) {
		fileErrors.push(`${file} WEB_COMPAT_REQUIRED_TARGETS is missing Android target list ${androidTargets}`)
	}
	if (!text.includes(allTargets)) {
		fileErrors.push(`${file} WEB_COMPAT_REQUIRED_TARGETS is missing full Android+iOS target list ${allTargets}`)
	}
	return fileErrors
}

function workflowRemoteProviderErrors(text, file) {
	if (!text.includes('web-compat-remote:') || !text.includes('npm run test:web-compat:remote-matrix')) return []
	const section = workflowJobSection(text, 'web-compat-remote')
	const requiredTokens = [
		'Render remote browser provider endpoints from provider secrets',
		'BROWSERSTACK_USERNAME: ${{ secrets.BROWSERSTACK_USERNAME }}',
		'BROWSERSTACK_ACCESS_KEY: ${{ secrets.BROWSERSTACK_ACCESS_KEY }}',
		'LT_USERNAME: ${{ secrets.LT_USERNAME }}',
		'LT_ACCESS_KEY: ${{ secrets.LT_ACCESS_KEY }}',
		'WEB_COMPAT_REMOTE_ENDPOINTS_FILE=$output_file',
		'WEB_COMPAT_REMOTE_TARGETS: ${{ inputs.compat_remote_targets }}',
		'WEB_COMPAT_INCLUDE_DEFERRED: ${{ inputs.compat_include_ios && \'1\' || \'0\' }}',
		'BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON: ${{ secrets.BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON }}',
		'WEB_COMPAT_REMOTE_ENDPOINTS_JSON: ${{ secrets.BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON }}',
		'WEB_COMPAT_SKIP_GH_SECRET_LOOKUP: \'1\'',
		'WEB_URL: ${{ inputs.compat_web_url }}',
		'WEB_COMPAT_CHECK_WEB_URL_REACHABLE: \'1\'',
		'WEB_COMPAT_ALLOW_LOCAL_WEB_URL: ${{ inputs.compat_allow_local_web_url',
		'WEB_COMPAT_REMOTE_DRY_RUN: ${{ inputs.compat_remote_dry_run && \'1\' || \'0\' }}',
		'npm run check:browser-compat-provider-secret',
		'npm run check:browser-compat-infra',
		'npm run test:web-compat:remote-matrix',
		'npm run check:browser-compat-results',
		'name: web-compat-remote-artifacts',
		'test-output/browser-compat',
	]
	return requiredTokens.flatMap((token) => (
		section.includes(token) ? [] : [`${file} remote provider workflow is missing ${token}`]
	))
}

function workflowCompletionErrors(text, file) {
	if (!text.includes('web-compat-completion:')) return []
	const section = workflowJobSection(text, 'web-compat-completion')
	const requiredTokens = [
		'pattern: web-compat*-artifacts',
		'npm run merge:browser-compat-results -- compat-artifacts',
		'npm run check:browser-compat-results',
		'npm run update:browser-support',
		'npm run update:browser-compat-todo',
		'npm run check:browser-compat-docs',
		'npm run check:browser-support',
		'npm run test:browser-support',
		'npm run check:browser-compat-completion',
		'name: web-compat-completion-artifacts',
		'test-output/browser-compat',
		'lib/browser-support.generated.ts',
		'TODO.md',
	]
	return requiredTokens.flatMap((token) => (
		section.includes(token) ? [] : [`${file} completion workflow is missing ${token}`]
	))
}

function workflowJobSection(text, jobName) {
	const lines = text.split(/\r?\n/)
	const startIndex = lines.findIndex((line) => new RegExp(`^\\s{2}${escapeRegex(jobName)}:\\s*$`).test(line))
	if (startIndex === -1) return ''
	const endIndex = lines.findIndex((line, index) => index > startIndex && /^\s{2}[A-Za-z0-9_-]+:\s*$/.test(line))
	return lines.slice(startIndex, endIndex === -1 ? undefined : endIndex).join('\n')
}

function parseEnvCsv(command, name) {
	const match = String(command ?? '').match(new RegExp(`(?:^|\\s)${name}=([^\\s]+)`))
	return match?.[1] ? match[1].split(',').map((item) => item.trim()).filter(Boolean) : []
}

function parseGeneratedPolicy(text) {
	const match = text.match(/export const GENERATED_BROWSER_SUPPORT_POLICY = ([\s\S]*?) as const/)
	if (!match?.[1]) throw new Error('Could not parse GENERATED_BROWSER_SUPPORT_POLICY.')
	const json = match[1]
		.replace(/([,{]\s*)([a-zA-Z_][a-zA-Z0-9_]*):/g, '$1"$2":')
		.replace(/'/g, '"')
	return JSON.parse(json)
}

function formatPolicyMinimum(value) {
	return Number.isFinite(value) ? String(value) : 'None'
}

function formatKnownFailures(values) {
	if (!Array.isArray(values) || values.length === 0) return 'with no known failures'
	const label = values.length === 1 ? 'failure' : 'failures'
	return `with known ${label} at ${formatNumberList(values)}`
}

function formatNumberList(values) {
	if (values.length <= 2) return values.join(' and ')
	return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`
}

function escapeRegex(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
