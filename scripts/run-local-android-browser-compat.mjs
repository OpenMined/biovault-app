#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { _android as android, expect } from '@playwright/test'
import { parse } from 'yaml'

const root = path.resolve(import.meta.dirname, '..')
const defaultSampleId = '23andme-v5-hu50B3F5'
const sampleId = process.env.WEB_COMPAT_SAMPLE_ID ?? defaultSampleId
const port = Number(process.env.PORT ?? '8081')
const resultTimeoutMs = Number(process.env.WEB_COMPAT_RESULT_TIMEOUT_MS ?? '600000')
const dryRun = process.env.WEB_COMPAT_ANDROID_DRY_RUN === '1'
const remoteMatrixFile = path.join(root, 'tests/browser-compat-remote-matrix.yaml')
const outputDir = path.resolve(root, process.env.WEB_COMPAT_OUTPUT_DIR ?? 'test-output/browser-compat')
const runsDir = path.join(outputDir, 'runs')
const resultsJson = path.join(outputDir, 'results.json')
const resultsMd = path.join(outputDir, 'results.md')
const logDir = path.join(root, '.maestro-web/logs')
const defaultSdkRoot = path.join(os.homedir(), 'Android/Sdk')
const sdkRoot = process.env.ANDROID_SDK_ROOT ?? process.env.ANDROID_HOME ?? (fs.existsSync(defaultSdkRoot) ? defaultSdkRoot : '')
const androidToolDirs = sdkRoot ? [
	path.join(sdkRoot, 'platform-tools'),
	path.join(sdkRoot, 'emulator'),
	path.join(sdkRoot, 'cmdline-tools/latest/bin'),
] : []
process.env.PATH = [...androidToolDirs, process.env.PATH].filter(Boolean).join(path.delimiter)
if (sdkRoot) {
	process.env.ANDROID_SDK_ROOT ??= sdkRoot
	process.env.ANDROID_HOME ??= sdkRoot
}

let serverProcess = null
let emulatorProcess = null
let startedEmulatorSerial = null

class PreflightError extends Error {}

