#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_ENDPOINT = 'https://metrics.syftbox.net/api'
const DEFAULT_DEV_SITE_ID = '4'
const DEFAULT_PROD_SITE_ID = '6'
const DEFAULT_DEV_DOMAIN = 'dev-app.biovault.net'
const DEFAULT_PROD_DOMAIN = 'app.biovault.net'

loadDotEnv(path.resolve(process.cwd(), '.env'))

const args = process.argv.slice(2)
const command = args.shift() ?? 'help'
const options = parseArgs(args)

if (command === 'help' || options.help) {
	printHelp()
	process.exit(0)
}

try {
	const config = getConfig(options)
	const result = await run(command, options, config)
	if (result !== undefined) {
		printJson(result)
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error))
	process.exit(1)
}

async function run(command, options, config) {
	switch (command) {
		case 'config':
			return {
				endpoint: config.endpoint,
				siteId: config.siteId,
				domain: config.domain,
				variant: config.variant,
				hasApiKey: Boolean(config.apiKey),
			}
		case 'overview':
			return rybbitGet(config, `/sites/${config.siteId}/overview`, timeParams(options))
		case 'bucketed':
			return rybbitGet(config, `/sites/${config.siteId}/overview-bucketed`, {
				...timeParams(options),
				bucket: options.bucket ?? 'day',
			})
		case 'live':
			return rybbitGet(config, `/sites/${config.siteId}/live-user-count`)
		case 'metric':
			requireOption(options, 'parameter', 'metric requires --parameter, for example --parameter country')
			return rybbitGet(config, `/sites/${config.siteId}/metric`, {
				...timeParams(options),
				parameter: options.parameter,
				limit: options.limit ?? '20',
				page: options.page,
			})
		case 'events':
			return rybbitGet(config, `/sites/${config.siteId}/events`, {
				...timeParams(options),
				page_size: options.pageSize ?? options.limit ?? '20',
				since_timestamp: options.since,
				before_timestamp: options.before,
			})
		case 'event-names':
			return rybbitGet(config, `/sites/${config.siteId}/events/names`, timeParams(options))
		case 'event-properties':
			requireOption(options, 'eventName', 'event-properties requires --event-name')
			return rybbitGet(config, `/sites/${config.siteId}/events/properties`, {
				...timeParams(options),
				event_name: options.eventName,
			})
		case 'sessions':
			return rybbitGet(config, `/sites/${config.siteId}/sessions`, {
				...timeParams(options),
				limit: options.limit ?? '20',
				page: options.page,
			})
		case 'session':
			requireOption(options, 'id', 'session requires --id')
			return rybbitGet(config, `/sites/${config.siteId}/sessions/${encodeURIComponent(options.id)}`, {
				limit: options.limit ?? '50',
				offset: options.offset,
				minutes: options.minutes,
			})
		case 'locations':
			return rybbitGet(config, `/sites/${config.siteId}/session-locations`, timeParams(options))
		case 'track-pageview':
			return rybbitTrack(config, {
				type: 'pageview',
				pathname: options.path ?? '/',
				hostname: options.hostname ?? config.domain,
				page_title: options.title,
			})
		case 'track-event':
			requireOption(options, 'name', 'track-event requires --name')
			return rybbitTrack(config, {
				type: 'custom_event',
				pathname: options.path ?? '/',
				hostname: options.hostname ?? config.domain,
				event_name: options.name,
				properties: normalizeProperties(options.props),
			})
		case 'get':
			requireOption(options, '_', 'get requires a path, for example: get /sites/4/overview --minutes 60')
			return rybbitGet(config, options._[0], { ...timeParams(options), ...parseQueryOptions(options.query) })
		default:
			throw new Error(`Unknown command "${command}". Run: npm run rybbit -- help`)
	}
}

async function rybbitGet(config, endpointPath, params = {}) {
	requireApiKey(config)
	const url = buildUrl(config.endpoint, endpointPath, params)
	const response = await fetch(url, {
		headers: {
			Authorization: `Bearer ${config.apiKey}`,
			Accept: 'application/json',
		},
	})
	return readResponse(response)
}

async function rybbitTrack(config, event) {
	requireApiKey(config)
	const payload = {
		site_id: config.siteId,
		language: 'en-US',
		screenWidth: 1440,
		screenHeight: 900,
		user_agent: 'BioVault Rybbit CLI/1.0',
		...removeUndefined(event),
	}
	const response = await fetch(buildUrl(config.endpoint, '/track'), {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${config.apiKey}`,
			'Content-Type': 'application/json',
			Origin: `https://${config.domain}`,
			Referer: `https://${config.domain}/`,
			Accept: 'application/json',
		},
		body: JSON.stringify(payload),
	})
	return readResponse(response)
}

async function readResponse(response) {
	const text = await response.text()
	let body = text
	try {
		body = text ? JSON.parse(text) : null
	} catch {}

	if (!response.ok) {
		throw new Error(`Rybbit API ${response.status} ${response.statusText}: ${formatBody(body)}`)
	}

	return body
}

