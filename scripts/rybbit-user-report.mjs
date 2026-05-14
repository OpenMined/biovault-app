#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_ENDPOINT = 'https://metrics.syftbox.net/api'
const DEFAULT_DEV_SITE_ID = '4'
const DEFAULT_PROD_SITE_ID = '6'
const DEFAULT_DEV_DOMAIN = 'dev-app.biovault.net'
const DEFAULT_PROD_DOMAIN = 'app.biovault.net'
const DEFAULT_EVENT_LIMIT = 50000
const DEFAULT_MINUTES = 60 * 24 * 30
const DEFAULT_REQUEST_TIMEOUT_MS = 30000
const BIOSCRIPT_NAME_CACHE = new Map()

const PRODUCT_EVENTS = new Set([
	'lab_files_added',
	'using_file_heuristics',
	'lab_run_started',
	'lab_report_generated',
	'lab_run_completed',
	'lab_run_failed',
	'lab_report_opened',
	'lab_report_opened_new_window',
	'lab_sample_genome_loaded',
	'lab_sample_genome_requested',
	'lab_sample_genome_remote_requested',
	'lab_remote_file_loaded',
])

loadDotEnv(path.resolve(process.cwd(), '.env'))

const options = parseArgs(process.argv.slice(2))
if (options.help) {
	printHelp()
	process.exit(0)
}

try {
	const report = await buildReport(options)
	const outPath = path.resolve(process.cwd(), options.out ?? 'reports/rybbit-biovault-users.html')
	fs.mkdirSync(path.dirname(outPath), { recursive: true })
	fs.writeFileSync(outPath, renderHtml(report), 'utf8')
	console.log(`Wrote ${outPath}`)
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error))
	process.exit(1)
}

async function buildReport(options) {
	const minutes = Number(options.minutes ?? DEFAULT_MINUTES)
	const eventLimit = Number(options.eventLimit ?? DEFAULT_EVENT_LIMIT)
	const cacheDir = path.resolve(process.cwd(), options.cacheDir ?? 'reports/rybbit-user-cache')
	const generatedAt = new Date()
	const sites = String(options.sites ?? 'dev,prod')
		.split(',')
		.map((site) => site.trim())
		.filter(Boolean)
	const siteReports = []
	for (const site of sites) {
		const config = getConfig(site, options)
		const cachePath = path.join(cacheDir, `${config.siteId}-${minutes}-${eventLimit}-events.json`)
		let events
		if (options.useCache && fs.existsSync(cachePath)) {
			console.error(`Using cached ${config.label} events: ${cachePath}`)
			events = JSON.parse(fs.readFileSync(cachePath, 'utf8'))
		} else {
			console.error(`Fetching ${config.label} raw events`)
			events = await fetchEvents(config, { past_minutes_start: String(minutes), past_minutes_end: '0' }, eventLimit)
			fs.mkdirSync(cacheDir, { recursive: true })
			fs.writeFileSync(cachePath, JSON.stringify(events, null, 2), 'utf8')
		}
		siteReports.push(analyzeSite(config, events, eventLimit))
	}
	return { eventLimit, generatedAt, minutes, sites: siteReports }
}

async function fetchEvents(config, timeParams, eventLimit) {
	const events = []
	let beforeTimestamp
	while (events.length < eventLimit) {
		console.error(`Fetching ${config.label} raw events: ${events.length}/${eventLimit}`)
		const pageSize = String(Math.min(500, eventLimit - events.length))
		const page = await rybbitGet(config, `/sites/${config.siteId}/events`, {
			...timeParams,
			page_size: pageSize,
			before_timestamp: beforeTimestamp,
		})
		const rows = Array.isArray(page?.data) ? page.data : []
		events.push(...rows)
		if (!page?.cursor?.hasMore || !page?.cursor?.oldestTimestamp || rows.length === 0) break
		beforeTimestamp = page.cursor.oldestTimestamp
		await sleep(750)
	}
	return events
}

function analyzeSite(config, rawEvents, eventLimit) {
	const events = rawEvents
		.map(normalizeEvent)
		.filter((event) => event.name === 'pageview' || PRODUCT_EVENTS.has(event.name))
		.sort((a, b) => a.timeMs - b.timeMs)
	const users = new Map()
	const daily = new Map()
	for (const event of events) {
		const user = getUser(users, stableUserId(event))
		applyEvent(user, event, daily)
	}
	const userRows = [...users.values()]
		.filter((user) => productActivityScore(user) > 0)
		.sort((a, b) => {
			const activityDelta = productActivityScore(b) - productActivityScore(a)
			return activityDelta || b.lastSeenMs - a.lastSeenMs
		})
	return {
		config,
		countryFilters: countryFilters(userRows),
		eventsFetched: rawEvents.length,
		eventsUsed: events.length,
		eventLimit,
		dailyRows: dailyRows(daily),
		totalUsers: users.size,
		activeProductUsers: userRows.length,
		userRows,
	}
}

function normalizeEvent(event) {
	const props = parseProperties(event.properties)
	const timestamp = event.timestamp ?? event.created_at ?? event.createdAt ?? event.time ?? event.datetime
	const timeMs = parseRybbitTimeMs(timestamp)
	return {
		...event,
		name: event.event_name || (event.type === 'pageview' ? 'pageview' : ''),
		props,
		sessionId: event.session_id || event.sessionId || '',
		timeMs: Number.isFinite(timeMs) ? timeMs : 0,
		timestamp: timeMs ? new Date(timeMs).toISOString() : '',
	}
}

