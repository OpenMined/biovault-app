#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const outputDir = path.resolve(root, process.env.WEB_COMPAT_MERGE_OUTPUT_DIR ?? 'test-output/browser-compat')
const inputs = [
	...process.argv.slice(2),
	...csvEnv('WEB_COMPAT_MERGE_INPUTS'),
]
const inputPaths = inputs.length ? inputs : [outputDir]
const rows = []

for (const input of inputPaths) {
	const resolved = path.resolve(root, input)
	if (!fs.existsSync(resolved)) {
		console.error(`Missing browser compatibility result input: ${path.relative(root, resolved)}`)
		process.exit(1)
	}
	rows.push(...readResultRows(resolved))
}

if (!rows.length) {
	console.error(`No browser compatibility result rows found in: ${inputPaths.join(', ')}`)
	process.exit(1)
}

const merged = mergeRows(rows)
writeMergedResults(merged)
console.log(`Merged browser compatibility results: ${rows.length} row(s) -> ${merged.length} row(s)`)
console.log(`Wrote ${path.relative(root, path.join(outputDir, 'results.json'))}`)

function readResultRows(input) {
	const stat = fs.statSync(input)
	if (stat.isDirectory()) {
		const resultsFile = path.join(input, 'results.json')
		if (fs.existsSync(resultsFile)) return readResultRows(resultsFile)
		if (path.basename(input) === 'runs') {
			return fs.readdirSync(input, { withFileTypes: true })
				.filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
				.flatMap((entry) => readResultRows(path.join(input, entry.name)))
		}
		return fs.readdirSync(input, { withFileTypes: true })
			.flatMap((entry) => {
				const child = path.join(input, entry.name)
				if (entry.isDirectory()) return readResultRows(child)
				return []
			})
	}

	const parsed = JSON.parse(fs.readFileSync(input, 'utf8'))
	if (Array.isArray(parsed)) return parsed.map(normalizeResultRow)
	if (parsed && typeof parsed === 'object') return [normalizeResultRow(parsed)]
	console.error(`Browser compatibility result input must be an object or array: ${path.relative(root, input)}`)
	process.exit(1)
}

function normalizeResultRow(row) {
	if (row.compatibilitySource) return row
	if (row.remoteTargetId === 'android-local' || row.projectName === 'android-local') {
		return { ...row, compatibilitySource: 'android-local' }
	}
	if (isProviderTargetId(row.remoteTargetId)) return row
	return { ...row, compatibilitySource: 'local-playwright' }
}

function isProviderTargetId(targetId) {
	return /^(android|ios)-/.test(String(targetId ?? ''))
}

function mergeRows(sourceRows) {
	const byKey = new Map()
	for (const row of sourceRows) {
		const key = resultKey(row)
		const previous = byKey.get(key)
		if (!previous || String(row.startedAt ?? '').localeCompare(String(previous.startedAt ?? '')) > 0) {
			byKey.set(key, row)
		}
	}
	return Array.from(byKey.values()).sort((left, right) => String(left.startedAt ?? '').localeCompare(String(right.startedAt ?? '')))
}

function resultKey(row) {
	if (row.remoteTargetId) return String(row.remoteTargetId)
	return [
		row.projectName || '',
		row.browserName || '',
		row.browserVersion || '',
	].join('\t')
}

function writeMergedResults(merged) {
	const runsDir = path.join(outputDir, 'runs')
	fs.rmSync(outputDir, { recursive: true, force: true })
	fs.mkdirSync(runsDir, { recursive: true })

	for (const row of merged) {
		const safeId = String(row.id ?? resultKey(row)).replace(/[^a-z0-9_.-]+/gi, '-')
		fs.writeFileSync(path.join(runsDir, `${safeId}.json`), `${JSON.stringify(row, null, 2)}\n`)
	}
	fs.writeFileSync(path.join(outputDir, 'results.json'), `${JSON.stringify(merged, null, 2)}\n`)
	fs.writeFileSync(path.join(outputDir, 'results.md'), renderMarkdownSummary(merged))
}

function renderMarkdownSummary(results) {
	const rows = results.map((result) => [
		result.status,
		result.remoteTargetId ?? '',
		result.compatibilitySource,
		result.projectName,
		result.browserName,
		result.browserVersion,
		result.remoteDeviceName ?? result.deviceProfile,
		result.remoteOsVersion ?? formatOsForSummary(result.os),
		result.capabilities?.secureContext ? 'yes' : 'no',
		result.capabilities?.webAssemblyValidate ? 'yes' : 'no',
		result.capabilities?.worker ? 'yes' : 'no',
		result.reportRunStatus,
		result.artifactValidationStatus,
		formatFailureForSummary(result.failureMessage),
	])
	return [
		'# Browser Compatibility Results',
		'',
		'| Status | Target | Source | Project | Browser | Version | Device | OS | Secure | WASM | Worker | Report | Artifacts | Failure |',
		'| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
		...rows.map((cells) => `| ${cells.map(escapeMarkdownCell).join(' | ')} |`),
		'',
	].join('\n')
}

function formatOsForSummary(value) {
	return [value?.platform, value?.release].filter(Boolean).join(' ')
}

function escapeMarkdownCell(value) {
	return String(value ?? '').replace(/\|/g, '\\|')
}

function formatFailureForSummary(value) {
	const compact = String(value ?? '')
		.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
	const maxLength = 240
	return compact.length > maxLength ? `${compact.slice(0, maxLength - 1)}...` : compact
}

function csvEnv(name) {
	return String(process.env[name] ?? '').split(',').map((item) => item.trim()).filter(Boolean)
}
