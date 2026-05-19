#!/usr/bin/env node
// REAL Chrome on a real Android emulator via Appium + UiAutomator2.
//
// Symmetric with scripts/run-local-ios-browser-compat.mjs. Appium
// (uiautomator2 + chromedriver) drives the actual Chrome app on a
// connected emulator/device — real Chrome, and (unlike Playwright
// _android over CDP) it drives the visible UI so it is watchable in the
// emulator window. Loads the app from the local dev server, runs the
// bundled demo through real Monty + bioscript-wasm, opens the result,
// verifies the 4 artifact files. Talks raw W3C WebDriver over fetch.
//
// Prereqs: a booted Android emulator/device (adb); `appium` with the
// uiautomator2 driver; `expo start --web` (or pass WEB_URL).
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const port = Number(process.env.PORT ?? '8082')
const appiumPort = Number(process.env.APPIUM_PORT ?? '4723')
const sessionTimeoutMs = Number(process.env.WEB_COMPAT_RESULT_TIMEOUT_MS ?? '600000')
const outputDir = path.resolve(root, process.env.WEB_COMPAT_OUTPUT_DIR ?? 'test-output/browser-compat')
const runsDir = path.join(outputDir, 'runs')
const logDir = path.join(root, '.maestro-web/logs')
const sdkRoot = process.env.ANDROID_SDK_ROOT ?? process.env.ANDROID_HOME ?? ''
const adbBin = sdkRoot ? path.join(sdkRoot, 'platform-tools', 'adb') : 'adb'
const emulatorBin = sdkRoot ? path.join(sdkRoot, 'emulator', 'emulator') : 'emulator'

let serverProcess = null
let appiumProcess = null
let sessionId = null
let emulatorProc = null
const appiumBase = `http://127.0.0.1:${appiumPort}`

const PROBE_SOURCE = String.raw`(async () => {
  const failures = [];
  const h = new Uint8Array([0,97,115,109,1,0,0,0]);
  const c = {
    userAgent: navigator.userAgent, secureContext: window.isSecureContext,
    webAssembly: typeof WebAssembly !== 'undefined',
    webAssemblyValidate: typeof WebAssembly !== 'undefined' && WebAssembly.validate(h),
    worker: typeof Worker !== 'undefined', indexedDB: typeof indexedDB !== 'undefined',
    cryptoSubtle: Boolean(globalThis.crypto && globalThis.crypto.subtle),
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    crossOriginIsolated: typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : false,
    failures,
  };
  return c;
})()`

