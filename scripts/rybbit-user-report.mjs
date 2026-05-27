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
	'lab_input_ready',
	'lab_files_added',
	'using_file_heuristics',
	'lab_run_started',
	'lab_run_metadata_ready',
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
		if (options.inputEvents) {
			const inputPath = path.resolve(process.cwd(), String(options.inputEvents))
			console.error(`Using fixture/raw events for ${config.label}: ${inputPath}`)
			events = loadInputEvents(inputPath)
		} else if (options.useCache && fs.existsSync(cachePath)) {
			console.error(`Using cached ${config.label} events: ${cachePath}`)
			events = JSON.parse(fs.readFileSync(cachePath, 'utf8'))
		} else {
			console.error(`Fetching ${config.label} raw events`)
			events = await fetchEvents(config, { past_minutes_start: String(minutes), past_minutes_end: '0' }, eventLimit)
			fs.mkdirSync(cacheDir, { recursive: true })
			fs.writeFileSync(cachePath, JSON.stringify(events, null, 2), 'utf8')
		}
		siteReports.push(analyzeSite(config, events, eventLimit, minutes))
	}
	return { eventLimit, generatedAt, minutes, sites: siteReports }
}

function loadInputEvents(inputPath) {
	const value = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
	if (Array.isArray(value)) return value
	if (Array.isArray(value?.data)) return value.data
	if (Array.isArray(value?.events)) return value.events
	throw new Error(`Input events file must contain an array, { data }, or { events }: ${inputPath}`)
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

function analyzeSite(config, rawEvents, eventLimit, minutes) {
	const cutoffMs = minutes ? Date.now() - Number(minutes) * 60_000 : 0
	const events = rawEvents
		.map(normalizeEvent)
		.filter((event) => !cutoffMs || event.timeMs >= cutoffMs)
		.filter((event) => event.name === 'pageview' || PRODUCT_EVENTS.has(event.name))
		.sort((a, b) => a.timeMs - b.timeMs)
	const users = new Map()
	const daily = new Map()
	for (const event of events) {
		const user = getUser(users, stableUserId(event))
		applyEvent(user, event, daily)
	}
	const userRows = [...users.values()]
		.sort((a, b) => {
			const activityDelta = productActivityScore(b) - productActivityScore(a)
			return activityDelta || b.lastSeenMs - a.lastSeenMs
		})
	const activeProductUsers = userRows.filter((user) => productActivityScore(user) > 0)
	return {
		config,
		countryFilters: countryFilters(userRows),
		eventsFetched: rawEvents.length,
		eventsUsed: events.length,
		eventLimit,
		dailyRows: dailyRows(daily, users),
		summary: siteSummary(userRows),
		totalUsers: users.size,
		activeProductUsers: activeProductUsers.length,
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
	addTrafficSource(user, event)
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
		markDemoActivity(user, day)
		user.currentInput = makeInputContext('demo', props, event)
		return
	}
	if (event.name === 'lab_sample_genome_loaded') {
		const count = numberProp(props.totalFiles, 1)
		user.demoLoads += count
		day.demoFiles += count
		addDemo(user, props)
		addInputType(user, props, 'demo')
		markDemoActivity(user, day)
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
		const kind = inputKindFromProps(props)
		if (kind === 'demo') {
			user.demoFileAdds += totalFiles
			day.demoFiles += totalFiles
			addDemo(user, props)
			addInputType(user, props, 'demo')
			markDemoActivity(user, day)
		} else {
			user.realFileAdds += totalFiles
			day.realFiles += totalFiles
			addRealFile(user, props)
			addInputType(user, props, 'real')
			markRealActivity(user, day)
		}
		user.currentInput = makeInputContext(kind, props, event)
		return
	}
	if (event.name === 'lab_input_ready') {
		const totalFiles = numberProp(props.input_related_file_count, numberProp(props.totalFiles, 1))
		user.filesAdded += totalFiles
		const kind = inputKindFromProps(props)
		if (kind === 'demo') {
			user.demoFileAdds += totalFiles
			day.demoFiles += totalFiles
			addDemo(user, props)
			addInputType(user, props, 'demo')
			markDemoActivity(user, day)
		} else {
			user.realFileAdds += totalFiles
			day.realFiles += totalFiles
			addRealFile(user, props)
			addInputType(user, props, 'real')
			markRealActivity(user, day)
		}
		user.currentInput = makeInputContext(kind, props, event)
		return
	}
	if (event.name === 'using_file_heuristics') {
		user.heuristics += 1
		mergeHeuristics(user.currentInput, props)
		if (user.currentInput && shouldCoerceLegacyDemoInput(propsFromInput(user.currentInput), props)) {
			user.currentInput.kind = 'demo'
		}
		if (user.currentInput?.kind !== 'demo') {
			addRealFile(user, props)
			addInputType(user, props, 'real')
		} else {
			addInputType(user, props, 'demo')
		}
		return
	}
	if (event.name === 'lab_run_metadata_ready') {
		const input = hasExplicitInputProps(props) ? makeInputContext(inputKindFromProps(props), props, event) : user.currentInput
		if (input) {
			user.currentInput = input
			if (user.currentRun) user.currentRun.input = inputSummary(input) || user.currentRun.input
		}
		return
	}
	if (event.name === 'lab_run_started') {
		user.runsStarted += 1
		day.runsStarted += 1
		const input = hasExplicitInputProps(props) ? makeInputContext(inputKindFromProps(props), props, event) : user.currentInput
		if (input?.kind === 'demo') markDemoActivity(user, day)
		else if (input) markRealActivity(user, day)
		const run = makeRun(props, event, input)
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
		if (report.input.startsWith('demo')) {
			day.demoReports += 1
			markDemoActivity(user, day)
		} else {
			day.realReports += 1
			markRealActivity(user, day)
		}
		return
	}
	if (event.name === 'lab_run_completed') {
		user.runsCompleted += 1
		day.runsCompleted += 1
		const input = hasExplicitInputProps(props) ? makeInputContext(inputKindFromProps(props), props, event) : user.currentInput
		if (input?.kind === 'demo') {
			day.demoReports += 1
			markDemoActivity(user, day)
		} else if (input) {
			day.realReports += 1
			markRealActivity(user, day)
		}
		if (input && input.kind !== 'demo') {
			const inputProps = propsFromInput(input)
			addRealFile(user, inputProps)
			addInputType(user, inputProps, 'real')
		}
		addAssay(user, props)
		if (user.currentRun) {
			user.currentRun.status = 'completed'
			user.currentRun.input = inputSummary(input) || user.currentRun.input
		} else {
			const run = makeRun(props, event, input)
			run.status = 'completed'
			user.runs.push(run)
			user.currentRun = run
		}
		addReportSummary(user, {
			assay: reportLabel(props, user.currentRun?.assay),
			input: inputSummary(input || user.currentRun?.input),
		})
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
		format: firstValue(props.input_format, props.file_format),
		genomeKind: props.genomeKind ? String(props.genomeKind) : firstValue(props.input_type),
		id: firstValue(props.input_id),
		kind,
		metadata: new Set(),
		source: '',
		timeMs: event.timeMs,
		vendor: firstValue(props.input_vendor),
	}
	for (const value of arrayProp(props.fileSources).concat(arrayProp(props.input_source))) input.metadata.add(`source:${value}`)
	for (const value of arrayProp(props.fileKind).concat(arrayProp(props.fileKinds)).concat(arrayProp(props.demo_file_kinds)).concat(arrayProp(props.input_file_kinds)).concat(arrayProp(props.input_related_file_kinds))) input.metadata.add(`kind:${value}`)
	for (const value of arrayProp(props.demo_file_extensions).concat(arrayProp(props.input_file_extensions)).concat(arrayProp(props.input_additional_file_extensions))) addExtension(input.extensions, value)
	addExtension(input.extensions, props.fileExtension)
	addExtension(input.extensions, props.input_primary_file_extension)
	addExtension(input.extensions, props.selectedEntryExtension)
	addExtension(input.extensions, props.input_selected_entry_extension)
	input.demo = firstValue(props.demo_title, props.demo_filename, props.demo_bundle_id, props.bundleId)
	input.source = firstValue(props.input_source, props.data_source, props.source, props.remoteKind)
	mergeHeuristics(input, props)
	return input
}

function mergeHeuristics(input, props) {
	if (!input) return
	input.format ||= firstValue(props.inputFormat, props.input_format, props.file_format, props.detectedKind, props.input_detected_kind)
	input.vendor ||= firstValue(props.sourceVendor, props.input_vendor)
	input.genomeKind ||= firstValue(props.genomeKind)
	for (const value of arrayProp(props.relatedFileExtensions).concat(arrayProp(props.input_file_extensions)).concat(arrayProp(props.input_additional_file_extensions))) addExtension(input.extensions, value)
	addExtension(input.extensions, props.fileExtension)
	addExtension(input.extensions, props.input_primary_file_extension)
	addExtension(input.extensions, props.selectedEntryExtension)
	addExtension(input.extensions, props.input_selected_entry_extension)
	for (const key of ['input_id', 'assembly', 'input_assembly', 'confidence', 'input_confidence', 'sourceConfidence', 'input_source_confidence', 'platformVersion', 'input_vendor_version', 'input_source_product', 'input_source_type', 'input_imputation_version', 'container', 'input_container', 'detectedKind', 'input_detected_kind', 'input_hash_sha256', 'file_hash_sha256']) {
		if (props[key] !== undefined && props[key] !== null && props[key] !== '') input.metadata.add(`${key}:${props[key]}`)
	}
}

function hasExplicitInputProps(props) {
	return props.input_id || props.input_format || props.file_format || props.input_type || props.is_demo_file !== undefined || props.is_user_supplied_data !== undefined
}

function inputKindFromProps(props) {
	if (props.is_demo_file === true || props.is_demo_file === 'true' || props.input_source === 'demo' || props.data_source === 'demo' || arrayProp(props.fileSources).includes('bundled')) return 'demo'
	if (props.is_user_supplied_data === true || props.is_user_supplied_data === 'true' || props.input_source === 'local' || props.input_source === 'url') return 'real'
	if (shouldCoerceLegacyDemoInput(props)) return 'demo'
	return 'real'
}

function shouldCoerceLegacyDemoInput(...propSets) {
	const props = Object.assign({}, ...propSets.filter(Boolean))
	if (hasExplicitModernInputOwnership(props)) return false
	const sourceUrl = firstValue(props.sourceUrl, props.packageSourceUrl, props.url)
	const bundleId = firstValue(props.bundleId, props.demo_bundle_id)
	const title = firstValue(props.demo_title, props.demo_filename)
	if (bundleId === 'biovault-23andme-sample') return true
	if (/sample 23andme zip|genome_hu50b3f5_v5_full/i.test(title)) return true
	if (/biovault-data\/blob\/main\/snp\/23andme\/v5\/hu50b3f5\/genome_hu50b3f5_v5_full\.zip/i.test(sourceUrl)) return true
	if (/openmined\/biovault-data/i.test(sourceUrl) && /23andme\/v5\/hu50b3f5/i.test(sourceUrl)) return true

	const normalized = normalizedInputFromProps(props)
	if (normalized.type === 'snp' && normalized.source === '23andMe v5') return true
	return false
}

function hasExplicitModernInputOwnership(props) {
	return props.is_demo_file !== undefined ||
		props.is_user_supplied_data !== undefined ||
		props.input_source === 'demo' ||
		props.input_source === 'local' ||
		props.input_source === 'url'
}

function makeRun(props, event, input) {
	return {
		assay: normalizeAssayName(reportLabel(props, firstValue(props.assayId, props.internalAssayId, 'unknown'))),
		genomeKind: firstValue(props.genomeKind, input?.genomeKind),
		input: inputSummary(input),
		inputKind: typeof input === 'string' ? inputKindFromSummary(input) : (input?.kind ?? ''),
		remoteKind: firstValue(props.remoteKind),
		sourceUrl: firstValue(props.sourceUrl, props.packageSourceUrl),
		status: 'started',
		timeMs: event.timeMs,
	}
}

function makeReport(props, event, input, run) {
	return {
		artifacts: arrayProp(props.artifactNames),
		assay: normalizeAssayName(reportLabel(props, run?.assay)),
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

function inputKindFromSummary(value) {
	const kind = String(value).split('|', 1)[0]?.trim()
	return kind || ''
}

function metadataValue(input, key) {
	if (!input || typeof input === 'string' || !input.metadata) return ''
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
	increment(user.realInputSourceGroups, inputSourceGroup(normalized.source))
	incrementNested(user.realInputSourceDetails, inputSourceGroup(normalized.source), normalized.source)
}

function addInputType(user, props, kind) {
	const normalized = normalizedInputFromProps(props)
	const identity = inputIdentityKey(props, normalized)
	if (kind === 'demo') {
		increment(user.demoInputTypes, normalized.type)
		user.demoFileIdentities.set(identity, normalized.type)
	} else {
		increment(user.realInputTypes, normalized.type)
		user.realFileIdentities.set(identity, normalized.type)
	}
}

function addAssay(user, props) {
	const assay = normalizeAssayName(reportLabel(props, firstValue(props.assayId, props.internalAssayId)))
	if (assay) increment(user.assays, assay)
}

function addReportSummary(user, report) {
	const assay = normalizeAssayName(report.assay || 'unknown')
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
	if (['snp', 'vcf', 'bcf', 'cram', 'bam', 'fasta', 'unknown'].includes(rawType)) return rawType
	const detectedKind = String(props.detectedKind ?? props.input_detected_kind ?? '').toLowerCase()
	const inputFormat = String(props.inputFormat ?? props.input_format ?? props.file_format ?? '').toLowerCase()
	const genomeKind = String(props.genomeKind ?? '').toLowerCase()
	const fileKinds = arrayProp(props.fileKinds)
		.concat(arrayProp(props.fileKind))
		.concat(arrayProp(props.input_file_kinds))
		.concat(arrayProp(props.input_related_file_kinds))
		.map((value) => value.toLowerCase())
	if (
		detectedKind === 'genotype_text' ||
		inputFormat === 'genotype_text' ||
		inputFormat === 'text' ||
		inputFormat === 'zip' ||
		genomeKind === 'text' ||
		genomeKind === 'zip' ||
		genomeKind === 'snp' ||
		fileKinds.some((kind) => kind === 'genotype_text' || kind === 'zip')
	) return 'snp'
	if (detectedKind === 'vcf' || inputFormat === 'vcf' || inputFormat === 'vcf_gz' || genomeKind === 'vcf' || genomeKind === 'vcf_gz' || fileKinds.some((kind) => kind === 'vcf_gz' || kind === 'vcf' || kind === 'tbi')) return 'vcf'
	if (detectedKind === 'bcf' || inputFormat === 'bcf' || genomeKind === 'bcf' || fileKinds.some((kind) => kind === 'bcf')) return 'bcf'
	if (detectedKind === 'alignment_cram' || inputFormat === 'cram' || genomeKind === 'cram' || fileKinds.some((kind) => kind === 'cram' || kind === 'crai')) return 'cram'
	if (detectedKind === 'alignment_bam' || inputFormat === 'bam' || genomeKind === 'bam' || fileKinds.some((kind) => kind === 'bam' || kind === 'bai')) return 'bam'
	if (detectedKind === 'reference_fasta' || inputFormat === 'fasta' || genomeKind === 'fasta' || fileKinds.some((kind) => kind === 'fasta' || kind === 'fai')) return 'fasta'
	return 'unknown'
}

function normalizedInputSource(props, type) {
	if (type !== 'snp') return 'Unknown'
	const explicit = firstValue(props.input_source_label, props.inputSourceLabel)
	if (explicit) return explicit
	const product = firstValue(props.input_source_product)
	const sourceType = firstValue(props.input_source_type)
	const imputationVersion = firstValue(props.input_imputation_version)
	if (product && sourceType === 'imputed') return imputationVersion ? `${product} ${imputationVersion}` : product
	const vendor = firstValue(props.input_vendor, props.inputVendor, props.sourceVendor)
	const version = firstValue(props.input_vendor_version, props.inputVendorVersion, props.platformVersion)
	if (!vendor) return 'Unknown'
	if (vendor === '23andMe' && version) return `${vendor} ${version}`
	return vendor
}

function normalizedInputExtra(props) {
	const type = normalizedInputType(props)
	const related = normalizedExtensions(arrayProp(props.relatedFileExtensions)
		.concat(arrayProp(props.input_file_extensions))
		.concat(arrayProp(props.input_additional_file_extensions)))
	const fileExtension = normalizeExtension(firstValue(props.fileExtension, props.input_primary_file_extension))
	const selectedEntryExtension = normalizeExtension(firstValue(props.selectedEntryExtension, props.input_selected_entry_extension))
	const fileKinds = arrayProp(props.fileKinds)
		.concat(arrayProp(props.fileKind))
		.concat(arrayProp(props.input_file_kinds))
		.concat(arrayProp(props.input_related_file_kinds))
		.map((value) => value.toLowerCase())
	const extensions = normalizedExtensions([
		...related,
		fileExtension,
		selectedEntryExtension,
		...fileKinds.map(extensionForKind),
	])
	if (type === 'vcf') return extensionExtra(extensions, [['.vcf.gz', '.vcf.gz.tbi'], ['.vcf', '.vcf.tbi']], ['.vcf.gz', '.vcf'])
	if (type === 'bcf') return extensionExtra(extensions, [], ['.bcf'])
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
		detectedKind: firstValue(metadataValue(input, 'input_detected_kind'), metadataValue(input, 'detectedKind'), input.format),
		input_hash_sha256: firstValue(metadataValue(input, 'input_hash_sha256'), metadataValue(input, 'file_hash_sha256')),
		input_id: firstValue(input.id, metadataValue(input, 'input_id')),
		genomeKind: input.genomeKind,
		input_vendor: input.vendor,
		input_imputation_version: metadataValue(input, 'input_imputation_version'),
		input_source_product: metadataValue(input, 'input_source_product'),
		input_source_type: metadataValue(input, 'input_source_type'),
		input_vendor_version: firstValue(metadataValue(input, 'input_vendor_version'), metadataValue(input, 'platformVersion')),
		input_format: input.format,
		platformVersion: firstValue(metadataValue(input, 'input_vendor_version'), metadataValue(input, 'platformVersion')),
		sourceVendor: input.vendor,
	}
	const extensions = [...input.extensions].filter(Boolean)
	props.relatedFileExtensions = extensions
	props.input_file_extensions = extensions
	props.fileExtension = extensions.includes('.zip') ? '.zip' : extensions[0] || ''
	props.input_primary_file_extension = props.fileExtension
	props.selectedEntryExtension = extensions.includes('.zip') && extensions.includes('.txt') ? '.txt' : ''
	props.input_selected_entry_extension = props.selectedEntryExtension
	return props
}

function reportLabel(props, fallback) {
	const explicit = firstValue(props.assay_name, props.assayName, props.panelName, props.bioscriptName, props.name)
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

function normalizeAssayName(value) {
	const raw = String(value ?? '').trim()
	if (!raw) return ''
	const key = raw
		.toLowerCase()
		.replace(/[_\s]+/g, '-')
		.replace(/-+/g, '-')
	if (key === 'pgx' || key === 'pgx-1' || key === 'pgx-1-panel' || key === 'gpx') return 'PGx'
	if (key === 'glp1' || key === 'glp1-medication-response') return 'GLP1'
	if (key === 'prostate-cancer-prs' || key === 'prostate-cancer-prs-schumacher') return 'Prostate cancer PRS'
	if (key === 'apol1') return 'APOL1'
	if (key === 'apoe' || key === 'apoe-epsilon-pgx' || key === 'apoe-assay') return 'APOE'
	if (key === 'foxo3-longevity' || key === 'longevity') return 'FOXO3 longevity'
	if (key === 'pcsk9-ldl' || key === 'pcsk9') return 'PCSK9'
	if (key === 'thalassemia' || key === 'thalassemia-status') return 'Thalassemia'
	if (key === 'mthfr-c677t-a1298c' || key === 'mthfr') return 'PGx'
	if (/^(abcb1|abcg2|adra2a|cyp|slco|dpyd|tpmt|nudt15|vkorc1|hla)-/.test(key)) return 'PGx'
	if (key === 'unknown' || key === 'unknown-manifest' || key === 'manifest') return 'unknown'
	return raw
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
			demoFileIdentities: new Map(),
			demoFiles: new Map(),
			demoInputTypes: new Map(),
			demoLoads: 0,
			demoReports: new Map(),
			demoRequests: 0,
			didDemo: false,
			didReal: false,
			events: 0,
			environments: new Map(),
			filesAdded: 0,
			firstTrafficSource: '',
			firstSeenMs: 0,
			heuristics: 0,
			id,
			identifiedUsers: new Set(),
			lastSeenMs: 0,
			pageviews: 0,
			realFileAdds: 0,
			realFileIdentities: new Map(),
			realInputExtras: new Map(),
			realInputLabels: new Map(),
			realInputSourceDetails: new Map(),
			realInputSourceGroups: new Map(),
			realInputTypes: new Map(),
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
			demoUsers: new Set(),
			demoFiles: 0,
			demoReports: 0,
			demoRequests: 0,
			pageviews: 0,
			realUsers: new Set(),
			realFiles: 0,
			realReports: 0,
			returnUsers: new Set(),
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

function dailyRows(daily, users) {
	for (const user of users.values()) {
		if (user.sessions.size <= 1) continue
		for (const date of user.activeDays) {
			const day = daily.get(date)
			if (day) day.returnUsers.add(user.id)
		}
	}
	return [...daily.values()]
		.sort((a, b) => a.date.localeCompare(b.date))
		.map((row) => ({
			...row,
			demoUsers: row.demoUsers.size,
			realUsers: row.realUsers.size,
			returnUsers: row.returnUsers.size,
			sessions: row.sessions.size,
			users: row.users.size,
		}))
}

function siteSummary(users) {
	const nonDemoFileCounts = new Map()
	let completedPanels = 0
	let completedRealPanels = 0
	let realUploadCompletedRealPanels = 0
	let realUploadUsers = 0
	let usersRanAnyDemo = 0
	let usersRanAnyPanel = 0
	let usersRanNonDemo = 0
	let uniqueVisitors = 0
	for (const user of users) {
		const completedRuns = user.runs.filter((run) => run.status === 'completed')
		const completedDemoRuns = completedRuns.filter((run) => run.inputKind === 'demo')
		const completedNonDemoRuns = completedRuns.filter((run) => run.inputKind !== 'demo')
		if (user.pageviews > 0) uniqueVisitors += 1
		if (completedDemoRuns.length) usersRanAnyDemo += 1
		if (completedNonDemoRuns.length) usersRanNonDemo += 1
		if (completedRuns.length) {
			usersRanAnyPanel += 1
			completedPanels += completedRuns.length
			completedRealPanels += completedNonDemoRuns.length
		}
		if (user.realFileAdds > 0) {
			realUploadUsers += 1
			realUploadCompletedRealPanels += completedNonDemoRuns.length
		}
		if (user.realInputLabels.size) {
			for (const [label, count] of user.realInputLabels) increment(nonDemoFileCounts, label, count)
		} else if (user.realFileAdds > 0) {
			increment(nonDemoFileCounts, 'unknown non-demo file', user.realFileAdds)
		}
	}
	return {
		averagePanelsPerRealUploadUser: average(realUploadCompletedRealPanels, realUploadUsers),
		averagePanelsPerUserWhoRanAny: average(completedPanels, usersRanAnyPanel),
		completedPanels,
		completedRealPanels,
		nonDemoFileCounts,
		realUploadUsers,
		uniqueVisitors,
		usersRanAnyDemo,
		usersRanAnyPanel,
		usersRanNonDemo,
	}
}

function average(numerator, denominator) {
	return denominator > 0 ? numerator / denominator : 0
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
:root {
	color-scheme: light;
	--bg: #fbfcfb;
	--panel: #ffffff;
	--ink: #18211d;
	--ink-2: #47564f;
	--muted: #6c7972;
	--line: #e3e8e5;
	--line-2: #eef2f0;
	--accent: #10b981;
	--accent-2: #0f766e;
	--accent-soft: #dff8ed;
	--blue: #2563eb;
	--violet: #7c3aed;
	--warn: #f59e0b;
	--rose: #e11d48;
	--soft: #f2f7f4;
	--shadow: 0 1px 2px rgba(24, 33, 29, .04), 0 10px 30px rgba(24, 33, 29, .06);
	--radius: 14px;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
	background:
		radial-gradient(circle at top left, rgba(16, 185, 129, .10), transparent 34rem),
		linear-gradient(180deg, #f8fbf9 0%, var(--bg) 22rem);
	color: var(--ink);
	font: 13px/1.5 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
header {
	position: sticky;
	top: 0;
	z-index: 10;
	background: rgba(255, 255, 255, .88);
	backdrop-filter: blur(18px);
	border-bottom: 1px solid var(--line);
	padding: 14px 32px;
}
main { margin: 0 auto; max-width: 1440px; padding: 0 32px 40px; }
h1 { margin: 0; font-size: 20px; line-height: 1.15; letter-spacing: 0; }
h2 { margin: 28px 0 12px; font-size: 24px; letter-spacing: 0; }
h3 { margin: 20px 0 10px; font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }
table { width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; box-shadow: var(--shadow); }
th, td { padding: 9px 10px; border-bottom: 1px solid var(--line-2); text-align: left; vertical-align: top; }
th { background: #f5f8f6; font-size: 11px; color: #405048; white-space: nowrap; }
tr:last-child td { border-bottom: 0; }
.brandbar { align-items: center; display: flex; justify-content: space-between; gap: 16px; }
.brand { align-items: center; display: flex; gap: 10px; font-weight: 700; }
.logo { align-items: center; background: linear-gradient(135deg, var(--accent), var(--accent-2)); border-radius: 9px; color: white; display: inline-flex; font-size: 13px; height: 30px; justify-content: center; width: 30px; }
.site { margin-top: 26px; }
.grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
.metric { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); padding: 16px; }
.metric strong { display: block; font-size: 27px; font-weight: 700; line-height: 1.1; margin-top: 5px; }
.muted, .metric span { color: var(--muted); }
.chart { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); margin: 16px 0 18px; padding: 18px; }
.chart svg { display: block; height: auto; width: 100%; }
.legend { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 8px; }
.legend-item { align-items: center; display: inline-flex; gap: 5px; }
.swatch { border-radius: 999px; display: inline-block; height: 9px; width: 9px; }
details summary { cursor: pointer; font-weight: 650; }
.badges { align-items: center; display: flex; flex-wrap: wrap; gap: 6px; }
.badge { border: 1px solid var(--line); border-radius: 999px; display: inline-flex; font-size: 11px; font-weight: 700; line-height: 1; padding: 5px 8px; white-space: nowrap; }
.badge-assay { background: #ecfdf5; border-color: #bbf7d0; color: #047857; }
.badge-demo { background: #eff6ff; border-color: #bfdbfe; color: #1d4ed8; }
.badge-real { background: #fff7ed; border-color: #fed7aa; color: #c2410c; }
.badge-kind { background: #f5f3ff; border-color: #ddd6fe; color: #6d28d9; text-transform: uppercase; }
.pair-detail { color: var(--muted); margin-top: 6px; }
.pill { display: inline-block; margin: 0 4px 4px 0; padding: 3px 8px; border: 1px solid var(--line); border-radius: 999px; background: #fbfdfc; white-space: nowrap; }
.sub { margin-top: 4px; color: var(--muted); }
.nowrap { white-space: nowrap; }
.filters { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 12px; }
.filter-button { border: 1px solid var(--line); border-radius: 999px; background: var(--panel); color: var(--ink); cursor: pointer; font: inherit; font-weight: 600; padding: 5px 11px; }
.filter-button[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: #fff; }
.tabbar { display: flex; flex-wrap: wrap; gap: 8px; margin: 18px 0 12px; }
.tab-button { border: 0; border-radius: 9px; background: #eef3f0; color: var(--ink-2); cursor: pointer; font: inherit; font-weight: 650; padding: 8px 13px; }
.tab-button[aria-selected="true"] { background: var(--ink); color: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.08); }
.tab-panel[hidden] { display: none; }
th button { all: unset; cursor: pointer; display: inline-flex; gap: 4px; align-items: center; }
th button::after { color: var(--muted); content: "sort"; font-size: 10px; font-weight: 400; }
th button[aria-sort="ascending"]::after { content: "asc"; }
th button[aria-sort="descending"]::after { content: "desc"; }
@media (max-width: 900px) { header, main { padding-left: 14px; padding-right: 14px; } table { display: block; overflow-x: auto; white-space: nowrap; } td { min-width: 130px; } .brandbar { align-items: flex-start; flex-direction: column; } }
</style>
<script>
function toggleCountry(siteId, country) {
	const section = document.querySelector('[data-site="' + siteId + '"]')
	if (!section) return
	const buttons = Array.from(section.querySelectorAll('[data-country-filter]'))
	if (country === 'all') {
		for (const button of buttons) button.setAttribute('aria-pressed', button.dataset.countryFilter === 'all' ? 'true' : 'false')
	} else {
		const allButton = buttons.find((button) => button.dataset.countryFilter === 'all')
		const button = buttons.find((candidate) => candidate.dataset.countryFilter === country)
		if (!button) return
		button.setAttribute('aria-pressed', button.getAttribute('aria-pressed') === 'true' ? 'false' : 'true')
		if (allButton) allButton.setAttribute('aria-pressed', 'false')
		const selected = buttons.filter((candidate) => candidate.dataset.countryFilter !== 'all' && candidate.getAttribute('aria-pressed') === 'true')
		if (!selected.length && allButton) allButton.setAttribute('aria-pressed', 'true')
	}
	applyUserFilters(section)
}
function toggleActivity(siteId, activity) {
	const section = document.querySelector('[data-site="' + siteId + '"]')
	if (!section) return
	const button = section.querySelector('[data-activity-filter="' + activity + '"]')
	if (!button) return
	button.setAttribute('aria-pressed', button.getAttribute('aria-pressed') === 'true' ? 'false' : 'true')
	applyUserFilters(section)
}
function applyUserFilters(section) {
	const countries = Array.from(section.querySelectorAll('[data-country-filter][aria-pressed="true"]'))
		.map((button) => button.dataset.countryFilter)
		.filter((country) => country && country !== 'all')
	const activeCountries = new Set(countries)
	const allCountries = activeCountries.size === 0
	const activities = new Set(Array.from(section.querySelectorAll('[data-activity-filter][aria-pressed="true"]')).map((button) => button.dataset.activityFilter))
	const rows = section.querySelectorAll('tbody tr[data-country]')
	for (const row of rows) {
		const rowCountries = (row.dataset.country || '').split(',')
		const countryMatch = allCountries || rowCountries.some((country) => activeCountries.has(country))
		const activityMatch = activities.size === 0 || activities.has(row.dataset.activity)
		row.hidden = !countryMatch || !activityMatch
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
function switchSiteTab(siteId, tab) {
	const section = document.querySelector('[data-site="' + siteId + '"]')
	if (!section) return
	for (const button of section.querySelectorAll('[data-tab-button]')) {
		button.setAttribute('aria-selected', button.dataset.tabButton === tab ? 'true' : 'false')
	}
	for (const panel of section.querySelectorAll('[data-tab-panel]')) {
		panel.hidden = panel.dataset.tabPanel !== tab
	}
}
</script>
</head>
<body>
<header>
<div class="brandbar">
<div class="brand"><span class="logo">BV</span><div><h1>BioVault Analytics</h1><div class="muted">Per-user Rybbit report</div></div></div>
<div class="muted">Generated ${escapeHtml(dateTime(report.generatedAt))}. Window: previous ${formatNumber(report.minutes)} minutes. Raw event cap per site: ${formatNumber(report.eventLimit)}.</div>
</div>
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
<div class="metric"><span>Unique users visited</span><strong>${formatNumber(site.summary.uniqueVisitors)}</strong></div>
<div class="metric"><span>Active product users</span><strong>${formatNumber(site.activeProductUsers)}</strong></div>
<div class="metric"><span>Users ran demo files</span><strong>${formatNumber(site.summary.usersRanAnyDemo)}</strong></div>
<div class="metric"><span>Users ran non-demo files</span><strong>${formatNumber(site.summary.usersRanNonDemo)}</strong></div>
<div class="metric"><span>Avg panels per panel user</span><strong>${formatDecimal(site.summary.averagePanelsPerUserWhoRanAny)}</strong></div>
<div class="metric"><span>Avg real-file panels per real uploader</span><strong>${formatDecimal(site.summary.averagePanelsPerRealUploadUser)}</strong></div>
</div>
<div class="sub">Users in fetched events: ${formatNumber(site.totalUsers)}. Completed panels: ${formatNumber(site.summary.completedPanels)} total, ${formatNumber(site.summary.completedRealPanels)} on non-demo inputs.</div>
${site.eventsFetched >= site.eventLimit ? `<p class="muted">This site reached the raw-event cap of ${formatNumber(site.eventLimit)}. Increase <code>--event-limit</code> for a complete older-history user rollup.</p>` : ''}
<<<<<<< HEAD
<h3>Non-Demo File Types Used</h3>
${nonDemoFileCounts(site.summary.nonDemoFileCounts)}
<h3>User Rows</h3>
${countryFilterControls(site)}
${activityFilterControls(site)}
${userTable(site.userRows)}
<h3>Daily Product Rollup</h3>
${dailyTable(site.dailyRows)}
=======
${dailyChart(site.dailyRows)}
${siteTabs(site)}
>>>>>>> origin/main
</section>`
}

function siteTabs(site) {
	const tabs = [
		['overview', 'Overview'],
		['users', 'Users'],
		['daily', 'Daily'],
		['breakdowns', 'Breakdowns'],
	]
	return `<div class="tabbar" role="tablist" aria-label="${escapeHtml(site.config.label)} report tabs">${tabs
		.map(([id, label], index) => `<button class="tab-button" type="button" role="tab" data-tab-button="${id}" aria-selected="${index === 0 ? 'true' : 'false'}" onclick="switchSiteTab('${escapeHtml(site.config.siteId)}', '${id}')">${escapeHtml(label)}</button>`)
		.join('')}</div>
<div class="tab-panel" data-tab-panel="overview">${productQuestions(site)}</div>
<div class="tab-panel" data-tab-panel="users" hidden><h3>User Rows</h3>${countryFilterControls(site)}${userTable(site.userRows)}</div>
<div class="tab-panel" data-tab-panel="daily" hidden><h3>Daily Product Rollup</h3>${dailyTable(site.dailyRows)}</div>
<div class="tab-panel" data-tab-panel="breakdowns" hidden>${breakdownTables(site)}</div>`
}

function productQuestions(site) {
	const summary = summarizeSiteUsers(site.userRows)
	const rows = [
		['How many unique visitors?', formatNumber(site.totalUsers), 'Distinct stable users in fetched pageview/product events.'],
		['How many come back?', formatNumber(summary.returningUsers), 'Users with more than one session in fetched raw events.'],
		['How many do demo examples?', formatNumber(summary.demoInputUsers), 'Users who loaded at least one demo input.'],
		['How many run demo examples?', formatNumber(summary.demoRunUsers), 'Users with a demo run/report journey.'],
		['How many run their own files?', formatNumber(summary.realRunUsers), 'Users with a real-file run/report journey.'],
	]
	return `<h3>Product Questions</h3><table><thead><tr><th>Question</th><th>Answer</th><th>Signal</th></tr></thead><tbody>${rows
		.map((row) => `<tr><td>${escapeHtml(row[0])}</td><td>${escapeHtml(row[1])}</td><td>${escapeHtml(row[2])}</td></tr>`)
		.join('')}</tbody></table>
${assayInputPairTable(summary.assayInputPairs)}
<div class="grid" style="margin-top:12px">
<div>${hierarchicalTable('Real File Metadata', summary.realFileMetadataGroups, summary.realFileMetadataDetails)}</div>
<div>${smallTable('File Kind Users', sideBySideRows(summary.demoFileKindUsers, summary.realFileKindUsers, 'demo users', 'real users').slice(0, 20), ['value', 'demo users', 'real users'])}</div>
<div>${smallTable('Traffic Sources By Run User Type', sideBySideRows(summary.demoTrafficSources, summary.realTrafficSources, 'demo run users', 'real run users').slice(0, 20), ['value', 'demo run users', 'real run users'])}</div>
<div>${smallTable('Country Run Users By Type', summary.countryRows.slice(0, 20), ['country', 'all users', 'demo run users', 'real run users'])}</div>
<div>${smallTable('Popular Assays By User Type', sideBySideRows(summary.demoReports, summary.realReports, 'demo', 'real').slice(0, 20), ['value', 'demo', 'real'])}</div>
</div>`
}

function breakdownTables(site) {
	const summary = summarizeSiteUsers(site.userRows)
	return `<h3>Breakdowns</h3>
<div class="grid">
<div>${smallTable('Assays', mapRows(summary.assays).slice(0, 20), ['value', 'count'])}</div>
<div>${smallTable('Real Reports', mapRows(summary.realReports).slice(0, 20), ['value', 'count'])}</div>
<div>${smallTable('Demo Reports', mapRows(summary.demoReports).slice(0, 20), ['value', 'count'])}</div>
<div>${smallTable('Real File Extras', mapRows(summary.realFileExtras).slice(0, 20), ['value', 'count'])}</div>
<div>${hierarchicalTable('Real Source Groups', summary.realSourceGroups, summary.realSourceDetails)}</div>
<div>${smallTable('Demo Files', mapRows(summary.demoFiles).slice(0, 20), ['value', 'count'])}</div>
</div>`
}

function countryFilterControls(site) {
	const filters = ['all', ...site.countryFilters]
	return `<div class="filters" aria-label="${escapeHtml(site.config.label)} country filters">${filters
		.map((country, index) => `<button class="filter-button" type="button" data-country-filter="${escapeHtml(country)}" aria-pressed="${index === 0 ? 'true' : 'false'}" onclick="toggleCountry('${escapeHtml(site.config.siteId)}', '${escapeHtml(country)}')">${escapeHtml(country === 'all' ? 'All countries' : country)}</button>`)
		.join('')}</div>`
}

function activityFilterControls(site) {
	const filters = [
		['never-ran', 'Never ran anything'],
		['only-demo', 'Only ran demo'],
		['ran-real', 'Ran on real files'],
	]
	return `<div class="filters" aria-label="${escapeHtml(site.config.label)} activity filters">${filters
		.map(([activity, label]) => `<button class="filter-button" type="button" data-activity-filter="${escapeHtml(activity)}" aria-pressed="true" onclick="toggleActivity('${escapeHtml(site.config.siteId)}', '${escapeHtml(activity)}')">${escapeHtml(label)}</button>`)
		.join('')}</div>`
}

function nonDemoFileCounts(counts) {
	const labels = mapLabels(counts)
	if (!labels.length) return '<p class="muted">No non-demo file types were observed in fetched events.</p>'
	return `<div>${pills(labels)}</div><p class="muted">Historical events do not include private filenames for user uploads, so these counts are normalized file/input types inferred from heuristics and file-add events.</p>`
}

function userTable(users) {
	if (!users.length) return '<p class="muted">No product activity events in fetched raw events.</p>'
	return `<table><thead><tr><th><button type="button" aria-sort="none" onclick="sortUserTable(this, 'user', 'text')">User</button></th><th><button type="button" aria-sort="none" onclick="sortUserTable(this, 'countryText', 'text')">Country</button></th><th>Environment</th><th>Seen</th><th><button type="button" aria-sort="descending" onclick="sortUserTable(this, 'lastSeen', 'time')">Last seen</button></th><th><button type="button" aria-sort="none" onclick="sortUserTable(this, 'sessions', 'number')">Sessions</button></th><th><button type="button" aria-sort="none" onclick="sortUserTable(this, 'demoFiles', 'number')">Demo files</button></th><th><button type="button" aria-sort="none" onclick="sortUserTable(this, 'demoReports', 'number')">Demo reports</button></th><th><button type="button" aria-sort="none" onclick="sortUserTable(this, 'realFiles', 'number')">Real files</button></th><th><button type="button" aria-sort="none" onclick="sortUserTable(this, 'realReports', 'number')">Real reports</button></th><th><button type="button" aria-sort="none" onclick="sortUserTable(this, 'runs', 'number')">Runs</button></th><th><button type="button" aria-sort="none" onclick="sortUserTable(this, 'reportOpens', 'number')">Reports opened</button></th><th>Recent report journeys</th></tr></thead><tbody>${users.map(userRow).join('')}</tbody></table>`
}

function dailyTable(rows) {
	if (!rows.length) return '<p class="muted">No daily product activity.</p>'
	return `<table><thead><tr><th>Date</th><th>Users</th><th>Return users</th><th>Demo users</th><th>Real users</th><th>Sessions</th><th>Demo files</th><th>Real files</th><th>Runs</th><th>Completed</th><th>Failed</th><th>Demo reports</th><th>Real reports</th><th>Report opens</th></tr></thead><tbody>${rows
		.map((row) => `<tr><td>${escapeHtml(row.date)}</td><td>${formatNumber(row.users)}</td><td>${formatNumber(row.returnUsers)}</td><td>${formatNumber(row.demoUsers)}</td><td>${formatNumber(row.realUsers)}</td><td>${formatNumber(row.sessions)}</td><td>${formatNumber(row.demoFiles)}</td><td>${formatNumber(row.realFiles)}</td><td>${formatNumber(row.runsStarted)}</td><td>${formatNumber(row.runsCompleted)}</td><td>${formatNumber(row.runsFailed)}</td><td>${formatNumber(row.demoReports)}</td><td>${formatNumber(row.realReports)}</td><td>${formatNumber(row.reportOpens)}</td></tr>`)
		.join('')}</tbody></table>`
}

function dailyChart(rows) {
	const visibleRows = rows.filter((row) => row.date !== 'unknown')
	if (!visibleRows.length) return ''
	const series = [
		['users', 'Unique users', '#2f7d57'],
		['returnUsers', 'Return users', '#5b6bb2'],
		['demoUsers', 'Demo users', '#b06b2c'],
		['realUsers', 'Real users', '#b23f55'],
	]
	const width = 900
	const height = 220
	const pad = { bottom: 38, left: 36, right: 16, top: 18 }
	const maxValue = Math.max(1, ...visibleRows.flatMap((row) => series.map(([key]) => Number(row[key]) || 0)))
	const x = (index) => visibleRows.length === 1 ? pad.left : pad.left + (index * (width - pad.left - pad.right)) / (visibleRows.length - 1)
	const y = (value) => height - pad.bottom - ((Number(value) || 0) * (height - pad.top - pad.bottom)) / maxValue
	const gridLines = [0, Math.ceil(maxValue / 2), maxValue]
	return `<section class="chart"><h3>Daily User Mix</h3><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Daily unique users, return users, demo users, and real users">
${gridLines.map((value) => `<line x1="${pad.left}" y1="${y(value).toFixed(1)}" x2="${width - pad.right}" y2="${y(value).toFixed(1)}" stroke="#d9ded7"/><text x="4" y="${(y(value) + 4).toFixed(1)}" fill="#66706a" font-size="11">${formatNumber(value)}</text>`).join('')}
${visibleRows.map((row, index) => index % Math.ceil(visibleRows.length / 8 || 1) === 0 ? `<text x="${x(index).toFixed(1)}" y="${height - 12}" fill="#66706a" font-size="10" text-anchor="middle">${escapeHtml(shortDateLabel(row.date))}</text>` : '').join('')}
${series.map(([key, label, color]) => `<polyline fill="none" stroke="${color}" stroke-width="2.5" points="${visibleRows.map((row, index) => `${x(index).toFixed(1)},${y(row[key]).toFixed(1)}`).join(' ')}"><title>${escapeHtml(label)}</title></polyline>`).join('')}
</svg><div class="legend">${series.map(([, label, color]) => `<span class="legend-item"><span class="swatch" style="background:${color}"></span>${escapeHtml(label)}</span>`).join('')}</div></section>`
}

function smallTable(title, rows, keys) {
	const body = rows.length
		? rows.map((row) => `<tr>${keys.map((key) => `<td>${escapeHtml(String(row[key] ?? ''))}</td>`).join('')}</tr>`).join('')
		: `<tr><td colspan="${keys.length}" class="muted">No data</td></tr>`
	return `<section><h3>${escapeHtml(title)}</h3><table><thead><tr>${keys.map((key) => `<th>${escapeHtml(key)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></section>`
}

function assayInputPairTable(pairs) {
	const rows = [...pairs.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, 30)
	if (!rows.length) return smallTable('Assay/Input Pairs', [], ['assay/input', 'count'])
	const body = rows.map(([value, count]) => {
		const parsed = parseAssayInputPair(value)
		return `<tr><td>${assayInputPairCell(parsed)}</td><td>${formatNumber(count)}</td></tr>`
	}).join('')
	return `<section style="margin-top:14px"><h3>Assay/Input Pairs</h3><table><thead><tr><th>pair</th><th>count</th></tr></thead><tbody>${body}</tbody></table></section>`
}

function parseAssayInputPair(value) {
	const parts = String(value).split(' | ').map((part) => part.trim()).filter(Boolean)
	const assay = normalizeAssayName(parts[0] || 'unknown') || 'unknown'
	const ownership = parts[1] === 'demo' || parts[1] === 'real' ? parts[1] : 'unknown'
	const input = parts.slice(2).join(' | ')
	return {
		assay,
		ownership,
		type: typeFromLabel(input) || 'unknown',
		input,
	}
}

function assayInputPairCell(pair) {
	const ownershipClass = pair.ownership === 'real' ? 'badge-real' : pair.ownership === 'demo' ? 'badge-demo' : ''
	return `<div class="badges">${badge(pair.assay, 'badge-assay')}${badge(pair.ownership, ownershipClass)}${badge(pair.type, 'badge-kind')}</div><div class="pair-detail">${escapeHtml(pair.input || 'unknown input')}</div>`
}

function badge(label, className = '') {
	return `<span class="badge ${className}">${escapeHtml(label || 'unknown')}</span>`
}

function hierarchicalTable(title, groups, details) {
	const rows = [...groups.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
	if (!rows.length) return smallTable(title, [], ['value', 'count'])
	const body = rows.map(([group, count]) => {
		const detailRows = mapRows(details.get(group) ?? new Map())
		const detail = detailRows.length
			? `<details><summary>${escapeHtml(group)}</summary>${smallTable('Versions', detailRows, ['value', 'count'])}</details>`
			: escapeHtml(group)
		return `<tr><td>${detail}</td><td>${formatNumber(count)}</td></tr>`
	}).join('')
	return `<section><h3>${escapeHtml(title)}</h3><table><thead><tr><th>value</th><th>count</th></tr></thead><tbody>${body}</tbody></table></section>`
}

function summarizeSiteUsers(users) {
	const summary = {
		assayInputPairs: new Map(),
		assays: new Map(),
		demoFiles: new Map(),
		demoFileKinds: new Map(),
		demoFileKindUsers: new Map(),
		demoInputUsers: 0,
		demoTrafficSources: new Map(),
		demoReports: new Map(),
		demoRunUsers: 0,
		realFileKinds: new Map(),
		realFileKindUsers: new Map(),
		realFileExtras: new Map(),
		realFileMetadata: new Map(),
		realFileMetadataDetails: new Map(),
		realFileMetadataGroups: new Map(),
		realSourceDetails: new Map(),
		realSourceGroups: new Map(),
		realReports: new Map(),
		realTrafficSources: new Map(),
		realRunUsers: 0,
		returningUsers: 0,
	}
	const countries = new Map()
	for (const user of users) {
		const isReturning = user.sessions.size > 1
		const isDemoUser = user.didDemo || user.demoFileAdds + user.demoLoads > 0
		const isRealUser = user.didReal || user.realFileAdds > 0
		const hasDemoRun = totalCount(user.demoReports) > 0 || user.runs.some((run) => String(run.input).startsWith('demo'))
		const hasRealRun = totalCount(user.realReports) > 0 || user.runs.some((run) => String(run.input).startsWith('real'))
		if (isReturning) summary.returningUsers += 1
		if (isDemoUser) summary.demoInputUsers += 1
		if (hasDemoRun) summary.demoRunUsers += 1
		if (hasRealRun) summary.realRunUsers += 1
		const trafficSource = normalizeTrafficSource(user.firstTrafficSource)
		if (hasDemoRun) increment(summary.demoTrafficSources, trafficSource)
		if (hasRealRun) increment(summary.realTrafficSources, trafficSource)
		for (const country of [...user.countries].filter(Boolean).length ? user.countries : ['unknown']) {
			const row = getCountrySummary(countries, country)
			row.all.add(user.id)
			if (hasDemoRun) row.demo.add(user.id)
			if (hasRealRun) row.real.add(user.id)
		}
		mergeCounts(summary.assays, user.assays)
		mergeCounts(summary.demoFiles, user.demoFiles)
		mergeCounts(summary.demoFileKinds, user.demoInputTypes)
		mergeCounts(summary.demoReports, user.demoReports)
		mergeCounts(summary.realFileKinds, user.realInputTypes)
		mergeCounts(summary.realReports, user.realReports)
		mergeCounts(summary.realFileExtras, user.realInputExtras)
		mergeCounts(summary.realFileMetadata, user.realInputLabels)
		mergeUniqueFileKinds(summary.demoFileKindUsers, user.demoFileIdentities)
		mergeUniqueFileKinds(summary.realFileKindUsers, user.realFileIdentities)
		for (const [label, count] of user.realInputLabels.entries()) {
			const group = inputMetadataGroupLabel(label)
			increment(summary.realFileMetadataGroups, group, count)
			incrementNested(summary.realFileMetadataDetails, group, label, count)
		}
		mergeCounts(summary.realSourceGroups, user.realInputSourceGroups)
		mergeNestedCounts(summary.realSourceDetails, user.realInputSourceDetails)
		for (const run of user.runs) {
			increment(summary.assayInputPairs, `${run.assay || 'unknown assay'} | ${run.input || 'unknown input'}`)
		}
		for (const report of user.reports) {
			increment(summary.assayInputPairs, `${report.assay || 'unknown assay'} | ${report.input || 'unknown input'}`)
		}
	}
	summary.countryRows = [...countries.entries()]
		.map(([country, row]) => ({
			country,
			'all users': formatNumber(row.all.size),
			'demo run users': formatNumber(row.demo.size),
			'real run users': formatNumber(row.real.size),
			sort: row.all.size,
		}))
		.sort((a, b) => b.sort - a.sort || a.country.localeCompare(b.country))
	return summary
}

function userRow(user) {
	const countries = [...user.countries].filter(Boolean).sort()
	const rowCountries = countries.length ? countries : ['unknown']
	const demoReports = totalCount(user.demoReports)
	const realReports = totalCount(user.realReports)
	return `<tr data-activity="${escapeHtml(userActivity(user))}" data-country="${escapeHtml(rowCountries.join(','))}" data-country-text="${escapeHtml(rowCountries.join(' '))}" data-demo-files="${user.demoFileAdds + user.demoLoads}" data-demo-reports="${demoReports}" data-last-seen="${user.lastSeenMs}" data-real-files="${user.realFileAdds}" data-real-reports="${realReports}" data-report-opens="${user.reportOpens}" data-runs="${user.runsStarted}" data-sessions="${user.sessions.size}" data-user="${escapeHtml(userLabel(user))}">
<td class="nowrap">${escapeHtml(userLabel(user))}<div class="sub">${formatNumber(user.events)} events, ${formatNumber(user.pageviews)} views${userAliases(user)}</div></td>
<td>${pills(rowCountries)}</td>
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

function userActivity(user) {
	if (user.runsStarted === 0) return 'never-ran'
	return user.runs.some((run) => run.inputKind !== 'demo') ? 'ran-real' : 'only-demo'
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

function normalizeTrafficSource(value) {
	const raw = String(value ?? '').trim()
	if (!raw) return 'Direct / none'
	const lower = raw.toLowerCase()
	let host = lower
	try {
		host = new URL(raw).hostname.toLowerCase().replace(/^www\./, '')
	} catch {}
	if (!host || host === 'direct' || host === '(direct)' || host === 'none' || host === 'direct / none') return 'Direct / none'
	if (host.includes('facebook.com') || host === 'fb' || host === 'facebook') return 'Facebook'
	if (host.includes('instagram.com') || host === 'instagram') return 'Instagram'
	if (host.includes('twitter.com') || host.includes('x.com') || host === 'x' || host === 'twitter' || host === 't.co') return 'X'
	if (host.includes('linkedin.com') || host === 'linkedin') return 'LinkedIn'
	if (host.includes('google.') || host === 'google') return 'Google'
	if (host.includes('bing.') || host === 'bing') return 'Bing'
	if (host.includes('github.com') || host === 'github') return 'GitHub'
	if (host.includes('biovault.net') || host === 'biovault') return 'BioVault'
	if (host.includes('localhost') || host.includes('127.0.0.1')) return 'Local dev'
	return host
}

function inputSourceGroup(value) {
	const source = String(value ?? '').trim()
	if (!source) return 'Unknown'
	const lower = source.toLowerCase()
	if (lower.includes('23andme')) return '23andMe'
	if (lower.includes('ancestry')) return 'AncestryDNA'
	if (lower.includes('myheritage')) return 'MyHeritage'
	if (lower.includes('vcf')) return 'VCF'
	if (lower.includes('cram')) return 'CRAM'
	if (lower.includes('bam')) return 'BAM'
	return source
}

function inputMetadataGroupLabel(label) {
	const type = typeFromLabel(label) || 'unknown'
	const source = sourceFromLabel(label) || 'Unknown'
	return `type: ${type} source: ${inputSourceGroup(source)}`
}

function inputIdentityKey(props, normalized = normalizedInputFromProps(props)) {
	const hash = firstValue(props.input_hash_sha256, props.file_hash_sha256)
	if (hash) return `hash:${hash}`
	const inputId = firstValue(props.input_id)
	if (inputId) return `input:${inputId}`
	const demoId = firstValue(props.demo_bundle_id, props.bundleId, props.demo_title, props.demo_filename)
	if (demoId) return `demo:${demoId}`
	const sourceUrl = firstValue(props.sourceUrl, props.packageSourceUrl, props.url)
	if (sourceUrl) return `url:${sourceUrl}`
	const size = firstValue(props.input_total_file_size, props.input_primary_file_size, props.file_size, props.size)
	const extra = normalizedInputExtra(props)
	return `legacy:${normalized.type}:${normalized.source}:${extra}:${size || 'unknown-size'}`
}

function mergeUniqueFileKinds(target, identities) {
	const types = new Set([...identities.values()].filter(Boolean))
	for (const type of types) increment(target, type)
}

function getCountrySummary(countries, country) {
	const key = normalizeCountry(country)
	if (!countries.has(key)) {
		countries.set(key, {
			all: new Set(),
			demo: new Set(),
			real: new Set(),
		})
	}
	return countries.get(key)
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
		case 'bcf':
			return '.bcf'
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

function addTrafficSource(user, event) {
	if (user.firstTrafficSource) return
	user.firstTrafficSource = normalizeTrafficSource(firstValue(
		event.referrer,
		event.referrer_url,
		event.referrerUrl,
		event.referer,
		event.props?.utm_source,
		event.props?.referrer,
		event.props?.source,
	))
}

function markDemoActivity(user, day) {
	user.didDemo = true
	if (day) day.demoUsers.add(user.id)
}

function markRealActivity(user, day) {
	user.didReal = true
	if (day) day.realUsers.add(user.id)
}

function increment(map, value, amount = 1) {
	if (value === undefined || value === null || value === '') return
	map.set(String(value), (map.get(String(value)) ?? 0) + amount)
}

function incrementNested(map, group, value, amount = 1) {
	if (!group || !value) return
	if (!map.has(group)) map.set(group, new Map())
	increment(map.get(group), value, amount)
}

function mergeNestedCounts(target, source) {
	for (const [group, values] of source.entries()) {
		if (!target.has(group)) target.set(group, new Map())
		mergeCounts(target.get(group), values)
	}
}

function mapLabels(map) {
	return [...map.entries()]
		.sort((a, b) => b[1] - a[1])
		.map(([value, count]) => `${value} (${formatNumber(count)})`)
}

function mapRows(map) {
	return [...map.entries()]
		.filter(([value]) => value !== undefined && value !== null && value !== '')
		.map(([value, count]) => ({ value, count: formatNumber(count) }))
		.sort((a, b) => Number(String(b.count).replace(/,/g, '')) - Number(String(a.count).replace(/,/g, '')))
}

function firstMapLabel(map) {
	const [first] = mapRows(map)
	return first ? `${first.value} (${first.count})` : 'No data'
}

function mergeCounts(target, source) {
	for (const [value, count] of source.entries()) increment(target, value, count)
}

function sideBySideRows(left, right, leftKey, rightKey) {
	const values = new Set([...left.keys(), ...right.keys()])
	return [...values]
		.map((value) => ({
			value,
			[leftKey]: formatNumber(left.get(value) ?? 0),
			[rightKey]: formatNumber(right.get(value) ?? 0),
			sort: (left.get(value) ?? 0) + (right.get(value) ?? 0),
		}))
		.sort((a, b) => b.sort - a.sort || String(a.value).localeCompare(String(b.value)))
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

function shortDateLabel(value) {
	const parts = String(value).split('-')
	if (parts.length !== 3) return value
	return `${parts[2]}/${parts[1]}`
}

function formatNumber(value) {
	return new Intl.NumberFormat('en-US').format(Number(value) || 0)
}

function formatDecimal(value) {
	return new Intl.NumberFormat('en-US', {
		maximumFractionDigits: 1,
		minimumFractionDigits: 1,
	}).format(Number(value) || 0)
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
  --input-events events.json    Read raw events from a local JSON file instead of Rybbit
  --use-cache                   Re-render from reports/rybbit-user-cache when available
  --cache-dir reports/cache     Override cache directory
`)
}
