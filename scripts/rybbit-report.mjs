#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_ENDPOINT = 'https://metrics.syftbox.net/api'
const DEFAULT_DEV_SITE_ID = '4'
const DEFAULT_PROD_SITE_ID = '6'
const DEFAULT_DEV_DOMAIN = 'dev-app.biovault.net'
const DEFAULT_PROD_DOMAIN = 'app.biovault.net'
const DEFAULT_EVENT_LIMIT = 2500
const DEFAULT_MINUTES = 60 * 24 * 30
const DEFAULT_REQUEST_TIMEOUT_MS = 30000
const REPORT_EVENTS = [
	'lab_files_added',
	'using_file_heuristics',
	'lab_run_started',
	'lab_report_generated',
	'lab_run_completed',
	'lab_run_failed',
	'lab_report_opened',
	'lab_report_opened_new_window',
	'lab_share_link_copied',
	'lab_shared_link_opened',
	'lab_remote_file_loaded',
	'lab_sample_genome_loaded',
	'lab_sample_genome_requested',
	'lab_sample_genome_remote_requested',
]

loadDotEnv(path.resolve(process.cwd(), '.env'))

const options = parseArgs(process.argv.slice(2))
if (options.help) {
	printHelp()
	process.exit(0)
}

try {
	const report = await buildReport(options)
	const outPath = path.resolve(process.cwd(), options.out ?? 'reports/rybbit-biovault-report.html')
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
	const cacheDir = path.resolve(process.cwd(), options.cacheDir ?? 'reports/rybbit-cache')
	const metrics = parseMetrics(options.metrics)
	const sites = String(options.sites ?? 'dev,prod')
		.split(',')
		.map((site) => site.trim())
		.filter(Boolean)
	const generatedAt = new Date()
	const siteReports = []
	for (const site of sites) {
		const config = getConfig(site, options)
		const cachePath = path.join(cacheDir, `${config.siteId}-${minutes}-${eventLimit}-${cacheKeyPart(metrics)}-daily.json`)
		if (options.useCache && fs.existsSync(cachePath)) {
			console.error(`Using cached ${config.label} report: ${cachePath}`)
			siteReports.push(hydrateSiteReport(JSON.parse(fs.readFileSync(cachePath, 'utf8'))))
			continue
		}
		try {
		const siteReport = await buildSiteReport(config, { minutes, eventLimit, metrics })
			fs.mkdirSync(cacheDir, { recursive: true })
			fs.writeFileSync(cachePath, JSON.stringify(serializeSiteReport(siteReport), null, 2), 'utf8')
			siteReports.push(siteReport)
		} catch (error) {
			if (fs.existsSync(cachePath)) {
				console.error(`Using cached ${config.label} report after fetch failure: ${cachePath}`)
				siteReports.push(hydrateSiteReport(JSON.parse(fs.readFileSync(cachePath, 'utf8'))))
				continue
			}
			throw error
		}
	}
	return {
		eventLimit,
		generatedAt,
		minutes,
		sites: siteReports,
	}
}

function serializeSiteReport(siteReport) {
	return {
		...siteReport,
		propertyTotals: Object.fromEntries(
			Object.entries(siteReport.propertyTotals).map(([key, value]) => [key, [...value.entries()]]),
		),
		userRows: siteReport.userRows.map((user) => ({
			...user,
			assays: [...user.assays],
			confidences: [...user.confidences],
			fileKinds: [...user.fileKinds],
			formats: [...user.formats],
			vendors: [...user.vendors],
		})),
	}
}

function hydrateSiteReport(siteReport) {
	const hydratedPropertyTotals = Object.fromEntries(
		Object.entries(siteReport.propertyTotals ?? {}).map(([key, value]) => [key, new Map(value)]),
	)
	return {
		...siteReport,
		dailyOverview: siteReport.dailyOverview ?? [],
		propertyTotals: { ...emptyPropertyTotals(), ...hydratedPropertyTotals },
		userRows: siteReport.userRows.map((user) => ({
			...user,
			assays: new Set(user.assays),
			confidences: new Set(user.confidences),
			fileKinds: new Set(user.fileKinds),
			formats: new Set(user.formats),
			vendors: new Set(user.vendors),
		})),
	}
}