try {
	if (!commandExists('appium')) throw new Error('appium not on PATH. Install: npm i -g appium && appium driver install uiautomator2')

	const serial = await ensureEmulator()
	const facts = {
		release: adbProp(serial, 'ro.build.version.release'),
		sdk: adbProp(serial, 'ro.build.version.sdk'),
		model: adbProp(serial, 'ro.product.model'),
		chrome: (adbShell(serial, 'dumpsys package com.android.chrome | grep versionName | head -1').match(/versionName=([^\s]+)/) || [])[1],
	}

	const hostUrl = process.env.WEB_URL ?? (await startLocalWebServer(port))
	const base = hostUrl.replace(/\/$/, '')
	const urlPort = new URL(base).port || String(port)
	// Make the host dev server reachable as localhost on the device so it
	// is a secure context (crypto.subtle / SAB gating).
	spawnSync(adbBin, ['-s', serial, 'reverse', `tcp:${urlPort}`, `tcp:${urlPort}`], { stdio: 'ignore' })

	await startAppium()

	const startedAt = new Date().toISOString()
	const caps = {
		platformName: 'Android',
		'appium:automationName': 'UiAutomator2',
		browserName: 'chrome',
		// Expo's dev SPA never signals "load complete"; drive readiness ourselves.
		pageLoadStrategy: 'none',
		'appium:udid': serial,
		'appium:deviceName': facts.model || serial,
		'appium:chromedriverAutodownload': true,
		'appium:newCommandTimeout': 300,
		'appium:noReset': true,
	}

	const created = await w3c('POST', '/session', { capabilities: { alwaysMatch: caps, firstMatch: [{}] } })
	sessionId = created.value.sessionId
	await w3c('POST', `/session/${sessionId}/timeouts`, { script: sessionTimeoutMs, pageLoad: 300000, implicit: 0 })

	const wantHost = new URL(base).host
	const evalSync = (script) =>
		w3c('POST', `/session/${sessionId}/execute/sync`, { script, args: [] }).then((r) => r.value)
	const waitForOrigin = async (label) => {
		const dl = Date.now() + 120000
		while (Date.now() < dl) {
			const ok = await evalSync(`return (location.host === ${JSON.stringify(wantHost)}) && !!document.body`).catch(() => false)
			if (ok) return
			await sleep(1500)
		}
		throw new Error(`Android Chrome never reached ${label} (${wantHost})`)
	}

	// 1) Seed onboarding-accepted, then load the lab.
	await w3c('POST', `/session/${sessionId}/url`, { url: `${base}/` })
	await waitForOrigin('app root')
	await evalSync(
		"try{localStorage.setItem('biovault-webdb:app_preferences', JSON.stringify([{key:'hasAcceptedResearchDisclaimer',value:'true'},{key:'hasCompletedOnboarding',value:'true'}]));}catch(e){} return true;",
	)
	await w3c('POST', `/session/${sessionId}/url`, { url: `${base}/lab` })
	await waitForOrigin('lab route')

	// 2) Capability probe (diagnostics only).
	const probe = await w3c('POST', `/session/${sessionId}/execute/async`, {
		script:
			'var cb = arguments[arguments.length - 1];' +
			`(${PROBE_SOURCE}).then(function(r){cb(r)}).catch(function(e){cb({error:String(e && e.message || e)})});`,
		args: [],
	}).then((r) => r.value).catch((e) => ({ error: String(e) }))
	const probeCaps = probe.error ? {} : probe

	// 3) Click the real demo run button.
	const sel = '[aria-label="Load sample data and run a demo assay locally"]'
	const ELKEY = 'element-6066-11e4-a52e-4f735466cecf'
	let elId = null
	const findDeadline = Date.now() + 90000
	while (Date.now() < findDeadline) {
		const found = await w3c('POST', `/session/${sessionId}/element`, { using: 'css selector', value: sel }).catch(() => null)
		elId = found && (found.value?.[ELKEY] ?? found.value?.ELEMENT)
		if (elId) break
		await sleep(2000)
	}
	if (!elId) throw new Error('Demo run button not found in real Android Chrome (getting-started view did not render).')
	await w3c('POST', `/session/${sessionId}/element/${elId}/click`, {})

	// 4) Poll the real report to completion.
	const requiredArtifacts = ['observations.tsv', 'analysis.jsonl', 'reports.jsonl', 'index.html']
	const reportDeadline = Date.now() + sessionTimeoutMs
	let bodyText = ''
	let savedCount = 0
	let reportDone = false
	while (Date.now() < reportDeadline) {
		bodyText = await evalSync('return (document.body && document.body.innerText) || ""')
			.then((v) => String(v || ''))
			.catch(() => bodyText)
		if (/Run failed|unreachable/i.test(bodyText)) {
			throw new Error(`Demo run FAILED in real Android Chrome: ${bodyText.replace(/\s+/g, ' ').slice(0, 300)}`)
		}
		const m = bodyText.match(/(\d+)\s+result artifacts saved locally\./i)
		if (m) {
			savedCount = Number(m[1])
			reportDone = true
			break
		}
		await sleep(4000)
	}
	if (!reportDone) throw new Error(`Demo report did not complete within ${sessionTimeoutMs}ms (body: ${bodyText.replace(/\s+/g, ' ').slice(0, 200)})`)

	// 5) Open the result and verify the artifacts view lists the files.
	const clicked = await evalSync(
		"var els=Array.from(document.querySelectorAll('a,button,[role=button],div,span'));" +
			"var t=els.filter(function(e){return (e.innerText||e.textContent||'').trim()==='View result';});" +
			"if(!t.length)return false;var e=t[t.length-1];(e.closest('[role=button]')||e).click();return true;",
	).catch(() => false)
	if (!clicked) throw new Error('Report completed but the "View result" button was not found/clickable.')

	const artifactDeadline = Date.now() + 120000
	let artifactsText = ''
	let artifactsViewOpen = false
	while (Date.now() < artifactDeadline) {
		artifactsText = await evalSync('return (document.body && document.body.innerText) || ""')
			.then((v) => String(v || ''))
			.catch(() => artifactsText)
		if (/ARTIFACTS/.test(artifactsText)) {
			artifactsViewOpen = true
			break
		}
		await sleep(2000)
	}
	const presentArtifacts = requiredArtifacts.filter((n) => artifactsText.includes(n))
	const missingArtifacts = requiredArtifacts.filter((n) => !artifactsText.includes(n))

	const ok = reportDone && savedCount >= requiredArtifacts.length && artifactsViewOpen && missingArtifacts.length === 0
	const finishedAt = new Date().toISOString()
	const result = {
		id: `android-emu-${(facts.model || 'device').replace(/\s+/g, '-')}-${Date.now()}`,
		startedAt,
		finishedAt,
		durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
		status: ok ? 'passed' : 'failed',
		projectName: 'android-emu',
		sampleId: 'demo-pgx-report',
		browserName: 'android-chrome',
		browserVersion: facts.chrome ?? probeCaps.userAgent?.match(/Chrome\/([0-9.]+)/)?.[1] ?? 'unknown',
		engine: 'chromium',
		os: { platform: 'android', release: facts.release || 'unknown', sdk: facts.sdk, arch: os.arch() },
		deviceProfile: facts.model || serial,
		compatibilitySource: 'android-emu-appium',
		capabilities: probeCaps,
		reportRunStatus: reportDone ? 'passed' : 'failed',
		artifactValidationStatus: missingArtifacts.length === 0 ? 'passed' : 'failed',
		artifactNames: presentArtifacts,
		consoleErrors: [],
		failureMessage: ok
			? undefined
			: `reportDone=${reportDone} savedCount=${savedCount} artifactsViewOpen=${artifactsViewOpen} missingArtifacts=${JSON.stringify(missingArtifacts)} probeErr=${probe.error ?? ''}`,
	}
	fs.mkdirSync(runsDir, { recursive: true })
	fs.writeFileSync(path.join(runsDir, `${result.id}.json`), `${JSON.stringify(result, null, 2)}\n`)

	console.log(
		`\nREAL Chrome (Android emulator, Appium/UiAutomator2) — ${facts.model} (Android ${facts.release}, API ${facts.sdk})\n` +
			`  status:       ${result.status}\n` +
			`  chrome:       ${result.browserVersion}\n` +
			`  demo report:  ${result.reportRunStatus} (${savedCount} artifacts saved; processed demo genome via Monty + bioscript-wasm)\n` +
			`  artifacts:    ${result.artifactValidationStatus} [${presentArtifacts.join(', ')}]\n` +
			`  secureCtx:    ${probeCaps.secureContext}  sharedArrayBuffer=${probeCaps.sharedArrayBuffer}  crossOriginIsolated=${probeCaps.crossOriginIsolated}\n` +
			(result.failureMessage ? `  failure:      ${result.failureMessage}\n` : ''),
	)
	process.exit(ok ? 0 : 1)
} catch (error) {
	console.error(error instanceof Error ? error.stack : String(error))
	process.exit(1)
} finally {
	if (sessionId) await w3c('DELETE', `/session/${sessionId}`).catch(() => {})
	if (appiumProcess) appiumProcess.kill()
	if (serverProcess) serverProcess.kill()
	// Leave an emulator we launched running so it stays watchable; set
	// ANDROID_WC_KILL_EMULATOR=1 to shut it down on exit.
	if (emulatorProc && process.env.ANDROID_WC_KILL_EMULATOR === '1') emulatorProc.kill()
}