try {
	const localBrowser = resolveLocalAndroidBrowser()
	if (dryRun) {
		console.log(JSON.stringify({ ...localBrowser, outputDir }, null, 2))
		process.exit(0)
	}

	if (!commandExists('adb')) {
		throw new PreflightError('adb is required for local Android browser compatibility runs.')
	}

	const { caseDef, requiredArtifacts } = loadCompatCase(sampleId)
	verifyLocalFiles(caseDef)
	await ensureAndroidDevice()

	const hostUrl = process.env.WEB_URL ?? await startLocalWebServer(port)
	const deviceUrl = process.env.WEB_COMPAT_ANDROID_URL ?? toAndroidDeviceUrl(hostUrl, port)
	if (process.env.WEB_COMPAT_ANDROID_ADB_REVERSE !== '0') {
		run('adb', ['reverse', `tcp:${new URL(hostUrl).port || port}`, `tcp:${new URL(hostUrl).port || port}`])
	}

	const devices = await android.devices()
	const serial = process.env.ANDROID_SERIAL
	const device = serial ? devices.find((item) => item.serial() === serial) : devices[0]
	if (!device) {
		throw new PreflightError(serial ? `No Android device found for ANDROID_SERIAL=${serial}.` : 'No Android device/emulator is attached.')
	}

	await prepareAndroidBrowserPackage(device, localBrowser)
	const deviceFacts = await getAndroidDeviceFacts(device, localBrowser)
	const context = await device.launchBrowser(localBrowser.pkg ? { pkg: localBrowser.pkg } : undefined)
	const page = await context.newPage()
	const errors = capturePageErrors(page)
	const started = Date.now()
	const result = baseResult(caseDef, deviceUrl, localBrowser, deviceFacts)
	if (!process.env.WEB_COMPAT_APPEND_RESULTS) {
		fs.rmSync(outputDir, { force: true, recursive: true })
	}

	try {
		await routePackageZipToLocalFile(page, caseDef)
		await seedAcceptedOnboarding(page)
		await page.goto(deviceUrl, { waitUntil: 'domcontentloaded' })
		result.capabilities = await runCapabilityProbe(page)
		result.browserVersion = parseBrowserVersion(result.capabilities.userAgent) ?? deviceFacts.selectedBrowserVersion ?? deviceFacts.chromeVersion ?? 'unknown'

		await prepareLabReportCase(page, caseDef, deviceUrl)
		await runPackageAndOpenResult(page, caseDef)
		result.reportRunStatus = 'passed'

		for (const artifact of requiredArtifacts) {
			await expect(page.getByRole('link', { name: artifact })).toBeVisible()
		}
		const reportFrame = page.frameLocator('iframe[title="index.html"]')
		for (const expected of caseDef.htmlContains) {
			await expect(reportFrame.getByText(expected, { exact: false }).first()).toBeVisible({ timeout: 30_000 })
		}
		const artifacts = await readArtifacts(page, requiredArtifacts)
		assertArtifactData(caseDef, artifacts)
		expect(artifacts.get('index.html') ?? '').toMatch(/<!doctype html/i)
		result.artifactNames = [...requiredArtifacts]
		result.artifactValidationStatus = 'passed'

		const joinedErrors = errors.join('\n')
		expect(joinedErrors).not.toContain('Run failed')
		expect(joinedErrors).not.toContain('unreachable')
		expect(joinedErrors).not.toMatch(/wasm|webassembly/i)
		result.status = 'passed'
	} catch (error) {
		result.status = 'failed'
		if (result.reportRunStatus === 'not-started') result.reportRunStatus = 'failed'
		if (result.artifactValidationStatus === 'not-started') result.artifactValidationStatus = 'failed'
		result.failureMessage = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
		throw error
	} finally {
		result.consoleErrors = errors
		result.finishedAt = new Date().toISOString()
		result.durationMs = Date.now() - started
		fs.mkdirSync(outputDir, { recursive: true })
		await page.screenshot({ path: path.join(outputDir, `${localBrowser.targetId}.png`), fullPage: true }).catch(() => undefined)
		writeCompatResult(result)
		await settleWithTimeout(context.close(), 10_000, 'Android browser context close').catch((error) => {
			console.warn(error.message)
		})
		await settleWithTimeout(device.close(), 10_000, 'Android device close').catch((error) => {
			console.warn(error.message)
		})
	}
} catch (error) {
	if (error instanceof PreflightError) {
		console.error(error.message)
		process.exit(2)
	}
	console.error(error instanceof Error ? error.stack : String(error))
	process.exit(1)
} finally {
	if (serverProcess) serverProcess.kill()
	if (startedEmulatorSerial) spawnSync('adb', ['-s', startedEmulatorSerial, 'emu', 'kill'], { stdio: 'ignore' })
	if (emulatorProcess) emulatorProcess.kill()
}

function commandExists(command) {
	const result = spawnSync('sh', ['-lc', `command -v ${command}`], { stdio: 'ignore' })
	return result.status === 0
}

function resolveLocalAndroidBrowser() {
	const requested = (process.env.WEB_COMPAT_ANDROID_BROWSER ?? 'android-chrome').trim().toLowerCase()
	const browser = androidBrowserConfig(requested)
	const targetId = process.env.WEB_COMPAT_ANDROID_TARGET_ID ?? browser.defaultTargetId
	const target = androidTargetMap().get(targetId)
	if (!knownLocalAndroidTargets().has(targetId)) throw new PreflightError(`Unknown Android compatibility target id: ${targetId}`)
	if (browser.remoteBrowser === 'firefox' || target?.browser === 'firefox') {
		throw new PreflightError(
			'Local Android package runs use Playwright\'s Chromium DevTools launcher and cannot produce Firefox Android evidence. ' +
			'Use the remote provider matrix for android-firefox-latest.',
		)
	}
	if (target && target.browser !== browser.remoteBrowser) {
		throw new PreflightError(`Android browser ${browser.remoteBrowser} cannot satisfy target ${targetId} (${target.browser}).`)
	}
	return {
		...browser,
		browserName: requested.startsWith('android-') ? requested : `android-${requested}`,
		targetId,
		versionLabel: process.env.WEB_COMPAT_ANDROID_BROWSER_VERSION ?? androidTargetVersion(targetId) ?? 'local',
	}
}