async function buildSiteReport(config, { minutes, eventLimit, metrics }) {
	const timeParams = { past_minutes_start: String(minutes), past_minutes_end: '0' }
	console.error(`Fetching ${config.label} overview`)
	const overview = await rybbitGet(config, `/sites/${config.siteId}/overview`, timeParams)
	const dailyOverview = await fetchDailyOverview(config, minutes)
	console.error(`Fetching ${config.label} event totals`)
	const eventNames = await rybbitGet(config, `/sites/${config.siteId}/events/names`, timeParams)
	const aggregatePropertyTotals = await fetchAggregatePropertyTotals(config, timeParams)
	const metricRowsByParameter = {}
	for (const parameter of metrics) {
		console.error(`Fetching ${config.label} metric: ${parameter}`)
		const metric = await rybbitGet(config, `/sites/${config.siteId}/metric`, {
			...timeParams,
			parameter,
			limit: '12',
		})
		metricRowsByParameter[parameter] = metricRows(metric)
	}
	const events = eventLimit > 0 ? await fetchEvents(config, timeParams, eventLimit) : []
	return analyzeSite({
		config,
		country: metricRowsByParameter.country ?? [],
		deviceType: metricRowsByParameter.device_type ?? [],
		eventLimit,
		eventNames: eventNameRows(eventNames),
		events,
		aggregatePropertyTotals,
		dailyOverview,
		operatingSystem: metricRowsByParameter.operating_system ?? [],
		overview: overview?.data ?? {},
		referrer: metricRowsByParameter.referrer ?? [],
		browser: metricRowsByParameter.browser ?? [],
	})
}

async function fetchAggregatePropertyTotals(config, timeParams) {
	const eventPropertiesByName = {}
	for (const eventName of [
		'using_file_heuristics',
		'lab_files_added',
		'lab_run_started',
		'lab_report_generated',
		'lab_report_opened',
		'lab_report_opened_new_window',
		'lab_share_link_copied',
		'lab_shared_link_opened',
	]) {
		console.error(`Fetching ${config.label} event properties: ${eventName}`)
		try {
			const response = await rybbitGet(config, `/sites/${config.siteId}/events/properties`, {
				...timeParams,
				event_name: eventName,
			})
			eventPropertiesByName[eventName] = eventPropertyRows(response)
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			console.error(`Event properties failed for ${config.label} ${eventName}: ${message}`)
			eventPropertiesByName[eventName] = []
		}
	}

	return buildAggregatePropertyTotals(eventPropertiesByName)
}

function buildAggregatePropertyTotals(eventPropertiesByName) {
	const totals = emptyPropertyTotals()
	const heuristics = eventPropertiesByName.using_file_heuristics ?? []
	const filesAdded = eventPropertiesByName.lab_files_added ?? []
	const runs = eventPropertiesByName.lab_run_started ?? []
	const reports = [
		...(eventPropertiesByName.lab_report_generated ?? []),
		...(eventPropertiesByName.lab_report_opened ?? []),
		...(eventPropertiesByName.lab_report_opened_new_window ?? []),
	]
	const shareCopied = eventPropertiesByName.lab_share_link_copied ?? []
	const shareOpened = eventPropertiesByName.lab_shared_link_opened ?? []

	addPropertyCounts(totals.fileFormats, heuristics, ['inputFormat'])
	addPropertyCounts(totals.heuristicKinds, heuristics, ['detectedKind'])
	addPropertyCounts(totals.heuristicConfidence, heuristics, ['confidence', 'sourceConfidence'])
	addPropertyCounts(totals.sourceVendors, heuristics, ['sourceVendor'], { emptyLabel: 'unknown' })
	addPropertyCounts(totals.fileExtensions, heuristics, ['fileExtension', 'selectedEntryExtension'])

	addPropertyCounts(totals.dataSources, filesAdded, ['data_source'])
	addPropertyCounts(totals.demoFiles, filesAdded, ['demo_title', 'demo_filename', 'demo_bundle_id'])
	addPropertyCounts(totals.fileKinds, filesAdded, ['fileKinds', 'demo_file_kinds'], { expandArrays: true })
	addPropertyCounts(totals.fileSources, filesAdded, ['fileSources'], { expandArrays: true })

	addPropertyCounts(totals.assays, runs, ['assayId'])
	addPropertyCounts(totals.internalAssays, runs, ['internalAssayId'])
	addPropertyCounts(totals.assayLanguages, runs, ['assayLanguage'])
	addPropertyCounts(totals.assayKinds, runs, ['remoteKind', 'assaySource'])
	addPropertyCounts(totals.genomeKinds, runs, ['genomeKind'])
	addPropertyCounts(totals.runSourceUrls, runs, ['sourceUrl'])
	addPropertyCounts(totals.packageSourceUrls, runs, ['packageSourceUrl'])

	addPropertyCounts(totals.reportArtifacts, reports, ['artifactNames'], { expandArrays: true })
	addPropertyCounts(totals.reportAssays, reports, ['assayId'])
	addPropertyCounts(totals.reportSourceUrls, reports, ['sourceUrl', 'packageSourceUrl'])

	addPropertyCounts(totals.shareUrls, shareCopied, ['shareUrl'])
	addPropertyCounts(totals.shareTargetUrls, shareCopied, ['targetUrl'])
	addPropertyCounts(totals.sharedLinkUrls, shareOpened, ['url'])
	addPropertyCounts(totals.sharedLinkSources, shareOpened, ['source'])
	return totals
}

async function fetchDailyOverview(config, minutes) {
	console.error(`Fetching ${config.label} daily overview with rolling daily windows`)
	return fetchRollingDailyOverview(config, minutes)
}

