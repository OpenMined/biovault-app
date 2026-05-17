#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'

const root = path.resolve(import.meta.dirname, '..')
const file = path.join(root, 'tests/browser-compat-version-matrix.yaml')
const doc = parse(fs.readFileSync(file, 'utf8'))
const targets = Array.isArray(doc?.targets) ? doc.targets : []
const ids = new Set()
const errors = []

for (const target of targets) {
	if (!target || typeof target !== 'object') {
		errors.push('target entries must be objects')
		continue
	}
	for (const key of ['id', 'family', 'version_label', 'project', 'required']) {
		if (!target[key]) errors.push(`${target.id ?? '<unknown>'} missing ${key}`)
	}
	if (!target.executable_env && !target.fallback_executable && !target.endpoint_env && !target.docker_image) {
		errors.push(`${target.id} must define executable_env, fallback_executable, endpoint_env, or docker_image`)
	}
	if (ids.has(target.id)) errors.push(`duplicate target id: ${target.id}`)
	ids.add(target.id)
	if (!['chromium', 'firefox', 'safari'].includes(target.family)) errors.push(`${target.id} has unsupported family ${target.family}`)
	if (!['chromium', 'firefox', 'webkit'].includes(target.project)) errors.push(`${target.id} has unsupported project ${target.project}`)
	if (target.expected_status && !['pass', 'fail'].includes(target.expected_status)) {
		errors.push(`${target.id} has unsupported expected_status ${target.expected_status}`)
	}
	if (target.runner_version && typeof target.runner_version !== 'string') {
		errors.push(`${target.id} runner_version must be a string`)
	}
	if (target.runner_package && typeof target.runner_package !== 'string') {
		errors.push(`${target.id} runner_package must be a string`)
	}
	if (target.docker_image && typeof target.docker_image !== 'string') {
		errors.push(`${target.id} docker_image must be a string`)
	}
}

for (const id of ['chromium-system', 'chromium-cache-141', 'chromium-cache-127', 'chromium-cache-115', 'chromium-cache-105', 'chromium-cache-102', 'chromium-cache-98', 'chromium-cache-97', 'chromium-cache-96', 'chromium-cache-94', 'firefox-cache-127', 'firefox-docker-99', 'webkit-docker-15', 'webkit-docker-17', 'webkit-docker-26', 'chromium-provider-previous', 'firefox-provider-previous', 'safari-provider-previous']) {
	if (!ids.has(id)) errors.push(`missing version target: ${id}`)
}

if (errors.length) {
	for (const error of errors) console.error(error)
	process.exit(1)
}

console.log(`Browser compatibility version matrix OK (${targets.length} targets)`)