function applyEvent(user, event, daily) {
	user.events += 1
	addUnique(user.countries, normalizeCountry(event.country))
	addUnique(user.identifiedUsers, event.identified_user_id)
	addUnique(user.usernames, event.traits?.username)
	addEnvironment(user, event)
	if (event.sessionId) user.sessions.add(String(event.sessionId))
	if (event.timestamp) {
		user.activeDays.add(brisbaneDate(event.timeMs))
		if (!user.firstSeenMs || event.timeMs < user.firstSeenMs) user.firstSeenMs = event.timeMs
		if (!user.lastSeenMs || event.timeMs > user.lastSeenMs) user.lastSeenMs = event.timeMs
	}
	const day = getDaily(daily, event)
	day.users.add(user.id)
	if (event.sessionId) day.sessions.add(String(event.sessionId))
	if (event.name === 'pageview') {
		user.pageviews += 1
		day.pageviews += 1
		return
	}

	const props = event.props
	if (event.name === 'lab_sample_genome_requested' || event.name === 'lab_sample_genome_remote_requested') {
		user.demoRequests += 1
		day.demoRequests += 1
		addDemo(user, props)
		user.currentInput = makeInputContext('demo', props, event)
		return
	}
	if (event.name === 'lab_sample_genome_loaded') {
		const count = numberProp(props.totalFiles, 1)
		user.demoLoads += count
		day.demoFiles += count
		addDemo(user, props)
		user.currentInput = makeInputContext('demo', props, event)
		return
	}
	if (event.name === 'lab_remote_file_loaded') {
		user.remoteFileLoads += 1
		day.remoteFiles += 1
		user.currentInput = makeInputContext('remote', props, event)
		return
	}
	if (event.name === 'lab_files_added') {
		const sources = arrayProp(props.fileSources)
		const totalFiles = numberProp(props.totalFiles, Math.max(1, sources.length))
		user.filesAdded += totalFiles
		const isDemo = props.is_demo_file === true || props.data_source === 'demo' || sources.includes('bundled')
		const kind = isDemo ? 'demo' : 'real'
		if (isDemo) {
			user.demoFileAdds += totalFiles
			day.demoFiles += totalFiles
			addDemo(user, props)
		} else {
			user.realFileAdds += totalFiles
			day.realFiles += totalFiles
		}
		user.currentInput = makeInputContext(kind, props, event)
		return
	}
	if (event.name === 'using_file_heuristics') {
		user.heuristics += 1
		mergeHeuristics(user.currentInput, props)
		if (user.currentInput?.kind !== 'demo') addRealFile(user, props)
		return
	}
	if (event.name === 'lab_run_started') {
		user.runsStarted += 1
		day.runsStarted += 1
		const run = makeRun(props, event, user.currentInput)
		user.runs.push(run)
		user.currentRun = run
		addAssay(user, props)
		return
	}
	if (event.name === 'lab_report_generated') {
		user.reportsGenerated += 1
		const report = makeReport(props, event, user.currentInput, user.currentRun)
		user.reports.push(report)
		addReportSummary(user, report)
		if (report.input.startsWith('demo')) day.demoReports += 1
		else day.realReports += 1
		return
	}
	if (event.name === 'lab_run_completed') {
		user.runsCompleted += 1
		day.runsCompleted += 1
		if (user.currentRun) user.currentRun.status = 'completed'
		return
	}
	if (event.name === 'lab_run_failed') {
		user.runsFailed += 1
		day.runsFailed += 1
		if (user.currentRun) user.currentRun.status = 'failed'
		return
	}
	if (event.name === 'lab_report_opened' || event.name === 'lab_report_opened_new_window') {
		user.reportOpens += 1
		day.reportOpens += 1
		return
	}
}

function makeInputContext(kind, props, event) {
	const input = {
		assayContext: '',
		demo: '',
		extensions: new Set(),
		format: '',
		genomeKind: props.genomeKind ? String(props.genomeKind) : '',
		kind,
		metadata: new Set(),
		source: '',
		timeMs: event.timeMs,
		vendor: '',
	}
	for (const value of arrayProp(props.fileSources)) input.metadata.add(`source:${value}`)
	for (const value of arrayProp(props.fileKinds).concat(arrayProp(props.demo_file_kinds))) input.metadata.add(`kind:${value}`)
	for (const value of arrayProp(props.demo_file_extensions)) addExtension(input.extensions, value)
	addExtension(input.extensions, props.fileExtension)
	addExtension(input.extensions, props.selectedEntryExtension)
	input.demo = firstValue(props.demo_title, props.demo_filename, props.demo_bundle_id, props.bundleId)
	input.source = firstValue(props.data_source, props.source, props.remoteKind)
	mergeHeuristics(input, props)
	return input
}

function mergeHeuristics(input, props) {
	if (!input) return
	input.format ||= firstValue(props.inputFormat, props.detectedKind)
	input.vendor ||= firstValue(props.sourceVendor)
	input.genomeKind ||= firstValue(props.genomeKind)
	for (const value of arrayProp(props.relatedFileExtensions)) addExtension(input.extensions, value)
	addExtension(input.extensions, props.fileExtension)
	addExtension(input.extensions, props.selectedEntryExtension)
	for (const key of ['assembly', 'confidence', 'sourceConfidence', 'platformVersion', 'container', 'detectedKind']) {
		if (props[key] !== undefined && props[key] !== null && props[key] !== '') input.metadata.add(`${key}:${props[key]}`)
	}
}

function makeRun(props, event, input) {
	return {
		assay: reportLabel(props, firstValue(props.assayId, props.internalAssayId, 'unknown')),
		genomeKind: firstValue(props.genomeKind, input?.genomeKind),
		input: inputSummary(input),
		remoteKind: firstValue(props.remoteKind),
		sourceUrl: firstValue(props.sourceUrl, props.packageSourceUrl),
		status: 'started',
		timeMs: event.timeMs,
	}
}