async function fetchRollingDailyOverview(config, minutes) {
	const dayMinutes = 60 * 24
	const totalDays = Math.max(1, Math.ceil(minutes / dayMinutes))
	const rows = []
	for (let dayIndex = totalDays - 1; dayIndex >= 0; dayIndex -= 1) {
		const pastMinutesEnd = dayIndex * dayMinutes
		const pastMinutesStart = Math.min(minutes, pastMinutesEnd + dayMinutes)
		if (pastMinutesStart <= pastMinutesEnd) continue
		console.error(`Fetching ${config.label} daily overview window: ${totalDays - dayIndex}/${totalDays}`)
		const overview = await rybbitGet(config, `/sites/${config.siteId}/overview`, {
			past_minutes_start: String(pastMinutesStart),
			past_minutes_end: String(pastMinutesEnd),
		})
		rows.push({
			bounces: numberFromKeys(overview?.data ?? {}, ['bounces', 'bounce_count', 'bounceCount']),
			date: rollingWindowDate(pastMinutesEnd),
			events: numberFromKeys(overview?.data ?? {}, ['events', 'event_count', 'eventCount']),
			pageviews: numberFromKeys(overview?.data ?? {}, ['pageviews', 'page_views', 'views']),
			sessions: numberFromKeys(overview?.data ?? {}, ['sessions', 'visits']),
			users: numberFromKeys(overview?.data ?? {}, ['users', 'unique_users', 'visitors']),
		})
	}
	return trimLeadingEmptyDailyRows(rows)
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
		if (!page?.cursor?.hasMore || !page?.cursor?.oldestTimestamp || rows.length === 0) {
			break
		}
		beforeTimestamp = page.cursor.oldestTimestamp
		await sleep(750)
	}
	return events
}

function analyzeSite(input) {
	const users = new Map()
	const eventTotals = new Map()
	const propertyTotals = input.aggregatePropertyTotals ?? emptyPropertyTotals()
	const hasAggregatePropertyTotals = Boolean(input.aggregatePropertyTotals)

	for (const event of input.events) {
		const name = event.event_name || (event.type === 'pageview' ? 'pageview' : '')
		const props = parseProperties(event.properties)
		if (name) increment(eventTotals, name)
		const userId = stableUserId(event)
		const user = getUser(users, userId)
		user.events += 1
		if (event.type === 'pageview') user.pageviews += 1
		if (name === 'lab_files_added') {
			user.filesAdded += numberProp(props.totalFiles, 1)
			const sources = arrayProp(props.fileSources)
			for (const source of sources) {
				if (!hasAggregatePropertyTotals) increment(propertyTotals.fileSources, source)
				if (source === 'bundled') user.demoFileAdds += 1
				if (source === 'local' || source === 'url') user.userSuppliedFileAdds += 1
			}
			for (const kind of arrayProp(props.fileKinds)) addUnique(user.fileKinds, kind)
			const dataSource = props.data_source || (props.is_demo_file === true ? 'demo' : 'user_or_unknown')
			if (!hasAggregatePropertyTotals) increment(propertyTotals.dataSources, String(dataSource))
		}
		if (name === 'using_file_heuristics') {
			user.heuristics += 1
			addUnique(user.formats, props.inputFormat || props.detectedKind || props.fileExtension)
			addUnique(user.vendors, props.sourceVendor)
			addUnique(user.confidences, props.confidence)
			if (!hasAggregatePropertyTotals) {
				increment(propertyTotals.fileFormats, props.inputFormat || props.detectedKind || props.fileExtension)
				increment(propertyTotals.heuristicKinds, props.detectedKind)
				increment(propertyTotals.heuristicConfidence, props.confidence)
				increment(propertyTotals.sourceVendors, props.sourceVendor || 'unknown')
			}
		}
		if (name === 'lab_run_started') {
			user.runsStarted += 1
			addUnique(user.assays, props.assayId)
			if (!hasAggregatePropertyTotals) increment(propertyTotals.assays, props.assayId || 'unknown')
		}
		if (name === 'lab_run_completed') user.runsCompleted += 1
		if (name === 'lab_run_failed') user.runsFailed += 1
		if (name === 'lab_report_generated') {
			user.reportsGenerated += 1
			if (!hasAggregatePropertyTotals) {
				for (const artifact of arrayProp(props.artifactNames)) increment(propertyTotals.reportArtifacts, artifact)
			}
		}
		if (name === 'lab_report_opened' || name === 'lab_report_opened_new_window') user.reportOpens += 1
		if (name === 'lab_share_link_copied') user.shareLinksCopied += 1
		if (name === 'lab_shared_link_opened') user.shareLinksOpened += 1
		if (name === 'lab_sample_genome_loaded') user.demoLoads += 1
		if (name === 'lab_remote_file_loaded') user.remoteFileLoads += 1
	}

	const userRows = [...users.values()]
		.filter((user) => productActivityScore(user) > 0)
		.sort((a, b) => productActivityScore(b) - productActivityScore(a))
		.slice(0, 50)

	const eventTotalsRows = input.eventNames.length
		? input.eventNames
		: mapRows(eventTotals).sort((a, b) => b.count - a.count)

	return {
		...input,
		eventTotals: eventTotalsRows,
		eventsFetched: input.events.length,
		insights: deriveInsights(input.overview, eventTotalsRows, propertyTotals, userRows),
		propertyTotals,
		userRows,
	}
}

