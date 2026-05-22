#!/usr/bin/env node
// REAL Mobile Safari WASM smoke on the iOS Simulator via Appium + XCUITest.
//
// This drives the actual Mobile Safari runtime (WebKit on iOS), not a
// Playwright desktop-WebKit viewport. Appium (appium-xcuitest-driver,
// WebDriverAgent) boots/attaches the Simulator, opens Safari, navigates to
// the local dev server, and runs the WASM+capability probe in the page's
// own web context via executeAsyncScript. Talks raw W3C WebDriver over
// fetch — no webdriverio dependency.
//
// Prereqs: Xcode + an iOS Simulator runtime; `appium` on PATH with the
// xcuitest driver installed (`appium driver install xcuitest`).
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const port = Number(process.env.PORT ?? '8082')
const appiumPort = Number(process.env.APPIUM_PORT ?? '4723')
const hostName = process.env.WEB_COMPAT_IOS_HOST ?? 'localhost'
const deviceName = process.env.WEB_COMPAT_IOS_DEVICE ?? 'iPhone 16'
// Default to a known-stable installed runtime. Letting Appium pick the
// newest (e.g. a just-released iOS 26.x) and cold-create a sim reliably
// half-boot-hangs; we pre-boot a stable sim ourselves instead.
const platformVersion = process.env.WEB_COMPAT_IOS_VERSION || '18.3'
const sessionTimeoutMs = Number(process.env.WEB_COMPAT_RESULT_TIMEOUT_MS ?? '600000')
const outputDir = path.resolve(root, process.env.WEB_COMPAT_OUTPUT_DIR ?? 'test-output/browser-compat')
const runsDir = path.join(outputDir, 'runs')
const logDir = path.join(root, '.maestro-web/logs')

let serverProcess = null
let appiumProcess = null
let sessionId = null
const appiumBase = `http://127.0.0.1:${appiumPort}`

const PROBE_SOURCE = String.raw`(async () => {
  const failures = [];
  const wasmHeader = new Uint8Array([0,97,115,109,1,0,0,0]);
  const capabilities = {
    userAgent: navigator.userAgent, platform: navigator.platform, language: navigator.language,
    secureContext: window.isSecureContext,
    webAssembly: typeof WebAssembly !== 'undefined',
    webAssemblyValidate: typeof WebAssembly !== 'undefined' && WebAssembly.validate(wasmHeader),
    worker: typeof Worker !== 'undefined', moduleWorker: false,
    blob: typeof Blob !== 'undefined', file: typeof File !== 'undefined',
    fileReader: typeof FileReader !== 'undefined', fileReaderSyncInWorker: false,
    fetch: typeof fetch === 'function', readableStream: typeof ReadableStream !== 'undefined',
    indexedDB: typeof indexedDB !== 'undefined', localStorage: false,
    cryptoSubtle: Boolean(globalThis.crypto && globalThis.crypto.subtle),
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    crossOriginIsolated: typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : false,
    failures,
  };
  try { var k='__p__'; localStorage.setItem(k,'1'); capabilities.localStorage = localStorage.getItem(k)==='1'; localStorage.removeItem(k); }
  catch (e) { failures.push('localStorage: ' + (e && e.message || e)); }
  const wasmBytes = new Uint8Array([0,97,115,109,1,0,0,0,1,7,1,96,2,127,127,1,127,3,2,1,0,7,7,1,3,97,100,100,0,0,10,9,1,7,0,32,0,32,1,106,11]);
  const wasmSmoke = { instantiated:false, callResult:null, error:null };
  try { const m = await WebAssembly.instantiate(wasmBytes, {}); wasmSmoke.instantiated = true; wasmSmoke.callResult = m.instance.exports.add(40,2); }
  catch (e) { wasmSmoke.error = e && e.message || String(e); failures.push('wasm: ' + wasmSmoke.error); }
  if (capabilities.worker && capabilities.blob) {
    const pw = (src,opts) => new Promise((res,rej)=>{ const u=URL.createObjectURL(new Blob([src],{type:'application/javascript'})); let w=null;
      const t=setTimeout(()=>{w&&w.terminate();URL.revokeObjectURL(u);rej(new Error('timeout'));},5000);
      try { w=new Worker(u,opts); w.onmessage=e=>{clearTimeout(t);w.terminate();URL.revokeObjectURL(u);res(e.data);}; w.onerror=e=>{clearTimeout(t);w.terminate();URL.revokeObjectURL(u);rej(new Error(e.message||'err'));}; }
      catch(e){clearTimeout(t);URL.revokeObjectURL(u);rej(e);} });
    capabilities.fileReaderSyncInWorker = await pw("self.postMessage({v:typeof FileReaderSync!=='undefined'})").then(d=>d.v).catch(()=>false);
    capabilities.moduleWorker = await pw("self.postMessage({v:true})",{type:'module'}).then(d=>d.v).catch(()=>false);
  }
  return { capabilities, wasmSmoke, errors: failures };
})()`