function makeReport(props, event, input, run) {
	return {
		artifacts: arrayProp(props.artifactNames),
		assay: reportLabel(props, run?.assay),
		genomeKind: firstValue(props.genomeKind, run?.genomeKind, input?.genomeKind),
		input: inputSummary(input || run?.input),
		remoteKind: firstValue(props.remoteKind, run?.remoteKind),
		sourceUrl: firstValue(props.sourceUrl, props.packageSourceUrl, run?.sourceUrl),
		timeMs: event.timeMs,
	}
}

function inputSummary(input) {
	if (!input) return ''
	if (typeof input === 'string') return input
	const props = propsFromInput(input)
	const normalized = normalizedInputFromProps(props)
	const parts = [input.kind, normalized.label]
	if (input.demo) parts.push(input.demo)
	if (normalized.extra) parts.push(`extra: ${normalized.extra}`)
	return parts.filter(Boolean).join(' | ')
}

function metadataValue(input, key) {
	const prefix = `${key}:`
	const value = [...input.metadata].find((item) => item.startsWith(prefix))
	return value ? value.slice(prefix.length) : ''
}

function addDemo(user, props) {
	const label = firstValue(props.demo_title, props.demo_filename, props.demo_bundle_id, props.bundleId)
	if (label) increment(user.demoFiles, label)
	for (const value of arrayProp(props.demo_file_extensions)) increment(user.demoExtensions, value)
}

function addRealFile(user, props) {
	const normalized = normalizedInputFromProps(props)
	increment(user.realInputLabels, normalized.label)
	if (normalized.extra) increment(user.realInputExtras, normalized.extra)
}

function addAssay(user, props) {
	const assay = firstValue(props.assayId, props.internalAssayId)
	if (assay) increment(user.assays, assay)
}

function addReportSummary(user, report) {
	const assay = report.assay || 'unknown'
	if (report.input.startsWith('demo')) increment(user.demoReports, assay)
	else increment(user.realReports, assay)
}

function normalizedInputFromProps(props) {
	const explicitLabel = firstValue(props.input_label, props.inputLabel)
	const type = explicitLabel ? firstValue(props.input_type, props.inputType, typeFromLabel(explicitLabel)) : normalizedInputType(props)
	const source = explicitLabel ? firstValue(props.input_source_label, props.inputSourceLabel, sourceFromLabel(explicitLabel), 'Unknown') : normalizedInputSource(props, type)
	return {
		extra: normalizedInputExtra(props),
		label: explicitLabel || `type: ${type} source: ${source}`,
		source,
		type,
	}
}

function normalizedInputType(props) {
	const rawType = firstValue(props.input_type, props.inputType).toLowerCase()
	if (['snp', 'vcf', 'cram', 'bam', 'fasta', 'unknown'].includes(rawType)) return rawType
	const detectedKind = String(props.detectedKind ?? props.input_detected_kind ?? '').toLowerCase()
	const inputFormat = String(props.inputFormat ?? props.input_format ?? '').toLowerCase()
	const genomeKind = String(props.genomeKind ?? '').toLowerCase()
	const fileKinds = arrayProp(props.fileKinds).map((value) => value.toLowerCase())
	if (
		detectedKind === 'genotype_text' ||
		inputFormat === 'genotype_text' ||
		inputFormat === 'text' ||
		inputFormat === 'zip' ||
		genomeKind === 'text' ||
		genomeKind === 'zip' ||
		fileKinds.some((kind) => kind === 'genotype_text' || kind === 'zip')
	) return 'snp'
	if (detectedKind === 'vcf' || inputFormat === 'vcf' || inputFormat === 'vcf_gz' || genomeKind === 'vcf' || genomeKind === 'vcf_gz' || fileKinds.some((kind) => kind === 'vcf_gz' || kind === 'vcf' || kind === 'tbi')) return 'vcf'
	if (detectedKind === 'alignment_cram' || inputFormat === 'cram' || genomeKind === 'cram' || fileKinds.some((kind) => kind === 'cram' || kind === 'crai')) return 'cram'
	if (detectedKind === 'alignment_bam' || inputFormat === 'bam' || genomeKind === 'bam' || fileKinds.some((kind) => kind === 'bam' || kind === 'bai')) return 'bam'
	if (detectedKind === 'reference_fasta' || inputFormat === 'fasta' || genomeKind === 'fasta' || fileKinds.some((kind) => kind === 'fasta' || kind === 'fai')) return 'fasta'
	return 'unknown'
}

function normalizedInputSource(props, type) {
	if (type !== 'snp') return 'Unknown'
	const explicit = firstValue(props.input_source_label, props.inputSourceLabel)
	if (explicit) return explicit
	const vendor = firstValue(props.input_vendor, props.inputVendor, props.sourceVendor)
	const version = firstValue(props.input_vendor_version, props.inputVendorVersion, props.platformVersion)
	if (!vendor) return 'Unknown'
	if (vendor === '23andMe' && version) return `${vendor} ${version}`
	return vendor
}

function normalizedInputExtra(props) {
	const type = normalizedInputType(props)
	const related = normalizedExtensions(arrayProp(props.relatedFileExtensions))
	const fileExtension = normalizeExtension(props.fileExtension)
	const selectedEntryExtension = normalizeExtension(props.selectedEntryExtension)
	const fileKinds = arrayProp(props.fileKinds).map((value) => value.toLowerCase())
	const extensions = normalizedExtensions([
		...related,
		fileExtension,
		selectedEntryExtension,
		...fileKinds.map(extensionForKind),
	])
	if (type === 'vcf') return extensionExtra(extensions, [['.vcf.gz', '.vcf.gz.tbi'], ['.vcf', '.vcf.tbi']], ['.vcf.gz', '.vcf'])
	if (type === 'cram') return extensionExtra(extensions, [['.cram', '.cram.crai'], ['.fa', '.fa.fai'], ['.fasta', '.fasta.fai']], ['.cram'])
	if (type === 'bam') return extensionExtra(extensions, [['.bam', '.bam.bai'], ['.fa', '.fa.fai'], ['.fasta', '.fasta.fai']], ['.bam'])
	if (type === 'fasta') return extensionExtra(extensions, [['.fa', '.fa.fai'], ['.fasta', '.fasta.fai']], ['.fa', '.fasta'])
	if (type === 'snp') {
		const pieces = []
		if (extensions.includes('.zip')) pieces.push('.zip')
		if (selectedEntryExtension) pieces.push(`entry ${selectedEntryExtension}`)
		else if (extensions.includes('.txt')) pieces.push('.txt')
		return pieces.join(' + ')
	}
	return extensions.join(' + ')
}

