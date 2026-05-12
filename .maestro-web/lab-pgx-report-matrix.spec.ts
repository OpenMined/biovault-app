import fs from 'node:fs'
import path from 'node:path'
import { test, expect, type Page, type TestInfo } from '@playwright/test'
import { parse } from 'yaml'
import { webReportMatrixScenarios } from '../tests/lab-scenarios'

const BASE_URL = process.env.WEB_URL ?? 'http://localhost:8081'
const REPO_ROOT = path.resolve(__dirname, '..')
const DEFAULT_SCENARIO_ID = 'web-pgx-1-report-browser-matrix'

type ReportMatrixConfig = NonNullable<(typeof webReportMatrixScenarios)[number]['reportMatrix']>

type SampleCase = {
	id: string
	sourceFile: string
	inputFiles: string[]
	assertions: {
		observationMinRows: number
		reportMinRows: number
		reportStatuses: string[]
		reportContains: Array<{ path: string; equals?: unknown; contains?: string; exists?: boolean }>
		observationRows: Array<Record<string, unknown>>
	}
}

type ArtifactMap = Map<string, string>

function resolvePath(value: string, baseDir = REPO_ROOT): string {
	const expanded = value.replace(/^~/, process.env.HOME ?? '~')
	return path.isAbsolute(expanded) ? expanded : path.join(baseDir, expanded)
}

function bytesForFiles(files: string[]): number {
	return files.reduce((total, file) => total + fs.statSync(file).size, 0)
}

function loadSampleCases(config: ReportMatrixConfig): SampleCase[] {
	const files = [config.samplesFile]
	const includePrivate = process.env.WEB_REPORT_NO_PRIVATE !== '1'
	if (includePrivate && config.privateSamplesFile && fs.existsSync(resolvePath(config.privateSamplesFile))) {
		files.push(config.privateSamplesFile)
	}

	const cases: SampleCase[] = []
	for (const relativeFile of files) {
		const sourceFile = resolvePath(relativeFile)
		const doc = parse(fs.readFileSync(sourceFile, 'utf8')) as {
			defaults?: Record<string, unknown>
			samples?: Array<Record<string, unknown>>
		}
		const defaults = doc.defaults ?? {}
		for (const sample of doc.samples ?? []) {
			const id = String(sample.id ?? '')
			const inputFile = sample.input_file ? resolvePath(String(sample.input_file), path.dirname(sourceFile)) : ''
			const optionalFiles = ['input_index', 'reference_file', 'reference_index']
				.map((key) => sample[key])
				.filter(Boolean)
				.map((value) => resolvePath(String(value), path.dirname(sourceFile)))
			cases.push({
				id,
				sourceFile,
				inputFiles: [inputFile, ...optionalFiles],
				assertions: mergedAssertions(defaults.assertions, sample.assertions, config),
			})
		}
	}
	return cases
}

