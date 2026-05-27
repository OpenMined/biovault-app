#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const home = process.env.HOME ?? ''
const targets = [
	{
		id: 'chromium-cache-102',
		playwrightVersion: '1.22.0',
		browser: 'chromium',
		executable: '~/.cache/ms-playwright/chromium-1005/chrome-linux/chrome',
	},
	{
		id: 'chromium-cache-98',
		playwrightVersion: '1.17.0',
		browser: 'chromium',
		executable: '~/.cache/ms-playwright/chromium-939194/chrome-linux/chrome',
	},
	{
		id: 'chromium-cache-97',
		playwrightPackage: 'playwright-chromium',
		playwrightVersion: '1.16.0',
		browser: 'chromium',
		executable: '~/.cache/ms-playwright/chromium-930007/chrome-linux/chrome',
	},
	{
		id: 'chromium-cache-96',
		playwrightPackage: 'playwright-chromium',
		playwrightVersion: '1.15.0',
		browser: 'chromium',
		executable: '~/.cache/ms-playwright/chromium-920619/chrome-linux/chrome',
	},
	{
		id: 'chromium-cache-94',
		playwrightVersion: '1.14.0',
		browser: 'chromium',
		executable: '~/.cache/ms-playwright/chromium-907428/chrome-linux/chrome',
	},
	{
		id: 'firefox-cache-127',
		playwrightVersion: '1.45.0',
		browser: 'firefox',
		executable: '~/.cache/ms-playwright/firefox-1454/firefox/firefox',
	},
	{
		id: 'chromium-cache-127',
		playwrightVersion: '1.45.0',
		browser: 'chromium',
		executable: '~/.cache/ms-playwright/chromium-1124/chrome-linux/chrome',
	},
	{
		id: 'chromium-cache-115',
		playwrightVersion: '1.35.0',
		browser: 'chromium',
		executable: '~/.cache/ms-playwright/chromium-1067/chrome-linux/chrome',
	},
	{
		id: 'chromium-cache-105',
		playwrightVersion: '1.25.0',
		browser: 'chromium',
		executable: '~/.cache/ms-playwright/chromium-1019/chrome-linux/chrome',
	},
]

const selected = setFromCsv(process.env.WEB_COMPAT_HISTORY_INSTALL_TARGETS)
const selectedTargets = targets.filter((target) => !selected.size || selected.has(target.id))
let installed = 0

for (const target of selectedTargets) {
	const executable = expandHome(target.executable)
	if (executable && fs.existsSync(executable) && process.env.WEB_COMPAT_FORCE_HISTORY_INSTALL !== '1') {
		console.log(`${target.id}: ${executable} already exists`)
		continue
	}

	const packageName = target.playwrightPackage ?? 'playwright'
	console.log(`${target.id}: installing ${target.browser} via ${packageName}@${target.playwrightVersion}`)
	const child = spawnSync('npx', ['--yes', `${packageName}@${target.playwrightVersion}`, 'install', target.browser], {
		cwd: root,
		env: {
			...process.env,
			npm_config_cache: process.env.npm_config_cache ?? path.join(os.tmpdir(), 'biovault-browser-compat-npm-cache'),
			PLAYWRIGHT_SKIP_BROWSER_GC: '1',
		},
		stdio: 'inherit',
	})
	if (child.status !== 0) process.exit(child.status ?? 1)
	if (!fs.existsSync(executable)) {
		console.error(`${target.id}: expected executable was not created: ${executable}`)
		process.exit(1)
	}
	installed += 1
}

console.log(`Historical browser cache ready (${selectedTargets.length} target(s), ${installed} install(s)).`)

function setFromCsv(value) {
	return new Set(String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean))
}

function expandHome(value) {
	return value.replace(/^~(?=$|\/)/, home || '~')
}