try {
	if (!commandExists('appium')) throw new Error('appium not on PATH. Install: npm i -g appium && appium driver install xcuitest')
	if (!commandExists('xcrun')) throw new Error('xcrun (Xcode) required.')

	const hostUrl = process.env.WEB_URL ?? (await startLocalWebServer(port))
	const target = `${hostUrl.replace(/\/$/, '')}/`

	await startAppium()

	const startedAt = new Date().toISOString()
	const caps = {
		platformName: 'iOS',
		'appium:automationName': 'XCUITest',
		browserName: 'Safari',
		// Expo's dev SPA never signals "load complete" to the WebKit remote
		// debugger, so the default strategy blocks navigation ~300s. Don't
		// wait for load events; our own DOM polling drives readiness.
		pageLoadStrategy: 'none',
		'appium:deviceName': deviceName,
		'appium:newCommandTimeout': 300,
		'appium:wdaLaunchTimeout': 600000,
		'appium:wdaConnectionTimeout': 600000,
		'appium:simulatorStartupTimeout': 600000,
		'appium:webviewConnectTimeout': 120000,
		'appium:safariInitialUrl': target,
		'appium:noReset': true,
	}
	// Always pin a version and attach to a pre-booted sim (env UDID, or one
	// we find/create + fully boot here) so Appium never cold-creates a
	// flaky just-released-iOS sim that half-boot-hangs.
	caps['appium:platformVersion'] = platformVersion
	caps['appium:udid'] = ensureBootedSim(platformVersion, deviceName)

	const created = await w3c('POST', '/session', { capabilities: { alwaysMatch: caps, firstMatch: [{}] } })
	sessionId = created.value.sessionId
	// W3C async-script timeout defaults to ~0ms in XCUITest -> set it
	// generously so the WASM/worker probe can complete.
	await w3c('POST', `/session/${sessionId}/timeouts`, { script: sessionTimeoutMs, pageLoad: 10000, implicit: 0 })
	const negotiated = created.value.capabilities ?? {}
	const iosVersion = String(negotiated.platformVersion ?? platformVersion ?? 'unknown')
	const device = String(negotiated.deviceName ?? deviceName)

	const baseUrl = hostUrl.replace(/\/$/, '')
	const wantUrl = new URL(baseUrl)
	const acceptedHosts = new Set([
		wantUrl.host,
		`localhost:${wantUrl.port}`,
		`127.0.0.1:${wantUrl.port}`,
	])
	const evalSync = (script) =>
		w3c('POST', `/session/${sessionId}/execute/sync`, { script, args: [] }).then((r) => r.value)
	const waitForOrigin = async (label) => {
		const dl = Date.now() + 120000
		while (Date.now() < dl) {
			const onOrigin = await evalSync(
				`return ${JSON.stringify([...acceptedHosts])}.includes(location.host) && !!document.body`,
			).catch(() => false)
			if (onOrigin) return
			await sleep(1500)
		}
		throw new Error(`Mobile Safari never reached ${label} (${[...acceptedHosts].join(' or ')})`)
	}

	// 1) Seed onboarding-accepted, then load the lab (getting-started view).
	await w3c('POST', `/session/${sessionId}/url`, { url: `${baseUrl}/` })
	await waitForOrigin('app root')
	await evalSync(
		"try{localStorage.setItem('biovault-webdb:app_preferences', JSON.stringify([{key:'hasAcceptedResearchDisclaimer',value:'true'},{key:'hasCompletedOnboarding',value:'true'}]));}catch(e){} return true;",
	)
	await w3c('POST', `/session/${sessionId}/url`, { url: `${baseUrl}/lab` })
	await waitForOrigin('lab route')

	// 2) Capability probe (diagnostics only; PASS criterion is the report).
	const probe = await w3c('POST', `/session/${sessionId}/execute/async`, {
		script:
			'var cb = arguments[arguments.length - 1];' +
			`(${PROBE_SOURCE}).then(function(r){cb(r)}).catch(function(e){cb({error:String(e && e.message || e)})});`,
		args: [],
	}).then((r) => r.value).catch((e) => ({ error: String(e) }))
	const probeCaps = probe.capabilities ?? {}

	// 3) Click the real demo run button -> Monty + bioscript-wasm process
	//    the bundled demo genome through the actual app pipeline.
	const sel = '[aria-label="Run 23andMe + Drug Interactions Example"]'
	const ELKEY = 'element-6066-11e4-a52e-4f735466cecf'
	let elId = null
	const findDeadline = Date.now() + 90000
	while (Date.now() < findDeadline) {
		const found = await w3c('POST', `/session/${sessionId}/element`, { using: 'css selector', value: sel }).catch(() => null)
		elId = found && (found.value?.[ELKEY] ?? found.value?.ELEMENT)
		if (elId) break
		await sleep(2000)
	}
	if (!elId) throw new Error('Demo run button not found in real Mobile Safari (getting-started view did not render).')
	await w3c('POST', `/session/${sessionId}/element/${elId}/click`, {})

	// 4) Poll the real report to completion (demo genome -> artifacts).
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
			throw new Error(`Demo run FAILED in real Mobile Safari: ${bodyText.replace(/\s+/g, ' ').slice(0, 300)}`)
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

	// 5) Click "View result" and verify the artifacts view lists the files.
	const clicked = await evalSync(
		"var els=Array.from(document.querySelectorAll('a,button,[role=button],div,span'));" +
			"var t=els.filter(function(e){return (e.innerText||e.textContent||'').trim()==='View result';});" +
			"if(!t.length)return false;var e=t[t.length-1];" +
			"(e.closest('[role=button]')||e).click();return true;",
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
		id: `ios-sim-${device.replace(/\s+/g, '-')}-${Date.now()}`,
		startedAt,
		finishedAt,
		durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
		status: ok ? 'passed' : 'failed',
		projectName: 'ios-sim',
		sampleId: 'demo-pgx-report',
		browserName: 'mobile-safari',
		browserVersion: probeCaps.userAgent?.match(/Version\/([0-9._]+)/)?.[1] ?? iosVersion,
		engine: 'webkit',
		os: { platform: 'ios', release: iosVersion, arch: os.arch() },
		deviceProfile: device,
		compatibilitySource: 'ios-sim-appium',
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
		`\nREAL Mobile Safari (iOS Simulator) — ${device} (iOS ${iosVersion})\n` +
			`  status:        ${result.status}\n` +
			`  safari:        ${result.browserVersion}\n` +
			`  demo report:   ${result.reportRunStatus} (${savedCount} artifacts saved; processed demo genome via Monty + bioscript-wasm)\n` +
			`  artifacts:     ${result.artifactValidationStatus} [${presentArtifacts.join(', ')}]\n` +
			`  secureCtx:     ${probeCaps.secureContext}  sharedArrayBuffer=${probeCaps.sharedArrayBuffer}  crossOriginIsolated=${probeCaps.crossOriginIsolated}\n` +
			(result.failureMessage ? `  failure:       ${result.failureMessage}\n` : ''),
	)
	process.exit(ok ? 0 : 1)
} catch (error) {
	console.error(error instanceof Error ? error.stack : String(error))
	process.exit(1)
} finally {
	if (sessionId) {
		await w3c('DELETE', `/session/${sessionId}`).catch(() => {})
	}
	if (appiumProcess) appiumProcess.kill()
	if (serverProcess) serverProcess.kill()
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
	const fd = fs.openSync(path.join(logDir, 'ios-appium.log'), 'w')
	appiumProcess = spawn('appium', ['--port', String(appiumPort), '--log-level', 'info', '--relaxed-security'], {
		cwd: root,
		stdio: ['ignore', fd, fd],
	})
	for (let i = 0; i < 60; i += 1) {
		try {
			const r = await fetch(`${appiumBase}/status`)
			if (r.ok) return
		} catch {
			// not up yet
		}
		if (appiumProcess.exitCode !== null) break
		await sleep(1000)
	}
	throw new Error(`Appium server did not start on :${appiumPort}; see .maestro-web/logs/ios-appium.log`)
}