function connectedSerial() {
	if (process.env.ANDROID_SERIAL) {
		const want = process.env.ANDROID_SERIAL
		return connectedSerials().includes(want) ? want : null
	}
	return connectedSerials()[0] ?? null
}

function connectedSerials() {
	const out = spawnSync(adbBin, ['devices'], { encoding: 'utf8' }).stdout || ''
	return out
		.split(/\r?\n/)
		.slice(1)
		.map((l) => l.trim().split(/\s+/))
		.filter(([s, st]) => s && st === 'device')
		.map(([s]) => s)
}

// Use an already-attached device (CI's android-emulator-runner boots one
// before this runs; or a user pre-launched one). Otherwise launch an AVD
// — HEADED by default so it's watchable locally; set
// ANDROID_WC_HEADLESS=1 for -no-window (CI/background).
async function ensureEmulator() {
	const existing = connectedSerial()
	if (existing) return existing

	const avd =
		process.env.ANDROID_AVD ||
		(spawnSync(emulatorBin, ['-list-avds'], { encoding: 'utf8' }).stdout || '')
			.split(/\r?\n/)
			.map((s) => s.trim())
			.filter(Boolean)[0]
	if (!avd) throw new Error('No Android device attached and no AVD found. Create one (Android Studio / avdmanager) or set ANDROID_AVD.')

	const before = new Set(connectedSerials())
	const headless = process.env.ANDROID_WC_HEADLESS === '1'
	const args = ['-avd', avd, '-no-boot-anim', '-noaudio', '-no-snapshot-save', '-gpu', process.env.ANDROID_EMULATOR_GPU ?? 'host']
	if (headless) args.push('-no-window')
	fs.mkdirSync(logDir, { recursive: true })
	const fd = fs.openSync(path.join(logDir, 'android-emulator.log'), 'w')
	console.log(`Launching Android emulator '${avd}'${headless ? ' (headless)' : ' (headed — watch the window)'}…`)
	emulatorProc = spawn(emulatorBin, args, { stdio: ['ignore', fd, fd] })

	let serial = null
	for (let i = 0; i < 240; i += 1) {
		const fresh = connectedSerials().filter((s) => !before.has(s))
		serial = fresh[0] ?? connectedSerials()[0] ?? null
		if (serial) {
			const booted = spawnSync(adbBin, ['-s', serial, 'shell', 'getprop', 'sys.boot_completed'], { encoding: 'utf8' }).stdout.trim()
			if (booted === '1') {
				spawnSync(adbBin, ['-s', serial, 'shell', 'input', 'keyevent', '82'], { stdio: 'ignore' })
				return serial
			}
		}
		if (emulatorProc.exitCode !== null) break
		await sleep(1000)
	}
	throw new Error(`Emulator '${avd}' failed to boot; see .maestro-web/logs/android-emulator.log`)
}

