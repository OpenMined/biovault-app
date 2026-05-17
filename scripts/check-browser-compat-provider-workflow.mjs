#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'

const root = path.resolve(import.meta.dirname, '..')
const repository = process.env.WEB_COMPAT_PROVIDER_REPOSITORY || process.env.GITHUB_REPOSITORY || 'OpenMined/biovault-app'
const workflow = process.env.WEB_COMPAT_PROVIDER_WORKFLOW || 'CI'
const ref = process.env.WEB_COMPAT_PROVIDER_REF || process.env.COMPAT_REF || process.env.GITHUB_REF_NAME || 'main'
const workflowFile = process.env.WEB_COMPAT_PROVIDER_WORKFLOW_FILE
const requiredInputs = [
	'deploy_ref',
	'compat_web_url',
	'compat_remote_targets',
	'compat_include_ios',
	'compat_allow_local_web_url',
	'compat_local_smoke',
	'compat_versions',
	'compat_version_targets',
	'compat_android_local',
	'compat_completion',
]
const requiredJobs = [
	'web-compat-remote',
	'web-compat-completion',
]

let sourceLabel
let workflowText
if (workflowFile) {
	const absolute = path.resolve(root, workflowFile)
	sourceLabel = path.relative(root, absolute)
	workflowText = fs.readFileSync(absolute, 'utf8')
} else {
	sourceLabel = `${repository} workflow ${workflow} at ref ${ref}`
	const gh = spawnSync('gh', ['workflow', 'view', workflow, '--repo', repository, '--ref', ref, '--yaml'], { encoding: 'utf8' })
	if (gh.status !== 0) {
		console.error(`Cannot read ${sourceLabel}.`)
		console.error('Push these workflow changes to the selected ref, merge them to main, or set WEB_COMPAT_PROVIDER_WORKFLOW_FILE=.github/workflows/ci.yml for a local file check.')
		if (gh.stderr.trim()) console.error(gh.stderr.trim())
		process.exit(1)
	}
	workflowText = gh.stdout
}

let parsed
try {
	parsed = parse(workflowText)
} catch (error) {
	console.error(`Cannot parse ${sourceLabel} as YAML.`)
	console.error(error instanceof Error ? error.message : String(error))
	process.exit(1)
}

const workflowDispatchInputs = parsed?.on?.workflow_dispatch?.inputs
const jobs = parsed?.jobs
const errors = []

if (!workflowDispatchInputs || typeof workflowDispatchInputs !== 'object' || Array.isArray(workflowDispatchInputs)) {
	errors.push(`${sourceLabel} is missing workflow_dispatch.inputs`)
} else {
	for (const input of requiredInputs) {
		if (!Object.hasOwn(workflowDispatchInputs, input)) errors.push(`${sourceLabel} is missing workflow_dispatch input ${input}`)
	}
}

if (!jobs || typeof jobs !== 'object' || Array.isArray(jobs)) {
	errors.push(`${sourceLabel} is missing jobs`)
} else {
	for (const job of requiredJobs) {
		if (!Object.hasOwn(jobs, job)) errors.push(`${sourceLabel} is missing job ${job}`)
	}
}

if (errors.length) {
	console.error('Browser compatibility provider workflow is not dispatchable:')
	for (const error of errors) console.error(`- ${error}`)
	process.exit(1)
}

console.log(`Browser compatibility provider workflow is dispatchable from ${sourceLabel}.`)
