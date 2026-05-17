import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect, type Browser, type Page, type TestInfo } from '@playwright/test'
import {
	assertArtifactData,
	caseTimeoutFor,
	getDefaultReportMatrixConfig,
	loadSampleCases,
	prepareLabReportCase,
	readArtifacts,
	runPackageAndOpenResult,
	type SampleCase,
} from './lab-report-matrix-helpers'

const DEFAULT_SAMPLE_ID = '23andme-v5-hu50B3F5'
const OUTPUT_DIR = path.resolve(process.env.WEB_COMPAT_OUTPUT_DIR ?? path.resolve(__dirname, '..', 'test-output/browser-compat'))
const RUNS_DIR = path.join(OUTPUT_DIR, 'runs')
const RESULTS_JSON = path.join(OUTPUT_DIR, 'results.json')
const RESULTS_MD = path.join(OUTPUT_DIR, 'results.md')

type CapabilityProbe = {
	userAgent: string
	platform: string
	language: string
	secureContext: boolean
	webAssembly: boolean
	webAssemblyValidate: boolean
	worker: boolean
	moduleWorker: boolean
	blob: boolean
	file: boolean
	fileReader: boolean
	fileReaderSyncInWorker: boolean
	fetch: boolean
	readableStream: boolean
	indexedDB: boolean
	localStorage: boolean
	cryptoSubtle: boolean
	failures: string[]
}

type CompatResult = {
	id: string
	startedAt: string
	finishedAt?: string
	durationMs?: number
	status: 'started' | 'passed' | 'failed' | 'skipped'
	projectName: string
	sampleId: string
	browserName: string
	browserVersion: string
	engine: string
	os: {
		platform: string
		release: string
		arch: string
	}
	deviceProfile: string
	compatibilitySource: 'local-playwright' | 'remote-provider'
	remoteTargetId?: string
	remotePlatform?: string
	remoteBrowser?: string
	remoteBrowserVersionLabel?: string
	remoteDeviceName?: string
	remoteOsVersion?: string
	capabilities?: CapabilityProbe
	reportRunStatus: 'not-started' | 'passed' | 'failed'
	artifactValidationStatus: 'not-started' | 'passed' | 'failed'
	artifactNames?: string[]
	failureMessage?: string
	consoleErrors: string[]
}

const config = getDefaultReportMatrixConfig()
const sampleId = process.env.WEB_COMPAT_SAMPLE_ID ?? DEFAULT_SAMPLE_ID
const caseDef = loadSampleCases(config).find((item) => item.id === sampleId)

test.describe('lab WASM browser compatibility', () => {
	test(`${sampleId} demo/report happy path`, async ({ page, browser }, testInfo) => {
		test.skip(!caseDef, `missing compatibility sample: ${sampleId}`)
		installLegacyLocatorCompat(page)
		const selectedCase = caseDef!
		const requestedBrowser = process.env.WEB_COMPAT_BROWSER?.toLowerCase()
		const browserName = resultBrowserName(browser, testInfo)
		test.skip(
			Boolean(requestedBrowser) &&
				!testInfo.project.name.toLowerCase().includes(requestedBrowser!) &&
				browserName !== requestedBrowser,
			`WEB_COMPAT_BROWSER=${requestedBrowser} does not match ${testInfo.project.name}`,
		)
		testInfo.setTimeout(Number(process.env.WEB_COMPAT_RESULT_TIMEOUT_MS ?? caseTimeoutFor(selectedCase)))
		const started = Date.now()
		const errors = capturePageErrors(page)
		const result = baseResult(browser, testInfo, selectedCase)

		try {
			const missing = selectedCase.inputFiles.find((file) => !fs.existsSync(file))
			test.skip(Boolean(missing), `missing fixture: ${missing}`)
			test.skip(!fs.existsSync(selectedCase.packageZip), `missing package zip: ${selectedCase.packageZip}`)

			await page.goto(process.env.WEB_URL ?? 'http://localhost:8081', { waitUntil: 'domcontentloaded' })
			result.capabilities = await runCapabilityProbe(page)

			await prepareLabReportCase(page, selectedCase, config)
			await runPackageAndOpenResult(page, selectedCase, Number(process.env.WEB_COMPAT_RESULT_TIMEOUT_MS ?? 600_000))
			result.reportRunStatus = 'passed'

			const requiredArtifacts = config.requireArtifacts ?? ['observations.tsv', 'analysis.jsonl', 'reports.jsonl', 'index.html']
			for (const artifact of requiredArtifacts) {
				await expect(page.getByRole('link', { name: artifact })).toBeVisible()
			}
			const reportFrame = page.frameLocator('iframe[title="index.html"]')
			for (const expected of selectedCase.htmlContains) {
				await expect(textLocator(reportFrame, expected).first()).toBeVisible({ timeout: 30_000 })
			}
			const artifacts = await readArtifacts(page, requiredArtifacts)
			assertArtifactData(selectedCase, artifacts, {
				strictSampleRows: process.env.WEB_COMPAT_STRICT_ARTIFACTS === '1',
			})
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
			await page.screenshot({
				path: path.join(testInfo.outputDir, `compat-${testInfo.project.name}-${selectedCase.id}.png`),
				fullPage: true,
			}).catch(() => undefined)
			writeCompatResult(result)
		}
	})
})