function androidBrowserConfig(requested) {
	const firefoxAliases = new Set(['android-firefox', 'firefox'])
	if (firefoxAliases.has(requested)) {
		throw new PreflightError(
			'Local Android package runs use Playwright\'s Chromium DevTools launcher and cannot produce Firefox Android evidence. ' +
			'Use the remote provider matrix for android-firefox-latest.',
		)
	}
	const aliases = {
		'android-chrome': {
			pkg: 'com.android.chrome',
			remoteBrowser: 'chrome',
			projectName: 'chromium',
			engine: 'chromium',
			defaultTargetId: 'android-local',
		},
		chrome: {
			pkg: 'com.android.chrome',
			remoteBrowser: 'chrome',
			projectName: 'chromium',
			engine: 'chromium',
			defaultTargetId: 'android-local',
		},
		chromium: {
			pkg: 'org.chromium.chrome',
			remoteBrowser: 'chrome',
			projectName: 'chromium',
			engine: 'chromium',
			defaultTargetId: 'android-local',
		},
		'android-chromium': {
			pkg: 'org.chromium.chrome',
			remoteBrowser: 'chrome',
			projectName: 'chromium',
			engine: 'chromium',
			defaultTargetId: 'android-local',
		},
		'android-samsung-internet': {
			pkg: 'com.sec.android.app.sbrowser',
			remoteBrowser: 'samsung-internet',
			projectName: 'chromium',
			engine: 'chromium',
			defaultTargetId: 'android-samsung-internet-latest',
		},
		'samsung-internet': {
			pkg: 'com.sec.android.app.sbrowser',
			remoteBrowser: 'samsung-internet',
			projectName: 'chromium',
			engine: 'chromium',
			defaultTargetId: 'android-samsung-internet-latest',
		},
		samsung: {
			pkg: 'com.sec.android.app.sbrowser',
			remoteBrowser: 'samsung-internet',
			projectName: 'chromium',
			engine: 'chromium',
			defaultTargetId: 'android-samsung-internet-latest',
		},
	}
	const configured = aliases[requested]
	if (!configured && !process.env.WEB_COMPAT_ANDROID_BROWSER_PKG) {
		throw new PreflightError(`Unsupported local Android browser ${requested}. Set WEB_COMPAT_ANDROID_BROWSER_PKG for a custom package.`)
	}
	const browser = configured ?? {
		pkg: process.env.WEB_COMPAT_ANDROID_BROWSER_PKG,
		remoteBrowser: process.env.WEB_COMPAT_ANDROID_REMOTE_BROWSER ?? requested.replace(/^android-/, ''),
		projectName: process.env.WEB_COMPAT_ANDROID_PROJECT ?? 'chromium',
		engine: process.env.WEB_COMPAT_ANDROID_ENGINE ?? 'chromium',
		defaultTargetId: 'android-local',
	}
	return {
		...browser,
		pkg: process.env.WEB_COMPAT_ANDROID_BROWSER_PKG ?? browser.pkg,
		apkPath: process.env.WEB_COMPAT_ANDROID_BROWSER_APK ? path.resolve(root, process.env.WEB_COMPAT_ANDROID_BROWSER_APK) : '',
	}
}

function knownLocalAndroidTargets() {
	return new Set(['android-local', ...androidTargetMap().keys()])
}

function androidTargetVersion(targetId) {
	return androidTargetMap().get(targetId)?.version
}

function androidTargetMap() {
	const targets = new Map()
	if (!fs.existsSync(remoteMatrixFile)) return targets
	const doc = parse(fs.readFileSync(remoteMatrixFile, 'utf8')) ?? {}
	for (const target of doc.targets ?? []) {
		if (target?.platform === 'android') targets.set(String(target.id), target)
	}
	return targets
}

function run(command, args) {
	const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' })
	if (result.status !== 0) throw new PreflightError(`${command} ${args.join(' ')} failed: ${result.stderr || result.stdout}`)
}

