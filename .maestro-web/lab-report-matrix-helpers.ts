import fs from 'node:fs'
import path from 'node:path'
import { expect, type Page, type TestInfo } from '@playwright/test'
import { parse } from 'yaml'
import { webReportMatrixScenarios } from '../tests/lab-scenarios'

export const BASE_URL = process.env.WEB_URL ?? 'http://localhost:8081'
export const REPO_ROOT = path.resolve(__dirname, '..')
export const DEFAULT_REPORT_MATRIX_SCENARIO_ID = 'web-pgx-1-report-browser-matrix'

export type ReportMatrixConfig = NonNullable<(typeof webReportMatrixScenarios)[number]['reportMatrix']>

export type SampleCase = {
	id: string
	sourceFile: string
	inputFiles: string[]
	packageManifest?: string
	packageZip: string
	packageUrl: string
	packageInputFile: boolean
	packageLabel: string
	htmlContains: string[]
	assertions: {
		observationMinRows: number
		reportMinRows: number
		reportStatuses: string[]
		reportContains: Array<{ path: string; equals?: unknown; contains?: string; exists?: boolean }>
		observationRows: Array<Record<string, unknown>>
	}
}

export type ArtifactMap = Map<string, string>

export function getDefaultReportMatrixConfig(): ReportMatrixConfig {
	const scenario = webReportMatrixScenarios.find((item) => item.id === DEFAULT_REPORT_MATRIX_SCENARIO_ID)
	if (!scenario?.reportMatrix) throw new Error(`missing scenario: ${DEFAULT_REPORT_MATRIX_SCENARIO_ID}`)
	return scenario.reportMatrix
}

export function resolvePath(value: string, baseDir = REPO_ROOT): string {
	const expanded = value.replace(/^~/, process.env.HOME ?? '~')
	return path.isAbsolute(expanded) ? expanded : path.join(baseDir, expanded)
}

export function bytesForFiles(files: string[]): number {
	return files.reduce((total, file) => total + fs.statSync(file).size, 0)
}