function capturePageErrors(page: Page): string[] {
	const errors: string[] = []
	page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
	page.on('console', (msg) => {
		if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`)
	})
	return errors
}

function baseResult(browser: Browser, testInfo: TestInfo, selectedCase: SampleCase): CompatResult {
	const browserName = resultBrowserName(browser, testInfo)
	const engine = playwrightEngine(browser, testInfo)
	return {
		id: `${testInfo.project.name}-${selectedCase.id}-${Date.now()}`,
		startedAt: new Date().toISOString(),
		status: 'started',
		projectName: testInfo.project.name,
		sampleId: selectedCase.id,
		browserName,
		browserVersion: browser.version(),
		engine,
		os: {
			platform: process.platform,
			release: os.release(),
			arch: process.arch,
		},
		deviceProfile: testInfo.project.name,
		compatibilitySource: process.env.PW_CONNECT_WS_ENDPOINT ? 'remote-provider' : 'local-playwright',
		remoteTargetId: process.env.WEB_COMPAT_REMOTE_TARGET_ID,
		remotePlatform: process.env.WEB_COMPAT_REMOTE_PLATFORM,
		remoteBrowser: process.env.WEB_COMPAT_REMOTE_BROWSER,
		remoteBrowserVersionLabel: process.env.WEB_COMPAT_REMOTE_BROWSER_VERSION,
		remoteDeviceName: process.env.WEB_COMPAT_REMOTE_DEVICE_NAME,
		remoteOsVersion: process.env.WEB_COMPAT_REMOTE_OS_VERSION,
		reportRunStatus: 'not-started',
		artifactValidationStatus: 'not-started',
		consoleErrors: [],
	}
}

function resultBrowserName(browser: Browser, testInfo: TestInfo): string {
	const remoteBrowser = process.env.WEB_COMPAT_REMOTE_BROWSER?.trim()
	if (process.env.PW_CONNECT_WS_ENDPOINT && remoteBrowser) return remoteBrowser.toLowerCase()
	return playwrightEngine(browser, testInfo)
}

function playwrightEngine(browser: Browser, testInfo: TestInfo): string {
	const browserType = (browser as Browser & { browserType?: () => { name: () => string } }).browserType?.()
	return browserType?.name?.() ?? engineFromProject(testInfo.project.name) ?? 'unknown'
}

function engineFromProject(projectName: string): string | undefined {
	const normalized = projectName.toLowerCase()
	if (normalized.includes('firefox')) return 'firefox'
	if (normalized.includes('webkit')) return 'webkit'
	if (normalized.includes('chromium')) return 'chromium'
	return projectName.split('-')[0] || undefined
}

async function runCapabilityProbe(page: Page): Promise<CapabilityProbe> {
	return page.evaluate(async () => {
		const failures: string[] = []
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

		function runWorkerProbe(source: string, options?: WorkerOptions): Promise<Record<string, boolean>> {
			return new Promise((resolve, reject) => {
				const url = URL.createObjectURL(new Blob([source], { type: 'application/javascript' }))
				let worker: Worker | null = null
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
						resolve(event.data as Record<string, boolean>)
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

function writeCompatResult(result: CompatResult) {
	fs.mkdirSync(RUNS_DIR, { recursive: true })
	const safeId = result.id.replace(/[^a-z0-9_.-]+/gi, '-')
	fs.writeFileSync(path.join(RUNS_DIR, `${safeId}.json`), `${JSON.stringify(result, null, 2)}\n`)

	const runs = fs.readdirSync(RUNS_DIR)
		.filter((file) => file.endsWith('.json'))
		.map((file) => JSON.parse(fs.readFileSync(path.join(RUNS_DIR, file), 'utf8')) as CompatResult)
		.sort((left, right) => left.startedAt.localeCompare(right.startedAt))

	fs.writeFileSync(RESULTS_JSON, `${JSON.stringify(runs, null, 2)}\n`)
	fs.writeFileSync(RESULTS_MD, renderMarkdownSummary(runs))
}

function renderMarkdownSummary(results: CompatResult[]): string {
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
		...rows.map((cells) => `| ${cells.map(escapeMarkdownCell).join(' | ')} |`),
		'',
	].join('\n')
}

function formatOsForSummary(value: CompatResult['os']): string {
	return [value.platform, value.release].filter(Boolean).join(' ')
}

function escapeMarkdownCell(value: string): string {
	return value.replace(/\|/g, '\\|')
}

function formatFailureForSummary(value?: string): string {
	const compact = String(value ?? '')
		.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
	const maxLength = 240
	return compact.length > maxLength ? `${compact.slice(0, maxLength - 1)}...` : compact
}

function installLegacyLocatorCompat(page: Page) {
	const locatorPrototype = Object.getPrototypeOf(page.locator('body'))
	const patchTarget = (target: Record<string, unknown>) => {
		target.getByText ??= function getByTextCompat(this: { locator: (selector: string) => unknown }, text: string | RegExp, options?: { exact?: boolean }) {
			return this.locator(textSelector(text, options))
		}
		target.getByRole ??= function getByRoleCompat(this: { locator: (selector: string) => unknown }, role: string, options?: { name?: string | RegExp }) {
			return this.locator(roleSelector(role, options?.name))
		}
		target.getByLabel ??= function getByLabelCompat(this: { locator: (selector: string) => unknown }, label: string | RegExp) {
			return this.locator(labelSelector(label))
		}
		target.getByTestId ??= function getByTestIdCompat(this: { locator: (selector: string) => unknown }, testId: string) {
			return this.locator(`[data-testid=${cssString(testId)}]`)
		}
	}
	patchTarget(page as unknown as Record<string, unknown>)
	patchTarget(locatorPrototype as Record<string, unknown>)
}

function textLocator(scope: { getByText?: (text: string, options?: { exact?: boolean }) => unknown; locator: (selector: string) => unknown }, text: string) {
	return scope.getByText ? scope.getByText(text, { exact: false }) : scope.locator(textSelector(text, { exact: false }))
}

function textSelector(text: string | RegExp, options: { exact?: boolean } = {}) {
	if (text instanceof RegExp) return `text=${text}`
	if (options.exact) return `text=${JSON.stringify(text)}`
	return `text=${text}`
}

function roleSelector(role: string, name?: string | RegExp) {
	const bases = role === 'button'
		? ['button', '[role="button"]']
		: role === 'link'
			? ['a', '[role="link"]']
			: [`[role=${cssString(role)}]`]
	if (!name) return bases.join(', ')
	const names = name instanceof RegExp ? regexAlternatives(name) : [name]
	return bases.flatMap((base) => names.map((value) => `${base}:has-text(${cssString(value)})`)).join(', ')
}

function labelSelector(label: string | RegExp) {
	const labels = label instanceof RegExp ? regexAlternatives(label) : [label]
	return labels.map((value) => `[aria-label=${cssString(value)}]`).join(', ')
}

function regexAlternatives(value: RegExp) {
	return value.source.replace(/^\^/, '').replace(/\$$/, '').split('|').filter(Boolean)
}

function cssString(value: string) {
	return JSON.stringify(value)
}