function mergedAssertions(defaultValue: unknown, sampleValue: unknown, config: ReportMatrixConfig): SampleCase['assertions'] {
	const defaults = isRecord(defaultValue) ? defaultValue : {}
	const sample = isRecord(sampleValue) ? sampleValue : {}
	const observations = { ...(isRecord(defaults.observations) ? defaults.observations : {}), ...(isRecord(sample.observations) ? sample.observations : {}) }
	const reports = { ...(isRecord(defaults.reports) ? defaults.reports : {}), ...(isRecord(sample.reports) ? sample.reports : {}) }
	const configuredStatuses = config.reportStatus ?? []
	const requireStatus = reports.require_status ?? configuredStatuses
	return {
		observationMinRows: Number(observations.min_rows ?? 0),
		reportMinRows: Number(reports.min_rows ?? 0),
		reportStatuses: Array.isArray(requireStatus) ? requireStatus.map(String) : requireStatus ? [String(requireStatus)] : [],
		reportContains: Array.isArray(reports.contains) ? reports.contains.filter(isRecord).map((item) => ({ ...item, path: String(item.path) })) : [],
		observationRows: Array.isArray(observations.rows) ? observations.rows.filter(isRecord) : [],
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

async function dismissDisclaimer(page: Page) {
	const understand = page.getByText('I understand and want to continue', { exact: false })
	if (await understand.isVisible().catch(() => false)) {
		await understand.click()
		await page.getByText(/^Continue$/).click({ timeout: 10_000 })
	}
}

async function dismissRememberFilesPrompt(page: Page) {
	const notNow = page.getByText('Not now', { exact: true })
	if (await notNow.isVisible({ timeout: 5_000 }).catch(() => false)) {
		await notNow.click()
	}
}

async function routePgxPackageZipToLocalFile(page: Page, config: ReportMatrixConfig) {
	const packageZip = resolvePath(config.packageZip)
	await page.route(config.packageUrl, async (route) => {
		await route.fulfill({ body: fs.readFileSync(packageZip), contentType: 'application/zip' })
	})
}

async function dragFilesIntoLab(page: Page, files: string[]) {
	const payload = files.map((file) => ({
		name: path.basename(file),
		type: mimeTypeFor(file),
		base64: fs.readFileSync(file).toString('base64'),
	}))
	const dataTransfer = await page.evaluateHandle((items) => {
		const dt = new DataTransfer()
		for (const item of items) {
			const bin = atob(item.base64)
			const bytes = new Uint8Array(bin.length)
			for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
			dt.items.add(new File([bytes], item.name, { type: item.type }))
		}
		return dt
	}, payload)
	await page.dispatchEvent('body', 'dragenter', { dataTransfer })
	await page.dispatchEvent('body', 'dragover', { dataTransfer })
	await page.dispatchEvent('body', 'drop', { dataTransfer })
	await dismissRememberFilesPrompt(page)
}

async function chooseFilesIntoLab(page: Page, files: string[]) {
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

function mimeTypeFor(file: string): string {
	const lower = file.toLowerCase()
	if (lower.endsWith('.zip')) return 'application/zip'
	if (lower.endsWith('.gz')) return 'application/gzip'
	if (lower.endsWith('.json') || lower.endsWith('.jsonl')) return 'application/json'
	if (lower.endsWith('.html')) return 'text/html'
	return 'application/octet-stream'
}

async function loadPgxPackageZipFromUrl(page: Page, config: ReportMatrixConfig) {
	await page.evaluate((url) => {
		window.location.hash = `url=${encodeURIComponent(url)}`
	}, config.packageUrl)
	await expect(page.getByText(/Fetch this URL\?|Load this file URL\?/)).toBeVisible({ timeout: 30_000 })
	const loadAction = page.getByText(/Fetch URL|Load file/, { exact: true })
	await expect(loadAction).toBeVisible({ timeout: 30_000 })
	await loadAction.click()
	await expect(page.getByText(/33 fetched variants ready\.|PGx-1 Panel/).first()).toBeVisible({ timeout: 60_000 })
	const done = page.getByText('Done', { exact: true }).first()
	if (await done.isVisible({ timeout: 10_000 }).catch(() => false)) {
		await done.click()
	}
}

async function runPgxAndOpenResult(page: Page) {
	const resultTimeout = Number(process.env.WEB_REPORT_RESULT_TIMEOUT_MS ?? 600_000)
	await expect(page.getByText('PGx-1 Panel', { exact: true }).first()).toBeVisible({ timeout: 60_000 })
	const runButton = page.getByText(/Run panel|Run assay/, { exact: true }).first()
	await expect(runButton).toBeVisible({ timeout: 60_000 })
	await runButton.click()
	await expect(page.getByText('Latest result')).toBeVisible({ timeout: resultTimeout })
	await expect(async () => {
		const bodyText = await page.locator('body').innerText({ timeout: 10_000 })
		expect(bodyText).not.toContain('Run failed')
		expect(bodyText).not.toContain('unreachable')
		expect(bodyText).toContain('4 result artifacts saved locally.')
	}).toPass({
		timeout: resultTimeout,
		intervals: [1_000, 3_000, 5_000, 10_000],
	})
	await page.getByText('View result', { exact: true }).click()
	await expect(page.getByText('ARTIFACTS', { exact: true })).toBeVisible({ timeout: 30_000 })
}

async function expectLoadedGenome(page: Page, filePath: string) {
	const name = path.basename(filePath)
	await expect(page.getByText('LOADED GENOME', { exact: true })).toBeVisible({ timeout: 60_000 })
	await expect(page.getByText(name, { exact: true }).last()).toBeVisible({ timeout: 60_000 })
	await expect(page.getByText('Genome complete', { exact: true })).toBeVisible({ timeout: 60_000 })
}

async function expectReportScrollsAndDisplays(page: Page, caseId: string, testInfo: TestInfo) {
	const iframe = page.locator('iframe[title="index.html"]')
	await expect(iframe).toBeVisible({ timeout: 30_000 })
	const handle = await iframe.elementHandle()
	const frame = await handle?.contentFrame()
	if (!frame) throw new Error('index.html iframe did not expose a content frame')

	await expect(frame.locator('body')).not.toHaveText('', { timeout: 30_000 })
	await expect(frame.getByText('Observations', { exact: true }).first()).toBeVisible({ timeout: 30_000 })
	await expect(frame.getByText('Analysis', { exact: true }).first()).toBeVisible({ timeout: 30_000 })

	const metrics = await frame.evaluate(() => {
		const doc = document.documentElement
		return {
			clientHeight: doc.clientHeight,
			scrollHeight: doc.scrollHeight,
			scrollWidth: doc.scrollWidth,
			clientWidth: doc.clientWidth,
		}
	})
	expect(metrics.scrollHeight, `${caseId} report should be vertically scrollable`).toBeGreaterThan(metrics.clientHeight)
	expect(metrics.scrollWidth, `${caseId} report should not require horizontal scrolling`).toBeLessThanOrEqual(metrics.clientWidth + 8)

	for (const position of ['top', 'middle', 'bottom'] as const) {
		await frame.evaluate((target) => {
			const doc = document.documentElement
			const max = Math.max(0, doc.scrollHeight - doc.clientHeight)
			const top = target === 'top' ? 0 : target === 'middle' ? Math.floor(max / 2) : max
			window.scrollTo(0, top)
		}, position)
		await page.waitForTimeout(200)
		const viewportText = await frame.evaluate(() => {
			const samples: string[] = []
			const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT)
			while (walker.nextNode()) {
				const element = walker.currentNode as HTMLElement
				const rect = element.getBoundingClientRect()
				if (rect.bottom <= 0 || rect.top >= window.innerHeight || rect.width <= 0 || rect.height <= 0) continue
				const text = element.innerText?.trim()
				if (text) samples.push(text)
				if (samples.join('\n').length > 300) break
			}
			return samples.join('\n')
		})
		expect(viewportText, `${caseId} report ${position} viewport should contain visible text`).not.toHaveLength(0)
		await iframe.screenshot({
			path: path.join(testInfo.outputDir, `report-${caseId}-${position}.png`),
		})
	}
}

async function readArtifacts(page: Page, names: string[]): Promise<ArtifactMap> {
	const entries = await page.evaluate(async (artifactNames) => {
		const rows: Array<[string, string]> = []
		for (const name of artifactNames) {
			const link = Array.from(document.querySelectorAll('a')).find((node) => node.textContent?.trim() === name) as HTMLAnchorElement | undefined
			if (!link?.href) throw new Error(`missing artifact link: ${name}`)
			rows.push([name, await fetch(link.href).then((response) => response.text())])
		}
		return rows
	}, names)
	return new Map(entries)
}

function parseTsv(text: string): Array<Record<string, string>> {
	const lines = text.trim().split(/\r?\n/)
	const headers = lines.shift()?.split('\t') ?? []
	return lines.filter(Boolean).map((line) => {
		const cells = line.split('\t')
		return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']))
	})
}

function parseJsonl(text: string): Array<Record<string, unknown>> {
	return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>)
}

function valuesAtPath(value: unknown, pathText: string): unknown[] {
	let current = [value]
	for (const part of pathText.split('.')) {
		const isList = part.endsWith('[]')
		const key = isList ? part.slice(0, -2) : part
		const next: unknown[] = []
		for (const item of current) {
			if (!isRecord(item) || !(key in item)) continue
			const child = item[key]
			if (isList && Array.isArray(child)) next.push(...child)
			else next.push(child)
		}
		current = next
	}
	return current
}

function rowMatches(row: Record<string, string>, expected: Record<string, unknown>): boolean {
	return Object.entries(expected).every(([key, expectedValue]) => {
		const actual = row[key] ?? row[observationColumnAlias(key)]
		return Array.isArray(expectedValue)
			? expectedValue.map(String).includes(actual)
			: actual === String(expectedValue)
	})
}

function observationColumnAlias(key: string): string {
	if (key === 'genotype_display') return 'genotype'
	return key
}

function reportMatches(report: Record<string, unknown>, expected: SampleCase['assertions']['reportContains'][number]): boolean {
	const values = valuesAtPath(report, expected.path)
	if ('equals' in expected) return values.some((value) => value === expected.equals)
	if ('contains' in expected) return values.some((value) => String(value).includes(String(expected.contains)))
	if ('exists' in expected) return Boolean(values.length) === Boolean(expected.exists)
	return false
}

function assertArtifactData(caseDef: SampleCase, artifacts: ArtifactMap) {
	const observations = parseTsv(artifacts.get('observations.tsv') ?? '')
	const reports = parseJsonl(artifacts.get('reports.jsonl') ?? '')
	expect(observations.length, `${caseDef.id} observation rows`).toBeGreaterThanOrEqual(caseDef.assertions.observationMinRows)
	expect(reports.length, `${caseDef.id} report rows`).toBeGreaterThanOrEqual(caseDef.assertions.reportMinRows)
	for (const status of caseDef.assertions.reportStatuses) {
		expect(status).toBeTruthy()
	}
	if (caseDef.assertions.reportStatuses.length) {
		for (const report of reports) {
			expect(caseDef.assertions.reportStatuses).toContain(String(report.report_status))
		}
	}
	if (process.env.WEB_REPORT_STRICT_SAMPLE_ROWS === '1') {
		for (const expected of caseDef.assertions.observationRows) {
			expect(observations.some((row) => rowMatches(row, expected)), `${caseDef.id} observation ${JSON.stringify(expected)}`).toBe(true)
		}
	}
	for (const expected of caseDef.assertions.reportContains) {
		expect(reports.some((report) => reportMatches(report, expected)), `${caseDef.id} report ${JSON.stringify(expected)}`).toBe(true)
	}
}

function caseTimeoutFor(caseDef: SampleCase): number {
	if (process.env.WEB_REPORT_CASE_TIMEOUT_MS) return Number(process.env.WEB_REPORT_CASE_TIMEOUT_MS)
	const hasCram = caseDef.inputFiles.some((file) => file.toLowerCase().endsWith('.cram'))
	return hasCram ? 900_000 : 300_000
}

const scenario = webReportMatrixScenarios.find((item) => item.id === DEFAULT_SCENARIO_ID)
test.skip(!scenario?.reportMatrix, `missing scenario: ${DEFAULT_SCENARIO_ID}`)

const config = scenario?.reportMatrix
const cases = config ? loadSampleCases(config) : []

test.describe('lab PGx-1 report matrix — web scenario', () => {
	for (const caseDef of cases) {
		test(`${caseDef.id} via browser file input`, async ({ page }, testInfo) => {
			testInfo.setTimeout(caseTimeoutFor(caseDef))
			const missing = caseDef.inputFiles.find((file) => !fs.existsSync(file))
			test.skip(Boolean(missing), `missing fixture: ${missing}`)
			const maxBytes = Number(process.env.WEB_REPORT_MAX_DRAG_BYTES ?? config?.maxDragBytes ?? 268_435_456)
			const totalBytes = bytesForFiles(caseDef.inputFiles)
			const useDragDrop = totalBytes <= maxBytes

			const errors: string[] = []
			page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
			page.on('console', (msg) => {
				if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`)
			})

			test.skip(!fs.existsSync(resolvePath(config!.packageZip)), `missing PGx package zip: ${config!.packageZip}`)
			await routePgxPackageZipToLocalFile(page, config!)
			await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
			await dismissDisclaimer(page)
			await page.goto(`${BASE_URL}/lab`, { waitUntil: 'domcontentloaded' })
			await expect(page.getByText('Import genome', { exact: true })).toBeVisible({ timeout: 30_000 })
			if (useDragDrop) {
				await dragFilesIntoLab(page, caseDef.inputFiles)
			} else {
				await chooseFilesIntoLab(page, caseDef.inputFiles)
			}
			await expectLoadedGenome(page, caseDef.inputFiles[0])
			await loadPgxPackageZipFromUrl(page, config!)
			await runPgxAndOpenResult(page)

			const requiredArtifacts = config?.requireArtifacts ?? ['observations.tsv', 'analysis.jsonl', 'reports.jsonl', 'index.html']
			for (const artifact of requiredArtifacts) {
				await expect(page.getByRole('link', { name: artifact })).toBeVisible()
			}
			const reportFrame = page.frameLocator('iframe[title="index.html"]')
			for (const expected of config?.htmlContains ?? []) {
				await expect(reportFrame.getByText(expected, { exact: false }).first()).toBeVisible({ timeout: 30_000 })
			}
			await expectReportScrollsAndDisplays(page, caseDef.id, testInfo)

			const artifacts = await readArtifacts(page, requiredArtifacts)
			assertArtifactData(caseDef, artifacts)
			expect(artifacts.get('index.html') ?? '').toMatch(/<!doctype html/i)
			expect(errors.join('\n')).not.toContain('time not implemented on this platform')
			expect(errors.join('\n')).not.toContain('unreachable')

			await page.screenshot({
				path: path.join('.maestro-web/screenshots', `pgx-report-${caseDef.id}-${testInfo.retry}.png`),
				fullPage: true,
			})
		})
	}
})
