#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_ENDPOINT = 'https://metrics.syftbox.net/api'
const DEFAULT_DEV_SITE_ID = '4'
const DEFAULT_PROD_SITE_ID = '6'
const DEFAULT_DEV_DOMAIN = 'dev-app.biovault.net'
const DEFAULT_PROD_DOMAIN = 'app.biovault.net'
const DEFAULT_EVENT_LIMIT = 10000
const DEFAULT_MINUTES = 60 * 24 * 30
const DEFAULT_REQUEST_TIMEOUT_MS = 30000

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
	for (const event of events) {
		const user = getUser(users, stableUserId(event))
		applyEvent(user, event)
	}
	const userRows = [...users.values()]
		.filter((user) => productActivityScore(user) > 0)
		.sort((a, b) => {
			const activityDelta = productActivityScore(b) - productActivityScore(a)
			return activityDelta || b.lastSeenMs - a.lastSeenMs
		})
	return {
		config,
		eventsFetched: rawEvents.length,
		eventsUsed: events.length,
		eventLimit,
		totalUsers: users.size,
		activeProductUsers: userRows.length,
		userRows,
	}
}

function normalizeEvent(event) {
	const props = parseProperties(event.properties)
	const timestamp = event.timestamp ?? event.created_at ?? event.createdAt ?? event.time ?? event.datetime
	const timeMs = timestamp ? new Date(timestamp).getTime() : 0
	return {
		...event,
		name: event.event_name || (event.type === 'pageview' ? 'pageview' : ''),
		props,
		sessionId: event.session_id || event.sessionId || '',
		timeMs: Number.isFinite(timeMs) ? timeMs : 0,
		timestamp: timestamp ? new Date(timestamp).toISOString() : '',
	}
}

function applyEvent(user, event) {
	user.events += 1
	if (event.sessionId) user.sessions.add(String(event.sessionId))
	if (event.timestamp) {
		user.activeDays.add(event.timestamp.slice(0, 10))
		if (!user.firstSeenMs || event.timeMs < user.firstSeenMs) user.firstSeenMs = event.timeMs
		if (!user.lastSeenMs || event.timeMs > user.lastSeenMs) user.lastSeenMs = event.timeMs
	}
	if (event.name === 'pageview') {
		user.pageviews += 1
		return
	}

	const props = event.props
	if (event.name === 'lab_sample_genome_requested' || event.name === 'lab_sample_genome_remote_requested') {
		user.demoRequests += 1
		addDemo(user, props)
		user.currentInput = makeInputContext('demo', props, event)
		return
	}
	if (event.name === 'lab_sample_genome_loaded') {
		user.demoLoads += numberProp(props.totalFiles, 1)
		addDemo(user, props)
		user.currentInput = makeInputContext('demo', props, event)
		return
	}
	if (event.name === 'lab_remote_file_loaded') {
		user.remoteFileLoads += 1
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
			addDemo(user, props)
		} else {
			user.realFileAdds += totalFiles
			addRealFile(user, props)
		}
		user.currentInput = makeInputContext(kind, props, event)
		return
	}
	if (event.name === 'using_file_heuristics') {
		user.heuristics += 1
		mergeHeuristics(user.currentInput, props)
		addRealFile(user, props)
		return
	}
	if (event.name === 'lab_run_started') {
		user.runsStarted += 1
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
		return
	}
	if (event.name === 'lab_run_completed') {
		user.runsCompleted += 1
		if (user.currentRun) user.currentRun.status = 'completed'
		return
	}
	if (event.name === 'lab_run_failed') {
		user.runsFailed += 1
		if (user.currentRun) user.currentRun.status = 'failed'
		return
	}
	if (event.name === 'lab_report_opened' || event.name === 'lab_report_opened_new_window') {
		user.reportOpens += 1
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
		assay: firstValue(props.assayId, props.internalAssayId, 'unknown'),
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
		assay: firstValue(props.assayId, props.internalAssayId, run?.assay, 'unknown'),
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
	const parts = [input.kind]
	if (input.demo) parts.push(input.demo)
	if (input.vendor) parts.push(input.vendor)
	if (input.format) parts.push(input.format)
	if (input.genomeKind) parts.push(input.genomeKind)
	const extensions = [...input.extensions].filter(Boolean)
	if (extensions.length) parts.push(extensions.join(','))
	const metadata = [...input.metadata].filter(Boolean).slice(0, 5)
	if (metadata.length) parts.push(metadata.join('; '))
	return parts.filter(Boolean).join(' | ')
}

function addDemo(user, props) {
	const label = firstValue(props.demo_title, props.demo_filename, props.demo_bundle_id, props.bundleId)
	if (label) increment(user.demoFiles, label)
	for (const value of arrayProp(props.demo_file_extensions)) increment(user.demoExtensions, value)
}