async function ensureAndroidDevice() {
	if (connectedDeviceSerials().length) return
	const avdName = process.env.ANDROID_BROWSER_COMPAT_AVD
	if (!avdName) return
	if (!commandExists('emulator')) throw new PreflightError('emulator is required to start ANDROID_BROWSER_COMPAT_AVD.')
	fs.mkdirSync(logDir, { recursive: true })
	const logPath = path.join(logDir, 'android-emulator-compat.log')
	const logFd = fs.openSync(logPath, 'w')
	const args = [
		'-avd', avdName,
		'-no-snapshot-save',
		'-no-window',
		'-no-boot-anim',
		'-noaudio',
		'-camera-back', 'none',
		'-gpu', process.env.ANDROID_EMULATOR_GPU ?? 'swiftshader_indirect',
	]
	emulatorProcess = spawn('emulator', args, {
		cwd: root,
		env: process.env,
		stdio: ['ignore', logFd, logFd],
	})
	for (let attempt = 0; attempt < 240; attempt += 1) {
		const serials = connectedDeviceSerials()
		if (serials.length) {
			startedEmulatorSerial = process.env.ANDROID_SERIAL || serials[0]
			const booted = spawnSync('adb', ['-s', startedEmulatorSerial, 'shell', 'getprop', 'sys.boot_completed'], { encoding: 'utf8' }).stdout.trim()
			if (booted === '1') {
				spawnSync('adb', ['-s', startedEmulatorSerial, 'shell', 'input', 'keyevent', '82'], { stdio: 'ignore' })
				return
			}
		}
		if (emulatorProcess.exitCode !== null) break
		await new Promise((resolve) => setTimeout(resolve, 1000))
	}
	throw new PreflightError(`Android emulator ${avdName} failed to boot; see ${path.relative(root, logPath)}.`)
}

function connectedDeviceSerials() {
	const result = spawnSync('adb', ['devices'], { encoding: 'utf8' })
	if (result.status !== 0) return []
	return result.stdout.split(/\r?\n/)
		.slice(1)
		.map((line) => line.trim().split(/\s+/))
		.filter(([serial, state]) => serial && state === 'device')
		.map(([serial]) => serial)
}

async function prepareAndroidBrowserPackage(device, localBrowser) {
	if (!localBrowser.pkg) return
	if (localBrowser.apkPath) {
		if (!fs.existsSync(localBrowser.apkPath)) throw new PreflightError(`Android browser APK not found: ${path.relative(root, localBrowser.apkPath)}`)
		await device.installApk(localBrowser.apkPath)
	}
	const packagePath = await deviceShellText(device, `pm path ${localBrowser.pkg}`)
	if (!packagePath) {
		throw new PreflightError(
			`Android package ${localBrowser.pkg} is not installed. ` +
			'Install it on the attached device or set WEB_COMPAT_ANDROID_BROWSER_APK to an APK file.',
		)
	}
}

async function getAndroidDeviceFacts(device, localBrowser) {
	const facts = {
		serial: device.serial(),
		release: await deviceShellText(device, 'getprop ro.build.version.release'),
		sdk: await deviceShellText(device, 'getprop ro.build.version.sdk'),
		manufacturer: await deviceShellText(device, 'getprop ro.product.manufacturer'),
		model: await deviceShellText(device, 'getprop ro.product.model'),
		chromeVersion: parsePackageVersion(await deviceShellText(device, 'dumpsys package com.android.chrome | grep versionName | head -1')),
		selectedBrowserPackage: localBrowser.pkg,
		selectedBrowserVersion: localBrowser.pkg ? parsePackageVersion(await deviceShellText(device, `dumpsys package ${localBrowser.pkg} | grep versionName | head -1`)) : undefined,
	}
	for (const [key, value] of Object.entries(facts)) {
		if (value === '') facts[key] = undefined
	}
	return facts
}

async function deviceShellText(device, command) {
	try {
		return (await device.shell(command)).toString('utf8').trim()
	} catch {
		return ''
	}
}

function parsePackageVersion(output) {
	return output.match(/versionName=([^\s]+)/)?.[1]
}

function settleWithTimeout(promise, timeoutMs, label) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
		Promise.resolve(promise).then(
			(value) => {
				clearTimeout(timer)
				resolve(value)
			},
			(error) => {
				clearTimeout(timer)
				reject(error)
			},
		)
	})
}

async function startLocalWebServer(serverPort) {
	fs.mkdirSync(logDir, { recursive: true })
	const url = `http://localhost:${serverPort}`
	if (await isServing(url)) return url

	const logPath = path.join(logDir, 'android-web-compat.log')
	const logFd = fs.openSync(logPath, 'w')
	serverProcess = spawn('npx', ['expo', 'start', '--web', '--localhost', '--port', String(serverPort)], {
		cwd: root,
		env: { ...process.env, BROWSER: 'none', EXPO_PUBLIC_DISABLE_ANALYTICS: '1' },
		stdio: ['ignore', logFd, logFd],
	})

	for (let attempt = 0; attempt < 90; attempt += 1) {
		if (await isServing(url)) return url
		if (serverProcess.exitCode !== null) break
		await new Promise((resolve) => setTimeout(resolve, 1000))
	}
	throw new PreflightError(`Expo web failed to start at ${url}; see ${path.relative(root, logPath)}.`)
}

