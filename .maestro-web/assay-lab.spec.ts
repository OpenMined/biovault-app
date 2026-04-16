import fs from 'node:fs'
import path from 'node:path'
import { test, expect, type Locator } from '@playwright/test'

const BASE_URL = process.env.WEB_URL ?? 'http://localhost:8081'
const REPO_ROOT = path.resolve(__dirname, '..')
const GENOME_FIXTURE = path.join(
	REPO_ROOT,
	'test-data/23andme/v5/hu50B3F5/genome_hu50B3F5_v5_Full.zip',
)
const ASSAY_FIXTURE = path.join(REPO_ROOT, 'assays/risk/APOL1/apol1.py')
const YAML_ASSAY_FIXTURE = path.join(REPO_ROOT, 'assays/pgx/GLP1/rs1800437.yaml')

async function dropFile(target: Locator, absPath: string, opts: { type: string }) {
	const base64 = fs.readFileSync(absPath).toString('base64')
	const name = path.basename(absPath)
	const page = target.page()
	const dataTransfer = await page.evaluateHandle(
		({ base64, name, type }) => {
			const bin = atob(base64)
			const bytes = new Uint8Array(bin.length)
			for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
			const dt = new DataTransfer()
			dt.items.add(new File([bytes], name, { type }))
			return dt
		},
		{ base64, name, type: opts.type },
	)
	await target.dispatchEvent('dragenter', { dataTransfer })
	await target.dispatchEvent('dragover', { dataTransfer })
	await target.dispatchEvent('drop', { dataTransfer })
}

test('assay lab runs APOL1 on a 23andMe v5 zip', async ({ page }) => {
	test.setTimeout(180_000)
	const errors: string[] = []
	page.on('pageerror', (err) => errors.push(err.message))
	page.on('console', (msg) => {
		if (msg.type() === 'error') errors.push(msg.text())
	})

	await page.goto(`${BASE_URL}/assay-lab`, { waitUntil: 'domcontentloaded' })
	// The page header is the reliable "mounted" signal; slot labels appear below.
	await expect(page.getByText('Assay lab', { exact: false })).toBeVisible({ timeout: 30_000 })
	await page.screenshot({
		path: '.maestro-web/screenshots/assay-lab-01-empty.png',
		fullPage: true,
	})

	// Drop genome (23andMe .zip) — lab's window-level handler ingests by extension.
	await dropFile(page.locator('body'), GENOME_FIXTURE, { type: 'application/zip' })
	await expect(page.getByText('genome_hu50B3F5_v5_Full.zip', { exact: false }).first()).toBeVisible({
		timeout: 30_000,
	})

	// Drop the APOL1 assay.
	await dropFile(page.locator('body'), ASSAY_FIXTURE, { type: 'text/x-python' })
	await expect(page.getByText('apol1.py', { exact: false }).first()).toBeVisible({ timeout: 10_000 })
	await page.screenshot({
		path: '.maestro-web/screenshots/assay-lab-02-loaded.png',
		fullPage: true,
	})

	// Run. Bioscript WASM cold-start can take ~30-60s on CI; generous timeout.
	const runButton = page.getByTestId('assay-lab-run')
	await expect(runButton).toBeVisible({ timeout: 30_000 })
	// react-native-web renders disabled Pressable without the `disabled` DOM attr,
	// so we can't rely on toBeEnabled — just click and let the assertion below
	// catch a no-op.
	await runButton.click()

	// A run card appears once the run finishes — `done` or `error` testID.
	const okCard = page.getByTestId('run-card-done').first()
	const errCard = page.getByTestId('run-card-error').first()
	await expect(okCard.or(errCard)).toBeVisible({ timeout: 120_000 })

	await page.screenshot({
		path: '.maestro-web/screenshots/assay-lab-03-done.png',
		fullPage: true,
	})

	if (!(await okCard.isVisible())) {
		const details = await errCard.innerText()
		throw new Error(`Assay run failed:\n${details}`)
	}

	const fatal = errors.filter(
		(msg) =>
			!msg.includes('Invalid DOM property') &&
			!msg.includes('DevTools') &&
			!msg.includes('favicon') &&
			!msg.includes('Failed to load resource'),
	)
	expect(fatal, `console/page errors:\n${fatal.join('\n')}`).toEqual([])
})

test('assay lab runs rs1800437.yaml and finds GG', async ({ page }) => {
	test.setTimeout(180_000)

	// Capture [bioscript-web] diagnostic logs so we can assert that the store
	// actually loaded rs1800437 and the variant lookup returned GG.
	const bioscriptLogs: string[] = []
	page.on('console', (msg) => {
		const text = msg.text()
		if (text.includes('[bioscript-web]')) bioscriptLogs.push(text)
	})

	await page.goto(`${BASE_URL}/assay-lab`, { waitUntil: 'domcontentloaded' })
	await expect(page.getByText('Assay lab', { exact: false })).toBeVisible({ timeout: 30_000 })

	await dropFile(page.locator('body'), GENOME_FIXTURE, { type: 'application/zip' })
	await expect(page.getByText('genome_hu50B3F5_v5_Full.zip', { exact: false }).first()).toBeVisible({
		timeout: 30_000,
	})

	await dropFile(page.locator('body'), YAML_ASSAY_FIXTURE, { type: 'text/yaml' })
	await expect(page.getByText('rs1800437.yaml', { exact: false }).first()).toBeVisible({ timeout: 10_000 })
	await page.screenshot({
		path: '.maestro-web/screenshots/assay-lab-yaml-01-loaded.png',
		fullPage: true,
	})

	await page.getByTestId('assay-lab-run').click()

	const okCard = page.getByTestId('run-card-done').first()
	const errCard = page.getByTestId('run-card-error').first()
	await expect(okCard.or(errCard)).toBeVisible({ timeout: 120_000 })

	await page.screenshot({
		path: '.maestro-web/screenshots/assay-lab-yaml-02-done.png',
		fullPage: true,
	})

	if (!(await okCard.isVisible())) {
		const details = await errCard.innerText()
		throw new Error(`YAML assay run failed:\n${details}`)
	}

	// Result card renders the genotype as its own cell — assert 'GG' is on the page.
	await expect(page.getByText(/\bGG\b/).first()).toBeVisible({ timeout: 10_000 })

	// Diagnostic logs from ExpoBioscriptWebRuntime.ts must include both:
	//   * load_genotypes reporting hasRs1800437: true / rs1800437: GG
	//   * a matching lookup hit on rs1800437
	const loadLog = bioscriptLogs.find((line) => line.includes('load_genotypes'))
	expect(loadLog, `no load_genotypes log:\n${bioscriptLogs.join('\n')}`).toBeTruthy()
	expect(loadLog, loadLog ?? '').toMatch(/hasRs1800437.*true/)
	expect(loadLog, loadLog ?? '').toMatch(/rs1800437.*GG/)

	const hitLog = bioscriptLogs.find(
		(line) => line.includes('lookup hit') && line.includes('rs1800437'),
	)
	expect(hitLog, `no lookup hit log:\n${bioscriptLogs.join('\n')}`).toBeTruthy()
	expect(hitLog, hitLog ?? '').toMatch(/genotype.*GG/)
})