function addRealFile(user, props) {
	for (const value of arrayProp(props.fileKinds)) increment(user.realKinds, value)
	for (const value of arrayProp(props.relatedFileExtensions)) increment(user.realExtensions, value)
	addExtensionCount(user.realExtensions, props.fileExtension)
	addExtensionCount(user.realExtensions, props.selectedEntryExtension)
	for (const key of ['sourceVendor', 'platformVersion', 'assembly', 'inputFormat', 'detectedKind', 'confidence', 'sourceConfidence']) {
		if (props[key] !== undefined && props[key] !== null && props[key] !== '') increment(user.realMetadata, `${key}:${props[key]}`)
	}
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

function getUser(users, id) {
	if (!users.has(id)) {
		users.set(id, {
			activeDays: new Set(),
			assays: new Map(),
			currentInput: null,
			currentRun: null,
			demoExtensions: new Map(),
			demoFileAdds: 0,
			demoFiles: new Map(),
			demoLoads: 0,
			demoReports: new Map(),
			demoRequests: 0,
			events: 0,
			filesAdded: 0,
			firstSeenMs: 0,
			heuristics: 0,
			id,
			lastSeenMs: 0,
			pageviews: 0,
			realExtensions: new Map(),
			realFileAdds: 0,
			realKinds: new Map(),
			realMetadata: new Map(),
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
		})
	}
	return users.get(id)
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
@media (max-width: 900px) { header, main { padding-left: 14px; padding-right: 14px; } table { display: block; overflow-x: auto; white-space: nowrap; } td { min-width: 130px; } }
</style>
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
	return `<section class="site">
<h2>${escapeHtml(site.config.label)} - ${escapeHtml(site.config.domain)} <span class="muted">(site ${escapeHtml(site.config.siteId)})</span></h2>
<div class="grid">
<div class="metric"><span>Raw events fetched</span><strong>${formatNumber(site.eventsFetched)}</strong></div>
<div class="metric"><span>Product events used</span><strong>${formatNumber(site.eventsUsed)}</strong></div>
<div class="metric"><span>Users in fetched events</span><strong>${formatNumber(site.totalUsers)}</strong></div>
<div class="metric"><span>Active product users</span><strong>${formatNumber(site.activeProductUsers)}</strong></div>
</div>
<h3>User Rows</h3>
${userTable(site.userRows)}
</section>`
}

function userTable(users) {
	if (!users.length) return '<p class="muted">No product activity events in fetched raw events.</p>'
	return `<table><thead><tr><th>User</th><th>Seen</th><th>Sessions</th><th>Demo files</th><th>Demo reports</th><th>Real files</th><th>Real reports</th><th>Runs</th><th>Reports opened</th><th>Recent report journeys</th></tr></thead><tbody>${users.map(userRow).join('')}</tbody></table>`
}

function userRow(user) {
	return `<tr>
<td class="nowrap">${escapeHtml(maskId(user.id))}<div class="sub">${formatNumber(user.events)} events, ${formatNumber(user.pageviews)} views</div></td>
<td>${escapeHtml(dateRange(user))}<div class="sub">${formatNumber(user.activeDays.size)} active day${user.activeDays.size === 1 ? '' : 's'}</div></td>
<td>${formatNumber(user.sessions.size)}</td>
<td>${formatNumber(user.demoFileAdds + user.demoLoads)} loaded<div class="sub">${pills(mapLabels(user.demoFiles))}</div></td>
<td>${pills(mapLabels(user.demoReports))}</td>
<td>${formatNumber(user.realFileAdds)} loaded<div class="sub">${pills([...mapLabels(user.realExtensions), ...mapLabels(user.realMetadata).slice(0, 8)])}</div></td>
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
				.map(escapeHtml)
			return `<div>${parts.join('<br><span class="muted">')}</span></div>`
		})
		.join('')
}

function productActivityScore(user) {
	return user.filesAdded + user.demoLoads + user.heuristics + user.runsStarted + user.reportsGenerated + user.reportOpens
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
	return event.identified_user_id || event.user_id || event.visitor_id || event.sessionId || 'unknown'
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

function addExtension(set, value) {
	if (!value) return
	const string = String(value)
	if (string) set.add(string)
}

function addExtensionCount(map, value) {
	if (!value) return
	increment(map, String(value))
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

function pills(values) {
	const filtered = values.filter(Boolean).slice(0, 12)
	return filtered.length ? filtered.map((value) => `<span class="pill">${escapeHtml(value)}</span>`).join('') : '<span class="muted">None</span>'
}

function dateRange(user) {
	if (!user.firstSeenMs || !user.lastSeenMs) return 'unknown'
	const first = shortDateTime(user.firstSeenMs)
	const last = shortDateTime(user.lastSeenMs)
	return first === last ? first : `${first} to ${last}`
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
  --event-limit 10000           Raw event cap per site
  --out reports/users.html      Output HTML path
  --use-cache                   Re-render from reports/rybbit-user-cache when available
  --cache-dir reports/cache     Override cache directory
`)
}