async function isServing(url) {
	try {
		const response = await fetch(url, { redirect: 'follow' })
		return response.ok
	} catch {
		return false
	}
}

function toAndroidDeviceUrl(hostUrl, serverPort) {
	const url = new URL(hostUrl)
	if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
		url.hostname = '127.0.0.1'
		if (!url.port) url.port = String(serverPort)
	}
	return url.toString().replace(/\/$/, '')
}

function loadCompatCase(id) {
	const scenarioFile = path.join(root, 'tests/lab-scenarios.yaml')
	const scenarios = parse(fs.readFileSync(scenarioFile, 'utf8')).scenarios ?? []
	const scenario = scenarios.find((item) => item.id === 'web-pgx-1-report-browser-matrix')
	if (!scenario?.report_matrix) throw new PreflightError('Missing web-pgx-1-report-browser-matrix scenario.')

	const config = {
		samplesFile: scenario.report_matrix.samples_file,
		packageZip: scenario.report_matrix.package_zip,
		packageUrl: scenario.report_matrix.package_url,
		requireArtifacts: scenario.report_matrix.require_artifacts ?? ['observations.tsv', 'analysis.jsonl', 'reports.jsonl', 'index.html'],
		htmlContains: scenario.report_matrix.html_contains ?? [],
		reportStatus: scenario.report_matrix.report_status ?? [],
	}
	const sourceFile = path.join(root, config.samplesFile)
	const samplesDoc = parse(fs.readFileSync(sourceFile, 'utf8'))
	const sample = (samplesDoc.samples ?? []).find((item) => item.id === id)
	if (!sample) throw new PreflightError(`Missing compatibility sample: ${id}`)

	const defaults = samplesDoc.defaults?.assertions ?? {}
	const sampleAssertions = sample.assertions ?? {}
	return {
		requiredArtifacts: config.requireArtifacts,
		caseDef: {
			id,
			inputFiles: [sample.input_file, sample.input_index, sample.reference_file, sample.reference_index]
				.filter(Boolean)
				.map((item) => path.resolve(path.dirname(sourceFile), item)),
			packageZip: sample.package_zip
				? path.resolve(path.dirname(sourceFile), sample.package_zip)
				: path.resolve(root, config.packageZip),
			packageUrl: sample.package_url ?? config.packageUrl,
			packageInputFile: sample.package_input_file === true,
			packageLabel: sample.package_label ?? 'PGx-1 Panel',
			htmlContains: sample.html_contains ?? config.htmlContains,
			assertions: {
				observationMinRows: Number(sampleAssertions.observations?.min_rows ?? defaults.observations?.min_rows ?? 0),
				reportMinRows: Number(sampleAssertions.reports?.min_rows ?? defaults.reports?.min_rows ?? 0),
				reportStatuses: sampleAssertions.reports?.require_status ?? defaults.reports?.require_status ?? config.reportStatus,
			},
		},
	}
}

function verifyLocalFiles(caseDef) {
	for (const file of [...caseDef.inputFiles, caseDef.packageZip]) {
		if (!fs.existsSync(file)) throw new PreflightError(`Missing required file: ${path.relative(root, file)}`)
	}
}