function emptyPropertyTotals() {
	return {
		assayKinds: new Map(),
		assayLanguages: new Map(),
		assays: new Map(),
		dataSources: new Map(),
		demoFiles: new Map(),
		fileExtensions: new Map(),
		fileFormats: new Map(),
		fileKinds: new Map(),
		fileSources: new Map(),
		genomeKinds: new Map(),
		heuristicConfidence: new Map(),
		heuristicKinds: new Map(),
		internalAssays: new Map(),
		packageSourceUrls: new Map(),
		reportArtifacts: new Map(),
		reportAssays: new Map(),
		reportSourceUrls: new Map(),
		runSourceUrls: new Map(),
		sharedLinkSources: new Map(),
		sharedLinkUrls: new Map(),
		shareTargetUrls: new Map(),
		shareUrls: new Map(),
		sourceVendors: new Map(),
	}
}

function deriveInsights(overview, eventTotals, propertyTotals, userRows) {
	const getEvent = (name) => eventTotals.find((row) => row.eventName === name)?.count ?? 0
	const usersWithUserFiles = userRows.filter((user) => user.userSuppliedFileAdds > 0).length
	const usersWithDemoFiles = userRows.filter((user) => user.demoFileAdds > 0 || user.demoLoads > 0).length
	const runsStarted = getEvent('lab_run_started')
	const runsCompleted = getEvent('lab_run_completed')
	const reportsOpened = getEvent('lab_report_opened') + getEvent('lab_report_opened_new_window')
	return [
		['Total views', formatNumber(overview.pageviews ?? 0)],
		['Unique users', formatNumber(overview.users ?? 0)],
		['Users adding real/local/url files', formatNumber(usersWithUserFiles)],
		['Users using demo files', formatNumber(usersWithDemoFiles)],
		['Run completion rate', percent(runsCompleted, runsStarted)],
		['Reports opened per completed run', ratio(reportsOpened, runsCompleted)],
		['Top assay', firstMapLabel(propertyTotals.assays)],
		['Top detected format', firstMapLabel(propertyTotals.fileFormats)],
		['Top source/vendor', firstMapLabel(propertyTotals.sourceVendors)],
	]
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
			if (attempt === 9) {
				const message = error instanceof Error ? error.message : String(error)
				throw new Error(`Rybbit API request failed for ${url.pathname}: ${message}`)
			}
			const waitMs = 2500 * (attempt + 1)
			console.error(`Rybbit API request failed for ${url.pathname}; retrying in ${Math.round(waitMs / 1000)}s`)
			await sleep(waitMs)
			continue
		} finally {
			clearTimeout(timeout)
		}
		const body = await readResponseBody(response)
		if (response.status !== 429 && response.ok) {
			return body
		}
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
	const domain = isProd ? DEFAULT_PROD_DOMAIN : DEFAULT_DEV_DOMAIN
	return {
		domain,
		endpoint: stripTrailingSlash(options.endpoint ?? process.env.RYBBIT_API_BASE_URL ?? process.env.BIOVAULT_METRICS_ENDPOINT ?? DEFAULT_ENDPOINT),
		label: isProd ? 'Production' : normalized === 'dev' ? 'Development' : `Site ${siteId}`,
		site: normalized,
		siteId,
	}
}

