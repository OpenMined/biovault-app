#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runnerPackage = process.env.PW_ISOLATED_RUNNER_PACKAGE ?? '@playwright/test'
const runnerVersion = process.env.PW_ISOLATED_RUNNER_VERSION
const browserProject = process.env.PW_BROWSER_PROJECTS ?? 'chromium'
const outputDir = path.resolve(root, process.env.WEB_COMPAT_OUTPUT_DIR ?? 'test-output/browser-compat')
const logDir = path.join(root, '.maestro-web/logs')
const fixture23andme = path.join(root, 'test-data/23andme/v5/hu50B3F5/genome_hu50B3F5_v5_Full.zip')
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'biovault-pw-compat-'))
let serverProcess = null

if (!runnerVersion) {
	console.error('PW_ISOLATED_RUNNER_VERSION is required.')
	process.exit(2)
}
if (!fs.existsSync(fixture23andme)) {
	console.error(`Missing required web test fixture: ${path.relative(root, fixture23andme)}`)
	process.exit(1)
}

try {
	const webUrl = process.env.WEB_URL ?? await startLocalWebServer()
	prepareIsolatedWorkspace()
	run('npm', ['install', '--prefix', tempRoot, '--no-audit', '--no-fund'], {
		cwd: root,
		env: process.env,
		stdio: 'inherit',
	})
	run('node', ['./scripts/check-monty-artifacts.mjs'], { cwd: root, env: process.env, stdio: 'inherit' })
	const playwrightBin = path.join(tempRoot, 'node_modules/.bin/playwright')
	const child = spawnSync(playwrightBin, [
		'test',
		'--config',
		path.join(tempRoot, '.maestro-web/playwright.config.js'),
		path.join(tempRoot, '.maestro-web/lab-wasm-compat.spec.ts'),
	], {
		cwd: tempRoot,
		env: {
			...process.env,
			WEB_URL: webUrl,
			WEB_COMPAT_OUTPUT_DIR: outputDir,
			PW_BROWSER_PROJECTS: browserProject,
		},
		stdio: 'inherit',
	})
	process.exit(child.status ?? 1)
} finally {
	if (serverProcess) serverProcess.kill()
	fs.rmSync(tempRoot, { recursive: true, force: true })
}

function prepareIsolatedWorkspace() {
	fs.mkdirSync(path.join(tempRoot, '.maestro-web'), { recursive: true })
	fs.writeFileSync(path.join(tempRoot, 'package.json'), JSON.stringify({
		private: true,
		dependencies: {
			[runnerPackage]: runnerVersion,
			yaml: '^2.8.3',
		},
	}, null, '\t') + '\n')
	for (const file of ['lab-wasm-compat.spec.ts', 'lab-report-matrix-helpers.ts']) {
		fs.copyFileSync(path.join(root, '.maestro-web', file), path.join(tempRoot, '.maestro-web', file))
	}
	fs.writeFileSync(path.join(tempRoot, '.maestro-web/playwright.config.js'), isolatedPlaywrightConfig())
	for (const dir of ['tests', 'test-data', 'exvitae']) {
		fs.symlinkSync(path.join(root, dir), path.join(tempRoot, dir), 'dir')
	}
}

function isolatedPlaywrightConfig() {
	return `const requestedProjects = (process.env.PW_BROWSER_PROJECTS || 'chromium')
\t.split(',')
\t.map((value) => value.trim())
\t.filter(Boolean)

const definitions = {
\tchromium: { name: 'chromium', use: { browserName: 'chromium' } },
\tfirefox: { name: 'firefox', use: { browserName: 'firefox' } },
\twebkit: { name: 'webkit', use: { browserName: 'webkit' } },
}

module.exports = {
\ttestDir: '.',
\ttimeout: 120000,
\tretries: 0,
\tworkers: Number(process.env.PW_WORKERS || 1),
\treporter: [['list']],
\tuse: {
\t\tignoreHTTPSErrors: process.env.PW_IGNORE_HTTPS_ERRORS === '1',
\t\tviewport: { width: 1280, height: 800 },
\t\tlaunchOptions: {
\t\t\tslowMo: Number(process.env.PW_SLOWMO || 400),
\t\t\texecutablePath: process.env.PW_EXECUTABLE_PATH || undefined,
\t\t},
\t},
\tprojects: requestedProjects.map((name) => {
\t\tconst project = definitions[name]
\t\tif (!project) throw new Error('Unknown PW_BROWSER_PROJECTS entry: ' + name)
\t\treturn project
\t}),
}
`
}

async function startLocalWebServer() {
	fs.mkdirSync(logDir, { recursive: true })
	const port = await findPort(Number(process.env.PORT ?? '8081'))
	const url = `http://localhost:${port}`
	if (await isServing(url)) return url
	const logPath = path.join(logDir, 'isolated-web-compat.log')
	const logFd = fs.openSync(logPath, 'w')
	serverProcess = spawn('npx', ['expo', 'start', '--web', '--localhost', '--port', String(port)], {
		cwd: root,
		env: { ...process.env, BROWSER: 'none', EXPO_PUBLIC_DISABLE_ANALYTICS: '1' },
		stdio: ['ignore', logFd, logFd],
	})
	for (let attempt = 0; attempt < 90; attempt += 1) {
		if (await isServing(url)) return url
		if (serverProcess.exitCode !== null) break
		await new Promise((resolve) => setTimeout(resolve, 1000))
	}
	throw new Error(`Expo web failed to start at ${url}; see ${path.relative(root, logPath)}.`)
}

async function findPort(start) {
	for (let port = start; port < start + 100; port += 1) {
		if (!(await portHasListener(port))) return port
	}
	throw new Error(`No free port found starting at ${start}.`)
}

function portHasListener(port) {
	return new Promise((resolve) => {
		const socket = net.connect(port, '127.0.0.1')
		socket.once('connect', () => {
			socket.destroy()
			resolve(true)
		})
		socket.once('error', () => resolve(false))
	})
}

async function isServing(url) {
	try {
		const response = await fetch(url, { redirect: 'follow' })
		return response.ok
	} catch {
		return false
	}
}

function run(command, args, options) {
	const child = spawnSync(command, args, options)
	if (child.status !== 0) process.exit(child.status ?? 1)
}