function extensionExtra(extensions, pairs, singles) {
	const pieces = []
	for (const pair of pairs) {
		if (pair.every((extension) => extensions.includes(extension))) {
			pieces.push(pair.join(' + '))
			for (const extension of pair) extensions = extensions.filter((value) => value !== extension)
		}
	}
	for (const single of singles) {
		if (extensions.includes(single)) pieces.push(single)
	}
	return [...new Set(pieces)].join(' + ')
}

function typeFromLabel(value) {
	const match = String(value).match(/type:\s*([^\s]+)/i)
	return match ? match[1].toLowerCase() : ''
}

function sourceFromLabel(value) {
	const match = String(value).match(/source:\s*(.+)$/i)
	return match ? match[1].trim() : ''
}

function propsFromInput(input) {
	const props = {
		detectedKind: input.format,
		genomeKind: input.genomeKind,
		platformVersion: metadataValue(input, 'platformVersion'),
		sourceVendor: input.vendor,
	}
	const extensions = [...input.extensions].filter(Boolean)
	props.relatedFileExtensions = extensions
	props.fileExtension = extensions.includes('.zip') ? '.zip' : extensions[0] || ''
	props.selectedEntryExtension = extensions.includes('.zip') && extensions.includes('.txt') ? '.txt' : ''
	return props
}

function reportLabel(props, fallback) {
	const explicit = firstValue(props.assayName, props.panelName, props.bioscriptName, props.name)
	if (explicit) return explicit
	const sourceUrl = firstValue(props.sourceUrl, props.packageSourceUrl)
	const localName = localBioscriptNameFromUrl(sourceUrl)
	if (localName) return localName
	const fromUrl = reportLabelFromUrl(sourceUrl)
	if (fromUrl) return fromUrl
	const raw = firstValue(props.assayId, props.internalAssayId, fallback, 'unknown')
	if (raw === 'manifest') return 'unknown manifest'
	return raw
}

function reportLabelFromUrl(value) {
	if (!value) return ''
	let pathname = ''
	try {
		pathname = new URL(value).pathname
	} catch {
		pathname = String(value)
	}
	const decoded = decodeURIComponent(pathname)
	const packageMatch = decoded.match(/\/([^/]+)\.zip\/manifest\.ya?ml$/i)
	if (packageMatch) return packageMatch[1]
	const assetAssayMatch = decoded.match(/\/assets\/([^/]+)\/assay\.ya?ml$/i)
	if (assetAssayMatch) return `${assetAssayMatch[1]} assay`
	const fileMatch = decoded.match(/\/([^/]+)\.ya?ml$/i)
	if (fileMatch && fileMatch[1] !== 'manifest' && fileMatch[1] !== 'assay') return fileMatch[1]
	return ''
}

function localBioscriptNameFromUrl(value) {
	if (!value) return ''
	if (BIOSCRIPT_NAME_CACHE.has(value)) return BIOSCRIPT_NAME_CACHE.get(value)
	let name = ''
	const localPath = localPathForSourceUrl(value)
	if (localPath && fs.existsSync(localPath)) {
		const match = fs.readFileSync(localPath, 'utf8').match(/^name:\s*["']?([^"'\n#]+)["']?/m)
		name = match ? match[1].trim() : ''
	}
	BIOSCRIPT_NAME_CACHE.set(value, name)
	return name
}