function getConfig(options) {
	const variant = options.variant ?? process.env.EXPO_PUBLIC_APP_VARIANT ?? 'development'
	const isProduction = variant === 'production'
	const siteId = resolveSiteId(options.site, variant)
	const domain =
		options.domain ??
		process.env.RYBBIT_DOMAIN ??
		process.env.BIOVAULT_METRICS_DOMAIN ??
		process.env.EXPO_PUBLIC_BIOVAULT_METRICS_DOMAIN ??
		(isProduction ? DEFAULT_PROD_DOMAIN : DEFAULT_DEV_DOMAIN)
	const endpoint =
		options.endpoint ??
		process.env.RYBBIT_API_BASE_URL ??
		process.env.BIOVAULT_METRICS_ENDPOINT ??
		process.env.EXPO_PUBLIC_BIOVAULT_METRICS_ENDPOINT ??
		DEFAULT_ENDPOINT

	return {
		apiKey: process.env.RYBBIT_API_KEY,
		domain,
		endpoint: stripTrailingSlash(endpoint),
		siteId,
		variant,
	}
}

function resolveSiteId(site, variant) {
	if (site && site !== 'dev' && site !== 'prod') {
		return site
	}
	if (site === 'prod' || variant === 'production') {
		return (
			process.env.RYBBIT_PROD_SITE_ID ??
			process.env.BIOVAULT_PROD_METRICS_SITE_ID ??
			DEFAULT_PROD_SITE_ID
		)
	}
	return (
		process.env.RYBBIT_SITE_ID ??
		process.env.BIOVAULT_METRICS_SITE_ID ??
		process.env.EXPO_PUBLIC_BIOVAULT_METRICS_SITE_ID ??
		DEFAULT_DEV_SITE_ID
	)
}

function timeParams(options) {
	if (options.startDate || options.endDate || options.timeZone) {
		return {
			start_date: required(options.startDate, '--start-date is required when using date range'),
			end_date: required(options.endDate, '--end-date is required when using date range'),
			time_zone: required(options.timeZone, '--time-zone is required when using date range'),
		}
	}
	return {
		past_minutes_start: options.minutes ?? '1440',
		past_minutes_end: options.minutesEnd ?? '0',
	}
}

function buildUrl(base, endpointPath, params = {}) {
	const basePath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`
	const url = new URL(`${stripTrailingSlash(base)}${basePath}`)
	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined && value !== '') {
			url.searchParams.set(key, String(value))
		}
	}
	return url
}

function parseArgs(rawArgs) {
	const parsed = { _: [] }
	for (let index = 0; index < rawArgs.length; index += 1) {
		const arg = rawArgs[index]
		if (!arg.startsWith('--')) {
			parsed._.push(arg)
			continue
		}
		const [rawKey, inlineValue] = arg.slice(2).split('=', 2)
		const key = camelCase(rawKey)
		const next = rawArgs[index + 1]
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

function parseQueryOptions(query) {
	if (!query) {
		return {}
	}
	const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query)
	return Object.fromEntries(params.entries())
}

function normalizeProperties(props) {
	if (!props) {
		return undefined
	}
	JSON.parse(props)
	return props
}

function loadDotEnv(envPath) {
	if (!fs.existsSync(envPath)) {
		return
	}
	const contents = fs.readFileSync(envPath, 'utf8')
	for (const line of contents.split(/\r?\n/)) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith('#')) {
			continue
		}
		const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
		if (!match) {
			continue
		}
		const [, key, rawValue] = match
		if (process.env[key] !== undefined) {
			continue
		}
		process.env[key] = unquote(rawValue.trim())
	}
}

function unquote(value) {
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1)
	}
	return value
}

function requireApiKey(config) {
	if (!config.apiKey) {
		throw new Error('RYBBIT_API_KEY is not set in .env or the shell environment')
	}
}

function requireOption(options, key, message) {
	if (!options[key] && !(key === '_' && options._?.length)) {
		throw new Error(message)
	}
}

function required(value, message) {
	if (!value) {
		throw new Error(message)
	}
	return value
}

function removeUndefined(object) {
	return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined))
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

function printJson(value) {
	console.log(JSON.stringify(value, null, 2))
}

function printHelp() {
	console.log(`Usage: npm run rybbit -- <command> [options]

Config defaults come from .env and the BioVault app:
  endpoint: https://metrics.syftbox.net/api
  dev site: 4
  prod site: 6

Commands:
  config                         Show resolved config without printing the key
  overview                       Get top-level stats
  bucketed --bucket day          Get time-series stats
  live                           Get live user count
  metric --parameter country     Break down a dimension
  events                         List recent events
  event-names                    List custom event names
  event-properties --event-name NAME
  sessions                       List sessions
  session --id SESSION_ID        Get one session with events
  locations                      Get session location aggregates
  track-pageview --path /cli-test
  track-event --name cli_test --props '{"source":"codex"}'
  get /sites/4/overview          Call a raw stats path

Common options:
  --site dev|prod|ID             Defaults to dev site 4
  --variant production           Uses prod defaults
  --endpoint URL                 Defaults to metrics.syftbox.net /api
  --minutes 1440                 Relative lookback window
  --start-date YYYY-MM-DD --end-date YYYY-MM-DD --time-zone Australia/Brisbane
  --limit 20
`)
}