async function startLocalWebServer(serverPort) {
	fs.mkdirSync(logDir, { recursive: true })
	const targetUrl = `http://${hostName}:${serverPort}`
	const localUrl = `http://localhost:${serverPort}`
	if ((await isServing(targetUrl)) || (await isServing(localUrl))) return targetUrl
	const fd = fs.openSync(path.join(logDir, 'ios-web-compat.log'), 'w')
	serverProcess = spawn('npx', ['expo', 'start', '--web', '--localhost', '--port', String(serverPort)], {
		cwd: root,
		env: { ...process.env, BROWSER: 'none', EXPO_PUBLIC_DISABLE_ANALYTICS: '1' },
		stdio: ['ignore', fd, fd],
	})
	for (let i = 0; i < 120; i += 1) {
		if ((await isServing(targetUrl)) || (await isServing(localUrl))) return targetUrl
		if (serverProcess.exitCode !== null) break
		await sleep(1000)
	}
	throw new Error(`Expo web failed to start at ${targetUrl}; see .maestro-web/logs/ios-web-compat.log`)
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

// Resolve a usable, fully-booted iOS Simulator UDID. Honors
// WEB_COMPAT_IOS_UDID; otherwise finds (or creates) a device on the
// requested runtime and boots it to completion before Appium attaches.
function ensureBootedSim(version, devName) {
	if (process.env.WEB_COMPAT_IOS_UDID) return process.env.WEB_COMPAT_IOS_UDID
	const xc = (args, timeout) => spawnSync('xcrun', args, { encoding: 'utf8', timeout })
	const runtimes = JSON.parse(xc(['simctl', 'list', 'runtimes', '-j']).stdout || '{}').runtimes.filter(
		(r) => r.isAvailable && /iOS/.test(r.name),
	)
	if (!runtimes.length) throw new Error('No available iOS Simulator runtimes. Install one via Xcode.')
	const want = String(version).replace(/\./g, '-')
	const rt =
		runtimes.find((r) => r.version === version || r.identifier.includes(want)) ??
		runtimes[runtimes.length - 1]
	const devices = JSON.parse(xc(['simctl', 'list', 'devices', '-j']).stdout || '{}').devices[rt.identifier] ?? []
	let dev = devices.find((d) => d.isAvailable && d.name === devName)
	let udid = dev?.udid
	if (!udid) {
		const created = xc(['simctl', 'create', `wc-${devName.replace(/\s+/g, '-')}-${rt.version}`, devName, rt.identifier])
		udid = (created.stdout || '').trim()
		if (created.status !== 0 || !udid) throw new Error(`Failed to create simulator: ${created.stderr || created.stdout}`)
	}
	if ((dev?.state ?? 'Shutdown') !== 'Booted') xc(['simctl', 'boot', udid])
	const bs = xc(['simctl', 'bootstatus', udid, '-b'], 360000)
	if (bs.status !== 0) throw new Error(`Simulator ${udid} (${devName} ${rt.version}) failed to boot: ${bs.stderr || bs.stdout}`)
	console.log(`Using iOS Simulator: ${devName} — iOS ${rt.version} (udid ${udid})`)
	return udid
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}