function adbShell(serial, cmd) {
	return (spawnSync(adbBin, ['-s', serial, 'shell', cmd], { encoding: 'utf8' }).stdout || '').trim()
}

function adbProp(serial, prop) {
	return adbShell(serial, `getprop ${prop}`)
}

async function w3c(method, route, body) {
	const res = await fetch(`${appiumBase}${route}`, {
		method,
		headers: { 'content-type': 'application/json' },
		body: body ? JSON.stringify(body) : undefined,
	})
	const text = await res.text()
	let json
	try {
		json = text ? JSON.parse(text) : {}
	} catch {
		throw new Error(`${method} ${route} -> non-JSON (${res.status}): ${text.slice(0, 400)}`)
	}
	if (!res.ok || json.value?.error) {
		throw new Error(`${method} ${route} -> ${res.status}: ${JSON.stringify(json.value ?? json).slice(0, 600)}`)
	}
	return json
}

async function startAppium() {
	fs.mkdirSync(logDir, { recursive: true })
	const fd = fs.openSync(path.join(logDir, 'android-appium.log'), 'w')
	appiumProcess = spawn('appium', ['--port', String(appiumPort), '--log-level', 'info', '--relaxed-security'], {
		cwd: root,
		stdio: ['ignore', fd, fd],
	})
	for (let i = 0; i < 60; i += 1) {
		try {
			if ((await fetch(`${appiumBase}/status`)).ok) return
		} catch {
			// not up yet
		}
		if (appiumProcess.exitCode !== null) break
		await sleep(1000)
	}
	throw new Error(`Appium server did not start on :${appiumPort}; see .maestro-web/logs/android-appium.log`)
}

async function startLocalWebServer(serverPort) {
	fs.mkdirSync(logDir, { recursive: true })
	const url = `http://localhost:${serverPort}`
	if (await isServing(url)) return url
	const fd = fs.openSync(path.join(logDir, 'android-demo-compat.log'), 'w')
	serverProcess = spawn('npx', ['expo', 'start', '--web', '--localhost', '--port', String(serverPort)], {
		cwd: root,
		env: { ...process.env, BROWSER: 'none', EXPO_PUBLIC_DISABLE_ANALYTICS: '1' },
		stdio: ['ignore', fd, fd],
	})
	for (let i = 0; i < 120; i += 1) {
		if (await isServing(url)) return url
		if (serverProcess.exitCode !== null) break
		await sleep(1000)
	}
	throw new Error(`Expo web failed to start at ${url}; see .maestro-web/logs/android-demo-compat.log`)
}

async function isServing(url) {
	try {
		return (await fetch(url, { redirect: 'follow' })).ok
	} catch {
		return false
	}
}

function commandExists(command) {
	return spawnSync('sh', ['-lc', `command -v ${command}`], { stdio: 'ignore' }).status === 0
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}
