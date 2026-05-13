#!/usr/bin/env node
import fs from 'node:fs'

const EXCLUDE_FILE = '.trufflehog-exclude'
const allowedBroadPrefixes = [
	'.git/',
	'.maestro/generated/',
	'.maestro/logs/',
	'.maestro/screenshots/',
	'android/app/build/',
	'bioscript/.*/.venv/',
	'bioscript/.*/target/',
	'coverage/',
	'dist/',
	'dist-cloudflare/',
	'exvitae/bioscript/.*/.venv/',
	'exvitae/bioscript/.*/target/',
	'ios/build/',
	'node_modules/',
	'screenshots/',
	'test-data/',
	'test-results/',
	'tmp/',
	'web-build/',
]
const broadSourcePrefixes = [
	'app/',
	'assets/',
	'components/',
	'constants/',
	'desktop/',
	'exvitae/assays/',
	'lib/',
	'modules/',
	'packages/',
	'scripts/',
	'tests/',
]

function normalizePattern(pattern) {
	return pattern
		.replace(/^\^\/repo\//, '')
		.replace(/^\^/, '')
		.replace(/\\\./g, '.')
		.replace(/\$$/, '')
}

const contents = fs.readFileSync(EXCLUDE_FILE, 'utf8')
const failures = []
const secretScript = fs.existsSync('scripts/secrets-scan.sh') ? fs.readFileSync('scripts/secrets-scan.sh', 'utf8') : ''
const ciWorkflow = fs.existsSync('.github/workflows/ci.yml') ? fs.readFileSync('.github/workflows/ci.yml', 'utf8') : ''

if (!secretScript.includes('--exclude-paths=.trufflehog-exclude') || !secretScript.includes('--exclude-paths=/repo/.trufflehog-exclude')) {
	failures.push('scripts/secrets-scan.sh must use .trufflehog-exclude for both local and Docker TruffleHog scans.')
}
if (!ciWorkflow.includes('extra_args: --exclude-paths=.trufflehog-exclude --results=verified,unknown')) {
	failures.push('.github/workflows/ci.yml must run TruffleHog with the same .trufflehog-exclude file.')
}

for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
	const line = rawLine.trim()
	if (!line || line.startsWith('#')) continue
	if (!line.startsWith('^')) {
		failures.push(`${EXCLUDE_FILE}:${index + 1} must be anchored with ^: ${line}`)
		continue
	}
	const normalized = normalizePattern(line)
	const isAllowedBroad = allowedBroadPrefixes.some((prefix) => normalized === prefix || normalized === `/repo/${prefix}`)
	const isBroadSource = broadSourcePrefixes.some((prefix) => normalized.startsWith(prefix) || normalized.startsWith(`/repo/${prefix}`))
	if (isBroadSource && !isAllowedBroad) {
		failures.push(`${EXCLUDE_FILE}:${index + 1} excludes source or fixture content too broadly: ${line}`)
	}
	if ((normalized === '.*' || normalized === '/repo/.*') && !isAllowedBroad) {
		failures.push(`${EXCLUDE_FILE}:${index + 1} excludes the whole repository: ${line}`)
	}
}

if (failures.length) {
	console.error(failures.join('\n'))
	process.exit(1)
}

console.log(`${EXCLUDE_FILE} uses anchored generated/cache excludes only.`)