function capturePageErrors(page) {
	const errors = []
	page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
	page.on('console', (msg) => {
		if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`)
	})
	return errors
}

async function routePackageZipToLocalFile(page, caseDef) {
	await page.route(caseDef.packageUrl, async (route) => {
		await route.fulfill({ body: fs.readFileSync(caseDef.packageZip), contentType: 'application/zip' })
	})
	const artifactUrl = new URL(path.basename(caseDef.packageZip), caseDef.packageUrl).toString()
	for (const url of [artifactUrl, `**/${path.basename(caseDef.packageZip)}`]) {
		await page.route(url, async (route) => {
			await route.fulfill({ body: fs.readFileSync(caseDef.packageZip), contentType: 'application/zip' })
		})
	}
}

async function seedAcceptedOnboarding(page) {
	await page.addInitScript(() => {
		localStorage.setItem('biovault-webdb:app_preferences', JSON.stringify([
			{ key: 'hasAcceptedResearchDisclaimer', value: 'true' },
			{ key: 'hasCompletedOnboarding', value: 'true' },
		]))
	})
}

async function prepareLabReportCase(page, caseDef, baseUrl) {
	await page.goto(`${baseUrl}/lab`, { waitUntil: 'domcontentloaded' })
	await dismissDisclaimer(page)
	await ensureImportGenomeVisible(page)
	await chooseFilesIntoLab(page, caseDef.packageInputFile ? [...caseDef.inputFiles, caseDef.packageZip] : caseDef.inputFiles)
	await expectLoadedGenome(page, caseDef.inputFiles[0])
}

async function dismissDisclaimer(page) {
	const understand = page.getByText('I understand and want to continue', { exact: false })
	if (await understand.isVisible().catch(() => false)) {
		const checkbox = page.getByRole('checkbox').first()
		if (await checkbox.isVisible({ timeout: 1_000 }).catch(() => false)) {
			await checkbox.evaluate((element) => element.click())
		} else {
			await understand.evaluate((element) => element.click())
		}
		const continueAction = page.getByText(/^Continue$/).first()
		await expect(continueAction).toBeVisible({ timeout: 10_000 })
		await continueAction.evaluate((element) => element.click())
	}
}

async function ensureImportGenomeVisible(page) {
	const importGenome = page.getByText('Import genome', { exact: true })
	if (await importGenome.isVisible({ timeout: 1_000 }).catch(() => false)) return
	const openMenu = page.getByRole('button', { name: /Open menu|Genome files/ }).first()
	if (await openMenu.isVisible({ timeout: 1_000 }).catch(() => false)) await openMenu.click()
	await expect(importGenome).toBeVisible({ timeout: 30_000 })
}

async function chooseFilesIntoLab(page, files) {
	await ensureImportGenomeVisible(page)
	const [chooser] = await Promise.all([
		page.waitForEvent('filechooser'),
		(async () => {
			await page.getByText('Import genome', { exact: true }).click()
			await page.getByLabel('Choose genome files').click()
		})(),
	])
	await chooser.setFiles(files)
	await dismissRememberFilesPrompt(page)
}

async function dismissRememberFilesPrompt(page) {
	const dialog = page.getByLabel('Persistent file access dialog', { exact: true })
	if (!(await dialog.isVisible({ timeout: 2_000 }).catch(() => false))) return
	const notNow = dialog.getByText('Not now', { exact: true })
	if (await notNow.isVisible({ timeout: 250 }).catch(() => false)) await notNow.evaluate((element) => element.click())
	await expect(dialog).toBeHidden({ timeout: 5_000 }).catch(() => undefined)
}

async function dismissSharedResourcePrompt(page) {
	const dialog = page.getByLabel('Shared resource dialog', { exact: true })
	if (!(await dialog.isVisible({ timeout: 2_000 }).catch(() => false))) return
	for (const name of ['Ignore', 'Done', 'Close shared resource dialog']) {
		const control = dialog.getByRole('button', { name, exact: true }).first()
		if (await control.isVisible({ timeout: 250 }).catch(() => false)) {
			await control.evaluate((element) => element.click())
			break
		}
	}
	await expect(dialog).toBeHidden({ timeout: 5_000 }).catch(() => undefined)
}

async function expectLoadedGenome(page, filePath) {
	const name = path.basename(filePath)
	await expect(page.getByTestId('session-genome-row').filter({ hasText: name })).toBeVisible({ timeout: 60_000 })
	await expect(page.getByText('Genome complete', { exact: true })).toBeVisible({ timeout: 60_000 })
}

async function runPackageAndOpenResult(page, caseDef) {
	const allFilter = page.getByText('All', { exact: true }).first()
	if (await allFilter.isVisible({ timeout: 2_000 }).catch(() => false)) await allFilter.evaluate((element) => element.click())
	await expect(page.getByTestId('assay-result-row').filter({ hasText: caseDef.packageLabel }).last()).toBeVisible({ timeout: 60_000 })
	const runButton = page.getByRole('button', { name: `Run ${caseDef.packageLabel}`, exact: true }).first()
	await expect(runButton).toBeVisible({ timeout: 60_000 })
	await dismissRememberFilesPrompt(page)
	await dismissSharedResourcePrompt(page)
	await runButton.evaluate((element) => element.click())
	await expect(async () => {
		const bodyText = await page.locator('body').innerText({ timeout: 10_000 })
		expect(bodyText).not.toContain('Run failed')
		expect(bodyText).not.toContain('unreachable')
		expect(bodyText).toContain('4 result artifacts saved locally.')
	}).toPass({ timeout: resultTimeoutMs, intervals: [1_000, 3_000, 5_000, 10_000] })
	const viewResult = page.getByText('View result', { exact: true })
	await expect(viewResult).toBeVisible({ timeout: 30_000 })
	await dismissRememberFilesPrompt(page)
	await viewResult.evaluate((element) => element.click())
	await expect(page.getByText('ARTIFACTS', { exact: true })).toBeVisible({ timeout: 30_000 })
}

async function readArtifacts(page, names) {
	const entries = await page.evaluate(async (artifactNames) => {
		const rows = []
		for (const name of artifactNames) {
			const link = Array.from(document.querySelectorAll('a')).find((node) => node.textContent?.trim() === name)
			if (!link?.href) throw new Error(`missing artifact link: ${name}`)
			rows.push([name, await fetch(link.href).then((response) => response.text())])
		}
		return rows
	}, names)
	return new Map(entries)
}

function assertArtifactData(caseDef, artifacts) {
	const observations = parseTsv(artifacts.get('observations.tsv') ?? '')
	const reports = parseJsonl(artifacts.get('reports.jsonl') ?? '')
	expect(observations.length).toBeGreaterThanOrEqual(caseDef.assertions.observationMinRows)
	expect(reports.length).toBeGreaterThanOrEqual(caseDef.assertions.reportMinRows)
	for (const report of reports) {
		expect(caseDef.assertions.reportStatuses.map(String)).toContain(String(report.report_status))
	}
}

function parseTsv(text) {
	const lines = text.trim().split(/\r?\n/)
	const headers = lines.shift()?.split('\t') ?? []
	return lines.filter(Boolean).map((line) => Object.fromEntries(headers.map((header, index) => [header, line.split('\t')[index] ?? ''])))
}

function parseJsonl(text) {
	return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
}

async function runCapabilityProbe(page) {
	return page.evaluate(async () => {
		const failures = []
		const wasmHeader = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00])
		const probe = {
			userAgent: navigator.userAgent,
			platform: navigator.platform,
			language: navigator.language,
			secureContext: window.isSecureContext,
			webAssembly: typeof WebAssembly !== 'undefined',
			webAssemblyValidate: typeof WebAssembly !== 'undefined' && WebAssembly.validate(wasmHeader),
			worker: typeof Worker !== 'undefined',
			moduleWorker: false,
			blob: typeof Blob !== 'undefined',
			file: typeof File !== 'undefined',
			fileReader: typeof FileReader !== 'undefined',
			fileReaderSyncInWorker: false,
			fetch: typeof fetch === 'function',
			readableStream: typeof ReadableStream !== 'undefined',
			indexedDB: typeof indexedDB !== 'undefined',
			localStorage: false,
			cryptoSubtle: Boolean(globalThis.crypto?.subtle),
			failures,
		}
		try {
			const key = '__biovault_compat_probe__'
			localStorage.setItem(key, '1')
			probe.localStorage = localStorage.getItem(key) === '1'
			localStorage.removeItem(key)
		} catch (error) {
			failures.push(`localStorage: ${error instanceof Error ? error.message : String(error)}`)
		}

		if (probe.worker && probe.blob) {
			probe.fileReaderSyncInWorker = await runWorkerProbe(
				`self.postMessage({ fileReaderSync: typeof FileReaderSync !== 'undefined' })`,
			).then((value) => value.fileReaderSync).catch((error) => {
				failures.push(`worker: ${error instanceof Error ? error.message : String(error)}`)
				return false
			})

			probe.moduleWorker = await runWorkerProbe(
				`self.postMessage({ moduleWorker: true })`,
				{ type: 'module' },
			).then((value) => value.moduleWorker).catch((error) => {
				failures.push(`moduleWorker: ${error instanceof Error ? error.message : String(error)}`)
				return false
			})
		}

		return probe

		function runWorkerProbe(source, options) {
			return new Promise((resolve, reject) => {
				const url = URL.createObjectURL(new Blob([source], { type: 'application/javascript' }))
				let worker = null
				const timer = setTimeout(() => {
					worker?.terminate()
					URL.revokeObjectURL(url)
					reject(new Error('worker probe timed out'))
				}, 5_000)
				try {
					worker = new Worker(url, options)
					worker.onmessage = (event) => {
						clearTimeout(timer)
						worker?.terminate()
						URL.revokeObjectURL(url)
						resolve(event.data)
					}
					worker.onerror = (event) => {
						clearTimeout(timer)
						worker?.terminate()
						URL.revokeObjectURL(url)
						reject(new Error(event.message || 'worker probe failed'))
					}
				} catch (error) {
					clearTimeout(timer)
					URL.revokeObjectURL(url)
					reject(error)
				}
			})
		}
	})
}

function parseBrowserVersion(userAgent) {
	return userAgent.match(/(?:Chrome|CriOS|Firefox|FxiOS|SamsungBrowser)\/([0-9.]+)/)?.[1] ?? null
}

function baseResult(caseDef, deviceUrl, localBrowser, deviceFacts) {
	const deviceLabel = [deviceFacts.manufacturer, deviceFacts.model].filter(Boolean).join(' ').trim()
	return {
		id: `android-local-${caseDef.id}-${Date.now()}`,
		startedAt: new Date().toISOString(),
		status: 'started',
		projectName: localBrowser.targetId === 'android-local' ? 'android-local' : localBrowser.projectName,
		sampleId: caseDef.id,
		browserName: localBrowser.browserName,
		browserVersion: deviceFacts.selectedBrowserVersion ?? deviceFacts.chromeVersion ?? 'unknown',
		engine: localBrowser.engine,
		os: {
			platform: 'android',
			release: process.env.WEB_COMPAT_ANDROID_VERSION ?? deviceFacts.release ?? 'unknown',
			sdk: deviceFacts.sdk,
			arch: os.arch(),
		},
		deviceProfile: process.env.ANDROID_SERIAL ?? (deviceLabel || deviceFacts.serial || 'attached-android'),
		compatibilitySource: 'android-local',
		remoteTargetId: localBrowser.targetId,
		remotePlatform: 'android',
		remoteBrowser: localBrowser.remoteBrowser,
		remoteBrowserVersionLabel: localBrowser.versionLabel,
		androidDevice: deviceFacts,
		deviceUrl,
		reportRunStatus: 'not-started',
		artifactValidationStatus: 'not-started',
		consoleErrors: [],
	}
}

function writeCompatResult(result) {
	fs.mkdirSync(runsDir, { recursive: true })
	const safeId = result.id.replace(/[^a-z0-9_.-]+/gi, '-')
	fs.writeFileSync(path.join(runsDir, `${safeId}.json`), `${JSON.stringify(result, null, 2)}\n`)
	const runs = fs.readdirSync(runsDir)
		.filter((file) => file.endsWith('.json'))
		.map((file) => JSON.parse(fs.readFileSync(path.join(runsDir, file), 'utf8')))
		.sort((left, right) => left.startedAt.localeCompare(right.startedAt))
	fs.writeFileSync(resultsJson, `${JSON.stringify(runs, null, 2)}\n`)
	fs.writeFileSync(resultsMd, renderMarkdownSummary(runs))
}

function renderMarkdownSummary(results) {
	const rows = results.map((result) => [
		result.status,
		result.remoteTargetId ?? '',
		result.compatibilitySource,
		result.projectName,
		result.browserName,
		result.browserVersion,
		result.remoteDeviceName ?? result.deviceProfile,
		result.remoteOsVersion ?? formatOsForSummary(result.os),
		result.capabilities?.secureContext ? 'yes' : 'no',
		result.capabilities?.webAssemblyValidate ? 'yes' : 'no',
		result.capabilities?.worker ? 'yes' : 'no',
		result.reportRunStatus,
		result.artifactValidationStatus,
		formatFailureForSummary(result.failureMessage),
	])
	return [
		'# Browser Compatibility Results',
		'',
		'| Status | Target | Source | Project | Browser | Version | Device | OS | Secure | WASM | Worker | Report | Artifacts | Failure |',
		'| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
		...rows.map((cells) => `| ${cells.map((value) => String(value).replace(/\|/g, '\\|')).join(' | ')} |`),
		'',
	].join('\n')
}

function formatOsForSummary(value) {
	return [value?.platform, value?.release].filter(Boolean).join(' ')
}

function formatFailureForSummary(value) {
	const compact = String(value ?? '')
		.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
	const maxLength = 240
	return compact.length > maxLength ? `${compact.slice(0, maxLength - 1)}...` : compact
}