export function loadSampleCases(config: ReportMatrixConfig): SampleCase[] {
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
			const packageZip = sample.package_zip
				? resolvePath(String(sample.package_zip), path.dirname(sourceFile))
				: resolvePath(config.packageZip)
			const packageManifest = sample.package_manifest
				? resolvePath(String(sample.package_manifest), path.dirname(sourceFile))
				: config.assayManifest
					? resolvePath(config.assayManifest)
					: undefined
			const packageUrl = String(sample.package_url ?? config.packageUrl)
			const packageInputFile = sample.package_input_file === true
			const packageLabel = String(sample.package_label ?? 'PGx-1 Panel')
			const htmlContains = Array.isArray(sample.html_contains)
				? sample.html_contains.map(String)
				: config.htmlContains ?? []
			cases.push({
				id,
				sourceFile,
				inputFiles: [inputFile, ...optionalFiles],
				packageManifest,
				packageZip,
				packageUrl,
				packageInputFile,
				packageLabel,
				htmlContains,
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

export function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export async function dismissDisclaimer(page: Page) {
	const understand = page.getByText('I understand and want to continue', { exact: false })
	if (await understand.isVisible().catch(() => false)) {
		await understand.click()
		await page.getByText(/^Continue$/).click({ timeout: 10_000 })
	}
}

export async function dismissRememberFilesPrompt(page: Page) {
	const dialog = page.getByLabel('Persistent file access dialog', { exact: true })
	if (!(await dialog.isVisible({ timeout: 2_000 }).catch(() => false))) return
	for (let attempt = 0; attempt < 20; attempt += 1) {
		if (!(await dialog.isVisible({ timeout: 250 }).catch(() => false))) return
		const notNow = dialog.getByText('Not now', { exact: true })
		if (await notNow.isVisible({ timeout: 250 }).catch(() => false)) {
			await notNow.evaluate((element) => {
				;(element as HTMLElement).click()
			})
		} else {
			const close = dialog.getByRole('button', { name: 'Close dialog', exact: true })
			if (await close.isVisible({ timeout: 250 }).catch(() => false)) {
				await close.evaluate((element) => {
					;(element as HTMLElement).click()
				})
			}
		}
		await expect(dialog).toBeHidden({ timeout: 2_000 }).catch(() => undefined)
		if (!(await dialog.isVisible({ timeout: 250 }).catch(() => false))) return
		await page.waitForTimeout(100)
	}
	await expect(dialog).toBeHidden({ timeout: 5_000 })
}

export async function dismissSharedResourcePrompt(page: Page) {
	const dialog = page.getByLabel('Shared resource dialog', { exact: true })
	if (!(await dialog.isVisible({ timeout: 2_000 }).catch(() => false))) return
	for (let attempt = 0; attempt < 20; attempt += 1) {
		if (!(await dialog.isVisible({ timeout: 250 }).catch(() => false))) return
		const candidates = ['Ignore', 'Done', 'Close shared resource dialog']
		let clicked = false
		for (const name of candidates) {
			const control = dialog.getByRole('button', { name, exact: true }).first()
			if (await control.isVisible({ timeout: 250 }).catch(() => false)) {
				await control.evaluate((element) => {
					;(element as HTMLElement).click()
				})
				clicked = true
				break
			}
		}
		if (!clicked) await page.waitForTimeout(100)
		await expect(dialog).toBeHidden({ timeout: 2_000 }).catch(() => undefined)
		if (!(await dialog.isVisible({ timeout: 250 }).catch(() => false))) return
	}
	await expect(dialog).toBeHidden({ timeout: 5_000 })
}

export async function routePackageZipToLocalFile(page: Page, caseDef: SampleCase) {
	await page.route(caseDef.packageUrl, async (route) => {
		if (caseDef.packageManifest) {
			await route.fulfill({ body: fs.readFileSync(caseDef.packageManifest), contentType: 'application/yaml' })
			return
		}
		await route.fulfill({ body: fs.readFileSync(caseDef.packageZip), contentType: 'application/zip' })
	})
	if (caseDef.packageManifest) {
		await page.route(`**/${path.basename(caseDef.packageManifest)}`, async (route) => {
			await route.fulfill({ body: fs.readFileSync(caseDef.packageManifest!), contentType: 'application/yaml' })
		})
	}
	const artifactUrl = new URL(path.basename(caseDef.packageZip), caseDef.packageUrl).toString()
	await page.route(artifactUrl, async (route) => {
		await route.fulfill({ body: fs.readFileSync(caseDef.packageZip), contentType: 'application/zip' })
	})
	await page.route(`**/${path.basename(caseDef.packageZip)}`, async (route) => {
		await route.fulfill({ body: fs.readFileSync(caseDef.packageZip), contentType: 'application/zip' })
	})
}

export async function dragFilesIntoLab(page: Page, files: string[]) {
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

export async function chooseFilesIntoLab(page: Page, files: string[]) {
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

export async function ensureImportGenomeVisible(page: Page) {
	const importGenome = page.getByText('Import genome', { exact: true })
	if (await importGenome.isVisible({ timeout: 1_000 }).catch(() => false)) return
	const openMenu = page.getByRole('button', { name: /Open menu|Genome files/ }).first()
	if (await openMenu.isVisible({ timeout: 1_000 }).catch(() => false)) {
		await openMenu.click()
	}
	await expect(importGenome).toBeVisible({ timeout: 30_000 })
}

export function mimeTypeFor(file: string): string {
	const lower = file.toLowerCase()
	if (lower.endsWith('.zip')) return 'application/zip'
	if (lower.endsWith('.gz')) return 'application/gzip'
	if (lower.endsWith('.json') || lower.endsWith('.jsonl')) return 'application/json'
	if (lower.endsWith('.html')) return 'text/html'
	return 'application/octet-stream'
}

export async function loadPackageZipFromUrl(page: Page, caseDef: SampleCase) {
	await page.evaluate((url) => {
		window.location.hash = `url=${encodeURIComponent(url)}`
	}, caseDef.packageUrl)
	const dialog = page.getByLabel('Shared resource dialog', { exact: true })
	await expect(dialog.getByText(/Fetch this URL\?|Load this file URL\?/)).toBeVisible({ timeout: 30_000 })
	const loadAction = dialog.getByRole('button', { name: /Fetch URL|Load file/ })
	await expect(loadAction).toBeVisible({ timeout: 30_000 })
	await loadAction.evaluate((element) => {
		;(element as HTMLElement).click()
	})
	const fetchDependencies = dialog.getByRole('button', { name: /Fetch dependencies|Refetch dependencies/ })
	await waitForValue(async () => {
		if (await fetchDependencies.isVisible({ timeout: 250 }).catch(() => false)) return 'dependencies'
		if (await page.getByText(caseDef.packageLabel, { exact: true }).first().isVisible({ timeout: 250 }).catch(() => false)) return 'ready'
		if (await dialog.getByRole('button', { name: 'Retry fetch', exact: true }).isVisible({ timeout: 250 }).catch(() => false)) return 'error'
		return 'pending'
	}, (value) => value !== 'pending', 90_000)
	if (await fetchDependencies.isVisible({ timeout: 250 }).catch(() => false)) {
		await fetchDependencies.evaluate((element) => {
			;(element as HTMLElement).click()
		})
		await waitForValue(async () => (
			await page.getByText(caseDef.packageLabel, { exact: true }).first().isVisible({ timeout: 250 }).catch(() => false)
		), Boolean, 90_000)
	}
	if (await dialog.getByRole('button', { name: 'Retry fetch', exact: true }).isVisible({ timeout: 250 }).catch(() => false)) {
		const message = await dialog.locator('text=/./').allTextContents().catch(() => [])
		throw new Error(`Package import failed: ${message.join(' ').trim()}`)
	}
	await expect(page.getByText(caseDef.packageLabel, { exact: true }).first()).toBeVisible({ timeout: 60_000 })
	const done = dialog.getByText('Done', { exact: true }).first()
	if (await done.isVisible({ timeout: 10_000 }).catch(() => false)) {
		await done.evaluate((element) => {
			;(element as HTMLElement).click()
		})
	}
}

export async function runPackageAndOpenResult(page: Page, caseDef: SampleCase, timeoutMs?: number) {
	const resultTimeout = timeoutMs ?? Number(process.env.WEB_REPORT_RESULT_TIMEOUT_MS ?? 600_000)
	const allFilter = page.getByText('All', { exact: true }).first()
	if (await allFilter.isVisible({ timeout: 2_000 }).catch(() => false)) {
		await allFilter.evaluate((element) => {
			;(element as HTMLElement).click()
		})
	}
	const packageRow = page.getByTestId('assay-result-row').filter({ hasText: caseDef.packageLabel }).last()
	await expect(packageRow).toBeVisible({ timeout: 60_000 })
	let runButton = page.getByRole('button', { name: `Run ${caseDef.packageLabel}`, exact: true }).first()
	if (!(await runButton.isVisible({ timeout: 1_000 }).catch(() => false))) {
		const downloadButton = page.getByRole('button', { name: `Download ${caseDef.packageLabel}`, exact: true }).first()
		await expect(downloadButton).toBeVisible({ timeout: 30_000 })
		await downloadButton.evaluate((element) => {
			;(element as HTMLElement).click()
		})
		await dismissRememberFilesPrompt(page)
		await dismissSharedResourcePrompt(page)
		runButton = page.getByRole('button', { name: `Run ${caseDef.packageLabel}`, exact: true }).first()
	}
	await expect(runButton).toBeVisible({ timeout: 60_000 })
	await dismissRememberFilesPrompt(page)
	await dismissSharedResourcePrompt(page)
	await runButton.evaluate((element) => {
		;(element as HTMLElement).click()
	})
	await waitForAssertion(async () => {
		const bodyText = await page.locator('body').innerText({ timeout: 10_000 })
		expect(bodyText).not.toContain('Run failed')
		expect(bodyText).not.toContain('unreachable')
		expect(bodyText).toContain('4 result artifacts saved locally.')
	}, resultTimeout)
	const viewResult = page.getByText('View result', { exact: true })
	await expect(viewResult).toBeVisible({ timeout: 30_000 })
	await dismissRememberFilesPrompt(page)
	await viewResult.evaluate((element) => {
		;(element as HTMLElement).click()
	})
	await expect(page.getByText('ARTIFACTS', { exact: true })).toBeVisible({ timeout: 30_000 })
}

export async function expectLoadedGenome(page: Page, filePath: string) {
	const name = path.basename(filePath)
	await expect(page.getByTestId('session-genome-row').filter({ hasText: name })).toBeVisible({ timeout: 60_000 })
	await expect(page.getByText(name, { exact: true }).last()).toBeVisible({ timeout: 60_000 })
	await expect(page.getByText('Genome complete', { exact: true })).toBeVisible({ timeout: 60_000 })
}

async function waitForValue<T>(
	read: () => Promise<T>,
	done: (value: T) => boolean,
	timeoutMs: number,
	intervals = [1_000, 3_000, 5_000, 10_000],
): Promise<T> {
	const started = Date.now()
	let attempt = 0
	let latest = await read()
	while (!done(latest)) {
		if (Date.now() - started >= timeoutMs) {
			throw new Error(`Timed out after ${timeoutMs}ms; latest value: ${String(latest)}`)
		}
		await new Promise((resolve) => setTimeout(resolve, intervals[Math.min(attempt, intervals.length - 1)]))
		attempt += 1
		latest = await read()
	}
	return latest
}

async function waitForAssertion(
	assertion: () => Promise<void>,
	timeoutMs: number,
	intervals = [1_000, 3_000, 5_000, 10_000],
) {
	const started = Date.now()
	let attempt = 0
	let lastError: unknown
	while (Date.now() - started < timeoutMs) {
		try {
			await assertion()
			return
		} catch (error) {
			lastError = error
		}
		await new Promise((resolve) => setTimeout(resolve, intervals[Math.min(attempt, intervals.length - 1)]))
		attempt += 1
	}
	if (lastError) throw lastError
	throw new Error(`Timed out after ${timeoutMs}ms`)
}

export async function expectReportScrollsAndDisplays(page: Page, caseId: string, testInfo: TestInfo) {
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

export async function readArtifacts(page: Page, names: string[]): Promise<ArtifactMap> {
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

export function parseTsv(text: string): Array<Record<string, string>> {
	const lines = text.trim().split(/\r?\n/)
	const headers = lines.shift()?.split('\t') ?? []
	return lines.filter(Boolean).map((line) => {
		const cells = line.split('\t')
		return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']))
	})
}

export function parseJsonl(text: string): Array<Record<string, unknown>> {
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

export function assertArtifactData(caseDef: SampleCase, artifacts: ArtifactMap, options: { strictSampleRows?: boolean } = {}) {
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
	if (options.strictSampleRows) {
		for (const expected of caseDef.assertions.observationRows) {
			expect(observations.some((row) => rowMatches(row, expected)), `${caseDef.id} observation ${JSON.stringify(expected)}`).toBe(true)
		}
	}
	for (const expected of caseDef.assertions.reportContains) {
		expect(reports.some((report) => reportMatches(report, expected)), `${caseDef.id} report ${JSON.stringify(expected)}`).toBe(true)
	}
}

export function caseTimeoutFor(caseDef: SampleCase): number {
	if (process.env.WEB_REPORT_CASE_TIMEOUT_MS) return Number(process.env.WEB_REPORT_CASE_TIMEOUT_MS)
	const hasCram = caseDef.inputFiles.some((file) => file.toLowerCase().endsWith('.cram'))
	return hasCram ? 900_000 : 300_000
}

export async function prepareLabReportCase(page: Page, caseDef: SampleCase, config: ReportMatrixConfig) {
	const maxBytes = Number(process.env.WEB_REPORT_MAX_DRAG_BYTES ?? config.maxDragBytes ?? 268_435_456)
	const labInputFiles = caseDef.packageInputFile ? [...caseDef.inputFiles, caseDef.packageZip] : caseDef.inputFiles
	const totalBytes = bytesForFiles(labInputFiles)
	const useDragDrop = totalBytes <= maxBytes

	await routePackageZipToLocalFile(page, caseDef)
	await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
	await dismissDisclaimer(page)
	await page.goto(`${BASE_URL}/lab`, { waitUntil: 'domcontentloaded' })
	await ensureImportGenomeVisible(page)
	if (useDragDrop) await dragFilesIntoLab(page, labInputFiles)
	else await chooseFilesIntoLab(page, labInputFiles)
	await expectLoadedGenome(page, caseDef.inputFiles[0])
	if (!caseDef.packageInputFile) await loadPackageZipFromUrl(page, caseDef)
}