function renderHtml(report) {
	const title = `BioVault Rybbit report - ${dateTime(report.generatedAt)}`
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root { color-scheme: light; --bg: #f6f5f1; --panel: #ffffff; --ink: #17201b; --muted: #66706a; --line: #d8ddd5; --accent: #2f7d57; --warn: #996b14; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 14px/1.45 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
header { padding: 28px 32px 18px; border-bottom: 1px solid var(--line); background: #ffffff; }
h1 { margin: 0 0 6px; font-size: 28px; line-height: 1.15; letter-spacing: 0; }
h2 { margin: 28px 0 10px; font-size: 20px; }
h3 { margin: 22px 0 8px; font-size: 15px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
main { padding: 0 32px 36px; }
.site { margin-top: 24px; padding-top: 8px; border-top: 3px solid var(--accent); }
.grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
.metric { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 14px; }
.metric strong { display: block; font-size: 24px; line-height: 1.15; }
.metric span, .muted { color: var(--muted); }
table { width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
th, td { padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
th { background: #eef3ef; font-size: 12px; color: #435047; }
tr:last-child td { border-bottom: 0; }
.cols { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); align-items: start; }
.note { margin: 16px 0; padding: 12px 14px; border-left: 4px solid var(--warn); background: #fff8e8; color: #4f3b12; }
.pill { display: inline-block; margin: 0 4px 4px 0; padding: 2px 7px; border: 1px solid var(--line); border-radius: 999px; background: #f8faf8; white-space: nowrap; }
.chart { width: 100%; height: 230px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 10px; overflow: visible; }
.chart text { fill: var(--muted); font-size: 11px; }
.chart .axis { stroke: var(--line); stroke-width: 1; }
.chart .bar { fill: var(--accent); }
@media (max-width: 720px) { header, main { padding-left: 16px; padding-right: 16px; } table { font-size: 12px; } th, td { padding: 7px; } }
</style>
</head>
<body>
<header>
<h1>BioVault Rybbit report</h1>
<div class="muted">Generated ${escapeHtml(dateTime(report.generatedAt))}. Window: previous ${formatNumber(report.minutes)} minutes. Raw event cap per site: ${formatNumber(report.eventLimit)}.</div>
</header>
<main>
<section>
<h2>Comparison</h2>
${comparisonTable(report.sites)}
</section>
${report.sites.map(renderSite).join('\n')}
<section>
<h2>Tracking Notes</h2>
<div class="note">Report time-on-page is not currently reliable from these events. We can infer report interest from <code>lab_report_opened</code> and <code>lab_report_opened_new_window</code>, but true dwell time needs an explicit close/heartbeat event.</div>
<table><thead><tr><th>Question</th><th>Current signal</th><th>Gap / next event</th></tr></thead><tbody>
${trackingRows().map((row) => `<tr><td>${escapeHtml(row[0])}</td><td>${escapeHtml(row[1])}</td><td>${escapeHtml(row[2])}</td></tr>`).join('')}
</tbody></table>
</section>
</main>
</body>
</html>`
}

function renderSite(site) {
	const dailyOverview = site.dailyOverview ?? []
	return `<section class="site">
<h2>${escapeHtml(site.config.label)} - ${escapeHtml(site.config.domain)} <span class="muted">(site ${escapeHtml(site.config.siteId)})</span></h2>
<div class="grid">
${site.insights.map(([label, value]) => `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}
</div>
<p class="muted">Fetched ${formatNumber(site.eventsFetched)} recent raw events for per-user/product analysis.</p>
<div class="cols">
${dailyChart('Daily Views', dailyOverview, 'pageviews')}
${dailyChart('Daily Users', dailyOverview, 'users')}
</div>
${dailyTable(dailyOverview)}
<div class="cols">
${smallTable('Browser Mix', site.browser, ['value', 'count', 'percentage'])}
${smallTable('Device Mix', site.deviceType, ['value', 'count', 'percentage'])}
${smallTable('Country Highlights', site.country, ['value', 'count', 'percentage'])}
${smallTable('Traffic Sources', site.referrer.length ? site.referrer : [{ value: 'Direct / no referrer', count: site.overview.pageviews ?? 0, percentage: 100 }], ['value', 'count', 'percentage'])}
</div>
<div class="cols">
${smallTable('Event Totals', site.eventTotals.filter((row) => REPORT_EVENTS.includes(row.eventName)).slice(0, 20), ['eventName', 'count'])}
${smallTable('Assays Run', mapRows(site.propertyTotals.assays).slice(0, 20), ['value', 'count'])}
${smallTable('Input Formats', mapRows(site.propertyTotals.fileFormats).slice(0, 12), ['value', 'count'])}
${smallTable('Detected Kinds', mapRows(site.propertyTotals.heuristicKinds).slice(0, 12), ['value', 'count'])}
</div>
<div class="cols">
${smallTable('Source Vendors', mapRows(site.propertyTotals.sourceVendors).slice(0, 12), ['value', 'count'])}
${smallTable('File Extensions', mapRows(site.propertyTotals.fileExtensions).slice(0, 12), ['value', 'count'])}
${smallTable('Demo Files', mapRows(site.propertyTotals.demoFiles).slice(0, 12), ['value', 'count'])}
${smallTable('File Sources', mapRows(site.propertyTotals.fileSources).slice(0, 12), ['value', 'count'])}
${smallTable('Genome Kinds Run', mapRows(site.propertyTotals.genomeKinds).slice(0, 12), ['value', 'count'])}
${smallTable('Assay Source URLs', mapRows(site.propertyTotals.runSourceUrls).slice(0, 12), ['value', 'count'])}
</div>
<div class="cols">
${smallTable('Shared Link Opens', mapRows(site.propertyTotals.sharedLinkUrls).slice(0, 20), ['value', 'count'])}
${smallTable('Copied Share URLs', mapRows(site.propertyTotals.shareUrls).slice(0, 20), ['value', 'count'])}
${smallTable('Copied Target URLs', mapRows(site.propertyTotals.shareTargetUrls).slice(0, 20), ['value', 'count'])}
${smallTable('Package Source URLs', mapRows(site.propertyTotals.packageSourceUrls).slice(0, 12), ['value', 'count'])}
</div>
<h3>Active Users</h3>
${userTable(site.userRows)}
</section>`
}

function comparisonTable(sites) {
	const rows = sites.map((site) => ({
		label: `${site.config.label} (${site.config.domain})`,
		views: site.overview.pageviews ?? 0,
		users: site.overview.users ?? 0,
		files: countEvent(site.eventTotals, 'lab_files_added'),
		runs: countEvent(site.eventTotals, 'lab_run_started'),
		completed: countEvent(site.eventTotals, 'lab_run_completed'),
		reports: countEvent(site.eventTotals, 'lab_report_opened') + countEvent(site.eventTotals, 'lab_report_opened_new_window'),
		shares: countEvent(site.eventTotals, 'lab_share_link_copied'),
		opens: countEvent(site.eventTotals, 'lab_shared_link_opened'),
	}))
	return `<table><thead><tr><th>Site</th><th>Views</th><th>Users</th><th>Files added</th><th>Runs</th><th>Completed</th><th>Report opens</th><th>Shares copied</th><th>Shared links opened</th></tr></thead><tbody>${rows
		.map((row) => `<tr><td>${escapeHtml(row.label)}</td><td>${formatNumber(row.views)}</td><td>${formatNumber(row.users)}</td><td>${formatNumber(row.files)}</td><td>${formatNumber(row.runs)}</td><td>${formatNumber(row.completed)}</td><td>${formatNumber(row.reports)}</td><td>${formatNumber(row.shares)}</td><td>${formatNumber(row.opens)}</td></tr>`)
		.join('')}</tbody></table>`
}

function dailyChart(title, rows, key) {
	const values = rows.map((row) => Number(row[key] ?? 0))
	const max = Math.max(...values, 0)
	const chartWidth = 720
	const chartHeight = 220
	const padding = { top: 18, right: 12, bottom: 42, left: 48 }
	const innerWidth = chartWidth - padding.left - padding.right
	const innerHeight = chartHeight - padding.top - padding.bottom
	const barGap = rows.length > 16 ? 2 : 5
	const barWidth = rows.length ? Math.max(2, (innerWidth - barGap * (rows.length - 1)) / rows.length) : innerWidth
	const bars = rows
		.map((row, index) => {
			const value = Number(row[key] ?? 0)
			const height = max > 0 ? (value / max) * innerHeight : 0
			const x = padding.left + index * (barWidth + barGap)
			const y = padding.top + innerHeight - height
			const label = shortDate(row.date)
			const showLabel = rows.length <= 12 || index === 0 || index === rows.length - 1 || index % Math.ceil(rows.length / 6) === 0
			return `<g><rect class="bar" x="${round(x)}" y="${round(y)}" width="${round(barWidth)}" height="${round(height)}"><title>${escapeHtml(`${row.date}: ${formatNumber(value)}`)}</title></rect><text x="${round(x + barWidth / 2)}" y="${round(y - 4)}" text-anchor="middle">${value > 0 ? formatNumber(value) : ''}</text>${showLabel ? `<text x="${round(x + barWidth / 2)}" y="${chartHeight - 18}" text-anchor="middle">${escapeHtml(label)}</text>` : ''}</g>`
		})
		.join('')
	return `<section><h3>${escapeHtml(title)}</h3><svg class="chart" viewBox="0 0 ${chartWidth} ${chartHeight}" role="img" aria-label="${escapeHtml(title)}">${max > 0 ? `<text x="${padding.left}" y="12">Max ${formatNumber(max)}</text>` : '<text x="48" y="110">No daily data</text>'}<line class="axis" x1="${padding.left}" y1="${padding.top + innerHeight}" x2="${chartWidth - padding.right}" y2="${padding.top + innerHeight}"></line><line class="axis" x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + innerHeight}"></line>${bars}</svg></section>`
}

function dailyTable(rows) {
	const tableRows = rows
		.map((row) => `<tr><td>${escapeHtml(row.date)}</td><td>${formatNumber(row.pageviews)}</td><td>${formatNumber(row.users)}</td><td>${formatNumber(row.sessions)}</td><td>${formatNumber(row.events)}</td><td>${formatNumber(row.bounces)}</td></tr>`)
		.join('')
	return `<section><h3>Daily Numbers</h3><table><thead><tr><th>Date</th><th>Views</th><th>Users</th><th>Sessions</th><th>Events</th><th>Bounces</th></tr></thead><tbody>${tableRows || '<tr><td colspan="6" class="muted">No daily data</td></tr>'}</tbody></table></section>`
}

function smallTable(title, rows, keys) {
	const body = rows.length
		? rows.map((row) => `<tr>${keys.map((key) => `<td>${formatCell(row[key], key)}</td>`).join('')}</tr>`).join('')
		: `<tr><td colspan="${keys.length}" class="muted">No data</td></tr>`
	return `<section><h3>${escapeHtml(title)}</h3><table><thead><tr>${keys.map((key) => `<th>${escapeHtml(labelForKey(key))}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></section>`
}

function userTable(users) {
	if (!users.length) return '<p class="muted">No product activity events in fetched raw events.</p>'
	return `<table><thead><tr><th>User</th><th>Files</th><th>Formats</th><th>Assays</th><th>Runs</th><th>Reports</th><th>Sharing</th></tr></thead><tbody>${users
		.map((user) => `<tr><td>${escapeHtml(maskId(user.id))}</td><td>${formatNumber(user.filesAdded)} total<br><span class="muted">${formatNumber(user.userSuppliedFileAdds)} real/local/url, ${formatNumber(user.demoFileAdds + user.demoLoads)} demo</span></td><td>${pills([...user.formats, ...user.vendors, ...user.confidences])}</td><td>${pills([...user.assays])}</td><td>${formatNumber(user.runsStarted)} started<br><span class="muted">${formatNumber(user.runsCompleted)} completed, ${formatNumber(user.runsFailed)} failed</span></td><td>${formatNumber(user.reportsGenerated)} generated<br><span class="muted">${formatNumber(user.reportOpens)} opened</span></td><td>${formatNumber(user.shareLinksCopied)} copied<br><span class="muted">${formatNumber(user.shareLinksOpened)} opened</span></td></tr>`)
		.join('')}</tbody></table>`
}

function trackingRows() {
	return [
		['Are people dragging in real files?', 'lab_files_added has fileSources plus demo flags; raw report classifies local/url as user-supplied.', 'Add explicit input_method: drag_drop/file_picker/url and is_user_supplied_data on every add path.'],
		['Which formats/heuristics per user?', 'using_file_heuristics has inputFormat, detectedKind, confidence, sourceVendor, assembly, extensions.', 'Avoid fileName in future analytics; keep extension/vendor/confidence only.'],
		['What assays are running?', 'lab_run_started/completed/failed have assayId and assayLanguage.', 'Add assay package version or content hash for comparing changing remote assays.'],
		['Are users clicking reports?', 'lab_report_opened and lab_report_opened_new_window show click intent.', 'Track report_view_closed or report_view_heartbeat with durationMs for dwell time.'],
		['Sharing links sent/received?', 'lab_share_link_copied and lab_shared_link_opened capture both sides.', 'Add share_source and target_resource_kind; avoid storing full target URLs in analytics.'],
		['Traffic source?', 'Rybbit referrer metric is available, but current data may be direct/empty.', 'Add UTM preservation/reporting if campaigns matter.'],
	]
}

function getUser(users, id) {
	if (!users.has(id)) {
		users.set(id, {
			assays: new Set(),
			confidences: new Set(),
			demoFileAdds: 0,
			demoLoads: 0,
			events: 0,
			fileKinds: new Set(),
			filesAdded: 0,
			formats: new Set(),
			heuristics: 0,
			id,
			pageviews: 0,
			remoteFileLoads: 0,
			reportOpens: 0,
			reportsGenerated: 0,
			runsCompleted: 0,
			runsFailed: 0,
			runsStarted: 0,
			shareLinksCopied: 0,
			shareLinksOpened: 0,
			userSuppliedFileAdds: 0,
			vendors: new Set(),
		})
	}
	return users.get(id)
}

function productActivityScore(user) {
	return user.filesAdded + user.heuristics + user.runsStarted + user.reportsGenerated + user.reportOpens + user.shareLinksCopied + user.shareLinksOpened
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

function stableUserId(event) {
	return event.identified_user_id || event.user_id || event.session_id || 'unknown'
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

function metricRows(response) {
	return Array.isArray(response?.data?.data) ? response.data.data : []
}

function eventNameRows(response) {
	return Array.isArray(response?.data) ? response.data : []
}

function eventPropertyRows(response) {
	return Array.isArray(response?.data) ? response.data : []
}

function addPropertyCounts(target, rows, keys, options = {}) {
	for (const row of rows) {
		if (!keys.includes(row.propertyKey)) continue
		const count = Number(row.count) || 0
		for (const value of propertyValues(row.propertyValue, options)) {
			increment(target, value, count)
		}
	}
}

function propertyValues(value, options = {}) {
	if (value === undefined || value === null || value === '') {
		return options.emptyLabel ? [options.emptyLabel] : []
	}
	if (options.expandArrays && typeof value === 'string' && value.startsWith('[')) {
		try {
			const parsed = JSON.parse(value)
			if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean)
		} catch {}
	}
	if (options.expandArrays && Array.isArray(value)) return value.map(String).filter(Boolean)
	return [String(value)]
}

function dailyOverviewRows(response) {
	const data = Array.isArray(response?.data?.data) ? response.data.data : Array.isArray(response?.data) ? response.data : []
	return data
		.map((row) => ({
			bounces: numberFromKeys(row, ['bounces', 'bounce_count', 'bounceCount']),
			date: bucketDate(row),
			events: numberFromKeys(row, ['events', 'event_count', 'eventCount']),
			pageviews: numberFromKeys(row, ['pageviews', 'page_views', 'views']),
			sessions: numberFromKeys(row, ['sessions', 'visits']),
			users: numberFromKeys(row, ['users', 'unique_users', 'visitors']),
		}))
		.filter((row) => row.date)
		.sort((a, b) => a.date.localeCompare(b.date))
}

function trimLeadingEmptyDailyRows(rows) {
	const firstDataIndex = rows.findIndex((row) =>
		['pageviews', 'users', 'sessions', 'events', 'bounces'].some((key) => Number(row[key] ?? 0) > 0),
	)
	return firstDataIndex === -1 ? [] : rows.slice(firstDataIndex)
}

function bucketDate(row) {
	const value = row.date ?? row.time ?? row.timestamp ?? row.bucket ?? row.startTime ?? row.start_time
	if (!value) return ''
	if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? String(value) : date.toISOString().slice(0, 10)
}

function rollingWindowDate(pastMinutesEnd) {
	const end = new Date(Date.now() - pastMinutesEnd * 60 * 1000)
	return new Intl.DateTimeFormat('en-CA', {
		day: '2-digit',
		month: '2-digit',
		timeZone: 'Australia/Brisbane',
		year: 'numeric',
	}).format(end)
}

function numberFromKeys(row, keys) {
	for (const key of keys) {
		const value = Number(row[key])
		if (Number.isFinite(value)) return value
	}
	return 0
}

function parseMetrics(value) {
	const defaultMetrics = ['browser', 'device_type', 'country', 'referrer', 'operating_system']
	if (value === undefined || value === true || value === 'default' || value === 'all') return defaultMetrics
	if (value === 'none' || value === 'off' || value === '0') return []
	return String(value)
		.split(',')
		.map((metric) => metric.trim())
		.filter(Boolean)
}

function cacheKeyPart(values) {
	return values.length ? values.join('-').replace(/[^a-zA-Z0-9_-]/g, '_') : 'no-metrics'
}

function mapRows(map) {
	return [...map.entries()]
		.filter(([value]) => value !== undefined && value !== null && value !== '')
		.map(([value, count]) => ({ value, count }))
		.sort((a, b) => b.count - a.count)
}

function firstMapLabel(map) {
	const first = mapRows(map)[0]
	return first ? `${first.value} (${formatNumber(first.count)})` : 'No data'
}

function countEvent(rows, eventName) {
	return rows.find((row) => row.eventName === eventName)?.count ?? 0
}

function increment(map, value, amount = 1) {
	if (value === undefined || value === null || value === '') return
	map.set(String(value), (map.get(String(value)) ?? 0) + amount)
}

function addUnique(set, value) {
	if (value !== undefined && value !== null && value !== '') set.add(String(value))
}

function pills(values) {
	const filtered = values.filter(Boolean).slice(0, 8)
	return filtered.length ? filtered.map((value) => `<span class="pill">${escapeHtml(value)}</span>`).join('') : '<span class="muted">None</span>'
}

function formatCell(value, key) {
	if (key === 'percentage' || key.endsWith('percentage')) return `${Number(value ?? 0).toFixed(1)}%`
	if (typeof value === 'number') return formatNumber(value)
	return escapeHtml(String(value ?? ''))
}

function labelForKey(key) {
	return key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
}

function ratio(numerator, denominator) {
	if (!denominator) return 'No completed runs'
	return (numerator / denominator).toFixed(2)
}

function percent(numerator, denominator) {
	if (!denominator) return 'No runs'
	return `${((numerator / denominator) * 100).toFixed(1)}%`
}

function formatNumber(value) {
	return new Intl.NumberFormat('en-US').format(Number(value) || 0)
}

function round(value) {
	return Number(value).toFixed(2)
}

function shortDate(value) {
	const match = String(value).match(/^\d{4}-(\d{2})-(\d{2})$/)
	return match ? `${match[1]}/${match[2]}` : String(value)
}

function dateTime(date) {
	return new Intl.DateTimeFormat('en-AU', {
		dateStyle: 'medium',
		timeStyle: 'short',
		timeZone: 'Australia/Brisbane',
	}).format(date)
}

function maskId(value) {
	if (!value || value === 'unknown') return 'unknown'
	const string = String(value)
	return string.length <= 10 ? string : `${string.slice(0, 6)}...${string.slice(-4)}`
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
	console.log(`Usage: node ./scripts/rybbit-report.mjs [options]

Generates an HTML analytics report for BioVault Rybbit sites.

Options:
  --sites dev,prod              Sites to compare; defaults to dev,prod
  --minutes 43200               Lookback window; defaults to 30 days
  --event-limit 2500            Raw event cap per site for per-user analysis
  --metrics LIST|none           Metric dimensions; defaults to browser,device_type,country,referrer,operating_system
  --out reports/report.html     Output HTML path
  --use-cache                   Re-render from reports/rybbit-cache when available
  --cache-dir reports/cache     Override cache directory
`)
}
