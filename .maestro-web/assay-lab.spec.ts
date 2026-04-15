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
	await expect(page.getByText('genome_hu50B3F5_v5_Full.zip', { exact: false })).toBeVisible({
		timeout: 30_000,
	})

	// Drop the APOL1 assay.
	await dropFile(page.locator('body'), ASSAY_FIXTURE, { type: 'text/x-python' })
	await expect(page.getByText('apol1.py', { exact: false })).toBeVisible({ timeout: 10_000 })
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

	// Either the result section or an error card should appear.
	const resultSection = page.getByText('RESULT · assay-output.tsv')
	const errorCard = page.getByText('Run failed', { exact: false })
	await expect(resultSection.or(errorCard)).toBeVisible({ timeout: 120_000 })

	await page.screenshot({
		path: '.maestro-web/screenshots/assay-lab-03-done.png',
		fullPage: true,
	})

	// Only fail the test on error card if we also didn't get results.
	if (!(await resultSection.isVisible())) {
		const details = await errorCard.locator('..').innerText()
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