function localPathForSourceUrl(value) {
	let pathname = ''
	try {
		pathname = new URL(value).pathname
	} catch {
		pathname = String(value)
	}
	const marker = '/madhavajay/exvitae/blob/main/'
	const markerIndex = pathname.indexOf(marker)
	if (markerIndex === -1) return ''
	let relativePath = decodeURIComponent(pathname.slice(markerIndex + marker.length))
	relativePath = relativePath.replace(/\/([^/]+)\.zip\//, '/')
	return path.resolve(process.cwd(), 'exvitae', relativePath)
}

function getUser(users, id) {
	if (!users.has(id)) {
		users.set(id, {
			activeDays: new Set(),
			assays: new Map(),
			countries: new Set(),
			currentInput: null,
			currentRun: null,
			demoExtensions: new Map(),
			demoFileAdds: 0,
			demoFiles: new Map(),
			demoLoads: 0,
			demoReports: new Map(),
			demoRequests: 0,
			events: 0,
			environments: new Map(),
			filesAdded: 0,
			firstSeenMs: 0,
			heuristics: 0,
			id,
				identifiedUsers: new Set(),
				lastSeenMs: 0,
				pageviews: 0,
				realFileAdds: 0,
				realInputExtras: new Map(),
				realInputLabels: new Map(),
				realReports: new Map(),
				remoteFileLoads: 0,
			reportOpens: 0,
			reports: [],
			reportsGenerated: 0,
			runs: [],
			runsCompleted: 0,
			runsFailed: 0,
			runsStarted: 0,
			sessions: new Set(),
			usernames: new Set(),
		})
	}
	return users.get(id)
}

function getDaily(daily, event) {
	const date = brisbaneDate(event.timeMs)
	if (!daily.has(date)) {
		daily.set(date, {
			date,
			demoFiles: 0,
			demoReports: 0,
			demoRequests: 0,
			pageviews: 0,
			realFiles: 0,
			realReports: 0,
			remoteFiles: 0,
			reportOpens: 0,
			runsCompleted: 0,
			runsFailed: 0,
			runsStarted: 0,
			sessions: new Set(),
			users: new Set(),
		})
	}
	return daily.get(date)
}

function dailyRows(daily) {
	return [...daily.values()]
		.sort((a, b) => a.date.localeCompare(b.date))
		.map((row) => ({
			...row,
			sessions: row.sessions.size,
			users: row.users.size,
		}))
}

function renderHtml(report) {
	const title = `BioVault per-user Rybbit report - ${dateTime(report.generatedAt)}`
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root { color-scheme: light; --bg: #f7f7f4; --panel: #fff; --ink: #17201b; --muted: #66706a; --line: #d9ded7; --accent: #2f7d57; --soft: #eef3ef; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 13px/1.45 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
header { padding: 26px 32px 16px; background: var(--panel); border-bottom: 1px solid var(--line); }
main { padding: 0 32px 36px; }
h1 { margin: 0 0 6px; font-size: 26px; line-height: 1.15; letter-spacing: 0; }
h2 { margin: 26px 0 10px; font-size: 20px; }
h3 { margin: 18px 0 8px; font-size: 13px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
table { width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
th, td { padding: 8px 9px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
th { background: var(--soft); font-size: 11px; color: #435047; white-space: nowrap; }
tr:last-child td { border-bottom: 0; }
.site { margin-top: 24px; padding-top: 8px; border-top: 3px solid var(--accent); }
.grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
.metric { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 12px; }
.metric strong { display: block; font-size: 22px; line-height: 1.15; }
.muted, .metric span { color: var(--muted); }
.pill { display: inline-block; margin: 0 4px 4px 0; padding: 2px 7px; border: 1px solid var(--line); border-radius: 999px; background: #fafbf9; white-space: nowrap; }
.sub { margin-top: 4px; color: var(--muted); }
.nowrap { white-space: nowrap; }
.filters { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 12px; }
.filter-button { border: 1px solid var(--line); border-radius: 999px; background: var(--panel); color: var(--ink); cursor: pointer; font: inherit; padding: 4px 10px; }
.filter-button[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: #fff; }
th button { all: unset; cursor: pointer; display: inline-flex; gap: 4px; align-items: center; }
th button::after { color: var(--muted); content: "sort"; font-size: 10px; font-weight: 400; }
th button[aria-sort="ascending"]::after { content: "asc"; }
th button[aria-sort="descending"]::after { content: "desc"; }
@media (max-width: 900px) { header, main { padding-left: 14px; padding-right: 14px; } table { display: block; overflow-x: auto; white-space: nowrap; } td { min-width: 130px; } }
</style>
<script>
function filterCountry(siteId, country) {
	const section = document.querySelector('[data-site="' + siteId + '"]')
	if (!section) return
	const buttons = section.querySelectorAll('[data-country-filter]')
	for (const button of buttons) {
		button.setAttribute('aria-pressed', button.dataset.countryFilter === country ? 'true' : 'false')
	}
	const rows = section.querySelectorAll('tbody tr[data-country]')
	for (const row of rows) {
		const countries = (row.dataset.country || '').split(',')
		row.hidden = country !== 'all' && !countries.includes(country)
	}
}
function sortUserTable(button, key, type) {
	const table = button.closest('table')
	if (!table) return
	const tbody = table.querySelector('tbody')
	const rows = Array.from(tbody.querySelectorAll('tr'))
	const current = button.getAttribute('aria-sort')
	const direction = current === 'ascending' ? 'descending' : 'ascending'
	for (const other of table.querySelectorAll('th button[aria-sort]')) other.setAttribute('aria-sort', 'none')
	button.setAttribute('aria-sort', direction)
	const multiplier = direction === 'ascending' ? 1 : -1
	rows.sort((a, b) => compareSortValue(a.dataset[key] || '', b.dataset[key] || '', type) * multiplier)
	for (const row of rows) tbody.appendChild(row)
}
function compareSortValue(a, b, type) {
	if (type === 'number' || type === 'time') return (Number(a) || 0) - (Number(b) || 0)
	return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' })
}
</script>
</head>
<body>
<header>
<h1>BioVault per-user Rybbit report</h1>
<div class="muted">Generated ${escapeHtml(dateTime(report.generatedAt))}. Window: previous ${formatNumber(report.minutes)} minutes. Raw event cap per site: ${formatNumber(report.eventLimit)}.</div>
</header>
<main>
${report.sites.map(renderSite).join('\n')}
</main>
</body>
</html>`
}

function renderSite(site) {
	return `<section class="site" data-site="${escapeHtml(site.config.siteId)}">
<h2>${escapeHtml(site.config.label)} - ${escapeHtml(site.config.domain)} <span class="muted">(site ${escapeHtml(site.config.siteId)})</span></h2>
<div class="grid">
<div class="metric"><span>Raw events fetched</span><strong>${formatNumber(site.eventsFetched)}</strong></div>
<div class="metric"><span>Product events used</span><strong>${formatNumber(site.eventsUsed)}</strong></div>
<div class="metric"><span>Users in fetched events</span><strong>${formatNumber(site.totalUsers)}</strong></div>
<div class="metric"><span>Active product users</span><strong>${formatNumber(site.activeProductUsers)}</strong></div>
</div>
${site.eventsFetched >= site.eventLimit ? `<p class="muted">This site reached the raw-event cap of ${formatNumber(site.eventLimit)}. Increase <code>--event-limit</code> for a complete older-history user rollup.</p>` : ''}
<h3>User Rows</h3>
${countryFilterControls(site)}
${userTable(site.userRows)}
<h3>Daily Product Rollup</h3>
${dailyTable(site.dailyRows)}
</section>`
}

function countryFilterControls(site) {
	const filters = ['all', ...site.countryFilters]
	return `<div class="filters" aria-label="${escapeHtml(site.config.label)} country filters">${filters
		.map((country, index) => `<button class="filter-button" type="button" data-country-filter="${escapeHtml(country)}" aria-pressed="${index === 0 ? 'true' : 'false'}" onclick="filterCountry('${escapeHtml(site.config.siteId)}', '${escapeHtml(country)}')">${escapeHtml(country === 'all' ? 'All' : country)}</button>`)
		.join('')}</div>`
}

function userTable(users) {
	if (!users.length) return '<p class="muted">No product activity events in fetched raw events.</p>'
	return `<table><thead><tr><th><button type="button" aria-sort="none" onclick="sortUserTable(this, 'user', 'text')">User</button></th><th><button type="button" aria-sort="none" onclick="sortUserTable(this, 'countryText', 'text')">Country</button></th><th>Environment</th><th>Seen</th><th><button type="button" aria-sort="descending" onclick="sortUserTable(this, 'lastSeen', 'time')">Last seen</button></th><th><button type="button" aria-sort="none" onclick="sortUserTable(this, 'sessions', 'number')">Sessions</button></th><th><button type="button" aria-sort="none" onclick="sortUserTable(this, 'demoFiles', 'number')">Demo files</button></th><th><button type="button" aria-sort="none" onclick="sortUserTable(this, 'demoReports', 'number')">Demo reports</button></th><th><button type="button" aria-sort="none" onclick="sortUserTable(this, 'realFiles', 'number')">Real files</button></th><th><button type="button" aria-sort="none" onclick="sortUserTable(this, 'realReports', 'number')">Real reports</button></th><th><button type="button" aria-sort="none" onclick="sortUserTable(this, 'runs', 'number')">Runs</button></th><th><button type="button" aria-sort="none" onclick="sortUserTable(this, 'reportOpens', 'number')">Reports opened</button></th><th>Recent report journeys</th></tr></thead><tbody>${users.map(userRow).join('')}</tbody></table>`
}

function dailyTable(rows) {
	if (!rows.length) return '<p class="muted">No daily product activity.</p>'
	return `<table><thead><tr><th>Date</th><th>Users</th><th>Sessions</th><th>Demo files</th><th>Real files</th><th>Runs</th><th>Completed</th><th>Failed</th><th>Demo reports</th><th>Real reports</th><th>Report opens</th></tr></thead><tbody>${rows
		.map((row) => `<tr><td>${escapeHtml(row.date)}</td><td>${formatNumber(row.users)}</td><td>${formatNumber(row.sessions)}</td><td>${formatNumber(row.demoFiles)}</td><td>${formatNumber(row.realFiles)}</td><td>${formatNumber(row.runsStarted)}</td><td>${formatNumber(row.runsCompleted)}</td><td>${formatNumber(row.runsFailed)}</td><td>${formatNumber(row.demoReports)}</td><td>${formatNumber(row.realReports)}</td><td>${formatNumber(row.reportOpens)}</td></tr>`)
		.join('')}</tbody></table>`
}

function userRow(user) {
	const countries = [...user.countries].filter(Boolean).sort()
	const demoReports = totalCount(user.demoReports)
	const realReports = totalCount(user.realReports)
	return `<tr data-country="${escapeHtml(countries.join(','))}" data-country-text="${escapeHtml(countries.join(' '))}" data-demo-files="${user.demoFileAdds + user.demoLoads}" data-demo-reports="${demoReports}" data-last-seen="${user.lastSeenMs}" data-real-files="${user.realFileAdds}" data-real-reports="${realReports}" data-report-opens="${user.reportOpens}" data-runs="${user.runsStarted}" data-sessions="${user.sessions.size}" data-user="${escapeHtml(userLabel(user))}">
<td class="nowrap">${escapeHtml(userLabel(user))}<div class="sub">${formatNumber(user.events)} events, ${formatNumber(user.pageviews)} views${userAliases(user)}</div></td>
<td>${pills(countries.length ? countries : ['unknown'])}</td>
<td>${pills(mapLabels(user.environments).slice(0, 4))}</td>
<td>${escapeHtml(dateRange(user))}<div class="sub">${formatNumber(user.activeDays.size)} active day${user.activeDays.size === 1 ? '' : 's'}</div></td>
<td class="nowrap">${escapeHtml(shortDateTime(user.lastSeenMs))}</td>
<td>${formatNumber(user.sessions.size)}</td>
<td>${formatNumber(user.demoFileAdds + user.demoLoads)} loaded<div class="sub">${pills(mapLabels(user.demoFiles))}</div></td>
<td>${pills(mapLabels(user.demoReports))}</td>
<td>${formatNumber(user.realFileAdds)} loaded<div class="sub">${pills(mapLabels(user.realInputLabels))}${extraPills(user.realInputExtras)}</div></td>
<td>${pills(mapLabels(user.realReports))}</td>
<td>${formatNumber(user.runsStarted)} started<div class="sub">${formatNumber(user.runsCompleted)} completed, ${formatNumber(user.runsFailed)} failed</div></td>
<td>${formatNumber(user.reportOpens)}</td>
<td>${journeyList(user.reports)}</td>
</tr>`
}

function journeyList(reports) {
	const rows = reports.slice(-4).reverse()
	if (!rows.length) return '<span class="muted">None</span>'
	return rows
		.map((report) => {
			const parts = [shortDateTime(report.timeMs), report.assay, report.input, report.remoteKind, report.sourceUrl]
				.filter(Boolean)
				.map((part, index) => index === 0 ? escapeHtml(part) : `<span class="muted">${escapeHtml(part)}</span>`)
			return `<div>${parts.join('<br>')}</div>`
		})
		.join('')
}

function productActivityScore(user) {
	return user.filesAdded + user.demoLoads + user.heuristics + user.runsStarted + user.reportsGenerated + user.reportOpens
}

function countryFilters(users) {
	const counts = new Map()
	for (const user of users) {
		const countries = [...user.countries].filter(Boolean)
		for (const country of countries.length ? countries : ['unknown']) increment(counts, country)
	}
	return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([country]) => country)
}

function normalizeCountry(value) {
	const country = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().toUpperCase()
	return /^[A-Z]{2}$/.test(country) ? country : 'unknown'
}

async function rybbitGet(config, endpointPath, params = {}) {
	requireApiKey()
	const url = buildUrl(config.endpoint, endpointPath, params)
	for (let attempt = 0; attempt < 10; attempt += 1) {
		let response
		const controller = new AbortController()
		const timeout = setTimeout(() => controller.abort(), DEFAULT_REQUEST_TIMEOUT_MS)
		try {
			response = await fetch(url, {
				signal: controller.signal,
				headers: {
					Authorization: `Bearer ${process.env.RYBBIT_API_KEY}`,
					Accept: 'application/json',
				},
			})
		} catch (error) {
			clearTimeout(timeout)
			if (attempt === 9) throw error
			const waitMs = 2500 * (attempt + 1)
			console.error(`Rybbit API request failed for ${url.pathname}; retrying in ${Math.round(waitMs / 1000)}s`)
			await sleep(waitMs)
			continue
		} finally {
			clearTimeout(timeout)
		}
		const body = await readResponseBody(response)
		if (response.status !== 429 && response.ok) return body
		if (response.status !== 429 || attempt === 9) {
			throw new Error(`Rybbit API ${response.status} ${response.statusText}: ${formatBody(body)}`)
		}
		const retryAfter = Number(response.headers.get('retry-after') ?? 0)
		const waitMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(15000 * (attempt + 1), 60000)
		console.error(`Rybbit API rate limited ${url.pathname}; retrying in ${Math.round(waitMs / 1000)}s`)
		await sleep(waitMs)
	}
}

async function readResponseBody(response) {
	const text = await response.text()
	try {
		return text ? JSON.parse(text) : null
	} catch {
		return text
	}
}

function getConfig(site, options) {
	const normalized = site === 'production' ? 'prod' : site
	const isProd = normalized === 'prod'
	const siteId =
		normalized !== 'dev' && normalized !== 'prod'
			? normalized
			: isProd
				? (process.env.RYBBIT_PROD_SITE_ID ?? process.env.BIOVAULT_PROD_METRICS_SITE_ID ?? DEFAULT_PROD_SITE_ID)
				: (process.env.RYBBIT_SITE_ID ?? process.env.BIOVAULT_METRICS_SITE_ID ?? process.env.EXPO_PUBLIC_BIOVAULT_METRICS_SITE_ID ?? DEFAULT_DEV_SITE_ID)
	return {
		domain: isProd ? DEFAULT_PROD_DOMAIN : DEFAULT_DEV_DOMAIN,
		endpoint: stripTrailingSlash(options.endpoint ?? process.env.RYBBIT_API_BASE_URL ?? process.env.BIOVAULT_METRICS_ENDPOINT ?? DEFAULT_ENDPOINT),
		label: isProd ? 'Production' : normalized === 'dev' ? 'Development' : `Site ${siteId}`,
		site: normalized,
		siteId,
	}
}

function stableUserId(event) {
	return event.user_id || event.visitor_id || event.identified_user_id || event.sessionId || 'unknown'
}

function parseProperties(value) {
	if (!value) return {}
	if (typeof value === 'object') return value
	try {
		return JSON.parse(value)
	} catch {
		return {}
	}
}

function arrayProp(value) {
	if (Array.isArray(value)) return value.filter((item) => item !== undefined && item !== null).map(String)
	if (typeof value === 'string' && value.startsWith('[')) {
		try {
			const parsed = JSON.parse(value)
			if (Array.isArray(parsed)) return parsed.map(String)
		} catch {}
	}
	if (value === undefined || value === null || value === '') return []
	return [String(value)]
}

function numberProp(value, fallback) {
	const number = Number(value)
	return Number.isFinite(number) ? number : fallback
}

function firstValue(...values) {
	for (const value of values) {
		if (value !== undefined && value !== null && value !== '') return String(value)
	}
	return ''
}

function normalizedExtensions(values) {
	return [...new Set(values.map(normalizeExtension).filter(Boolean))]
}

function normalizeExtension(value) {
	if (!value) return ''
	const extension = String(value).trim().toLowerCase()
	return extension ? (extension.startsWith('.') ? extension : `.${extension}`) : ''
}

function extensionForKind(kind) {
	switch (kind) {
		case 'genotype_text':
		case 'text':
			return '.txt'
		case 'zip':
			return '.zip'
		case 'vcf':
			return '.vcf'
		case 'vcf_gz':
			return '.vcf.gz'
		case 'tbi':
			return '.vcf.gz.tbi'
		case 'cram':
			return '.cram'
		case 'crai':
			return '.cram.crai'
		case 'bam':
			return '.bam'
		case 'bai':
			return '.bam.bai'
		case 'fasta':
			return '.fa'
		case 'fai':
			return '.fa.fai'
		default:
			return ''
	}
}

function addExtension(set, value) {
	if (!value) return
	const string = String(value)
	if (string) set.add(string)
}

function addExtensionCount(map, value) {
	if (!value) return
	increment(map, String(value))
}

function addUnique(set, value) {
	if (value !== undefined && value !== null && value !== '') set.add(String(value))
}

function addEnvironment(user, event) {
	const parts = [
		firstValue(event.device_type),
		firstValue(event.browser),
		firstValue(event.operating_system),
	].filter(Boolean)
	if (parts.length) increment(user.environments, parts.join(' / '))
}

function increment(map, value, amount = 1) {
	if (value === undefined || value === null || value === '') return
	map.set(String(value), (map.get(String(value)) ?? 0) + amount)
}

function mapLabels(map) {
	return [...map.entries()]
		.sort((a, b) => b[1] - a[1])
		.map(([value, count]) => `${value} (${formatNumber(count)})`)
}

function totalCount(map) {
	return [...map.values()].reduce((sum, count) => sum + count, 0)
}

function pills(values) {
	const filtered = values.filter(Boolean).slice(0, 12)
	return filtered.length ? filtered.map((value) => `<span class="pill">${escapeHtml(value)}</span>`).join('') : '<span class="muted">None</span>'
}

function extraPills(map) {
	const values = mapLabels(map)
	return values.length ? `<div class="sub">extra: ${pills(values)}</div>` : ''
}

function dateRange(user) {
	if (!user.firstSeenMs || !user.lastSeenMs) return 'unknown'
	const first = shortDateTime(user.firstSeenMs)
	const last = shortDateTime(user.lastSeenMs)
	return first === last ? first : `${first} to ${last}`
}

function parseRybbitTimeMs(value) {
	if (!value) return 0
	if (typeof value === 'number') return Number.isFinite(value) ? value : 0
	const string = String(value)
	const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(string) ? `${string.replace(' ', 'T')}Z` : string
	const timeMs = new Date(normalized).getTime()
	return Number.isFinite(timeMs) ? timeMs : 0
}

function brisbaneDate(timeMs) {
	if (!timeMs) return 'unknown'
	return new Intl.DateTimeFormat('en-CA', {
		day: '2-digit',
		month: '2-digit',
		timeZone: 'Australia/Brisbane',
		year: 'numeric',
	}).format(new Date(timeMs))
}

function shortDateTime(timeMs) {
	if (!timeMs) return ''
	return new Intl.DateTimeFormat('en-AU', {
		day: '2-digit',
		hour: 'numeric',
		minute: '2-digit',
		month: 'short',
		timeZone: 'Australia/Brisbane',
	}).format(new Date(timeMs))
}

function dateTime(date) {
	return new Intl.DateTimeFormat('en-AU', {
		dateStyle: 'medium',
		timeStyle: 'short',
		timeZone: 'Australia/Brisbane',
	}).format(date)
}

function formatNumber(value) {
	return new Intl.NumberFormat('en-US').format(Number(value) || 0)
}

function maskId(value) {
	if (!value || value === 'unknown') return 'unknown'
	const string = String(value)
	if (string.startsWith('bv_')) return `BioVault ${string.slice(3, 11)}`
	return string.length <= 14 ? string : `${string.slice(0, 8)}...${string.slice(-4)}`
}

function userLabel(user) {
	const username = [...user.usernames].find(Boolean)
	if (username) return username
	const identified = [...user.identifiedUsers].find(Boolean)
	if (identified) return maskId(identified)
	return maskId(user.id)
}

function userAliases(user) {
	const aliases = [...user.identifiedUsers].map(maskId).filter((alias) => alias && alias !== userLabel(user))
	return aliases.length ? `<br>aliases: ${escapeHtml(aliases.slice(0, 4).join(', '))}` : ''
}

function buildUrl(base, endpointPath, params = {}) {
	const url = new URL(`${stripTrailingSlash(base)}${endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`}`)
	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined && value !== '') url.searchParams.set(key, String(value))
	}
	return url
}

function parseArgs(args) {
	const parsed = {}
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index]
		if (!arg.startsWith('--')) continue
		const [rawKey, inlineValue] = arg.slice(2).split('=', 2)
		const key = camelCase(rawKey)
		const next = args[index + 1]
		if (inlineValue !== undefined) {
			parsed[key] = inlineValue
		} else if (!next || next.startsWith('--')) {
			parsed[key] = true
		} else {
			parsed[key] = next
			index += 1
		}
	}
	return parsed
}

function loadDotEnv(envPath) {
	if (!fs.existsSync(envPath)) return
	const contents = fs.readFileSync(envPath, 'utf8')
	for (const line of contents.split(/\r?\n/)) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith('#')) continue
		const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
		if (!match || process.env[match[1]] !== undefined) continue
		process.env[match[1]] = unquote(match[2].trim())
	}
}

function unquote(value) {
	if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
		return value.slice(1, -1)
	}
	return value
}

function requireApiKey() {
	if (!process.env.RYBBIT_API_KEY) throw new Error('RYBBIT_API_KEY is not set in .env or the shell environment')
}

function stripTrailingSlash(value) {
	return value.replace(/\/+$/, '')
}

function camelCase(value) {
	return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
}

function formatBody(body) {
	return typeof body === 'string' ? body : JSON.stringify(body)
}

function escapeHtml(value) {
	return String(value)
		.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;')
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

function printHelp() {
	console.log(`Usage: node ./scripts/rybbit-user-report.mjs [options]

Generates a per-user BioVault product-activity report from Rybbit raw events.

Options:
  --sites dev,prod              Sites to include; defaults to dev,prod
  --minutes 43200               Lookback window; defaults to 30 days
  --event-limit 50000           Raw event cap per site
  --out reports/users.html      Output HTML path
  --use-cache                   Re-render from reports/rybbit-user-cache when available
  --cache-dir reports/cache     Override cache directory
`)
}
