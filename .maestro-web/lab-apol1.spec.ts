// Smoke test for the Monty ↔ bioscript-wasm bridge introduced by
// docs/architecture/wasm.md Phase 1a. Drops the NA06985 CRAM bundle into
// /lab and runs the built-in APOL1 assay, verifying apol1_status resolves without
// "Invalid exception type" or other runtime errors.
//
// Uses the 124 KB embed_ref CRAM slice co-located with the assay at
// `exvitae/assays/risk/APOL1/test-data/`. The top-level `test-data/` dir is
// gitignored (holds multi-GB CRAMs / FASTAs); per-assay fixtures live next
// to their Python so they're committable and easy to find.

import fs from 'node:fs'
import path from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { labTestFixtures } from '../lib/lab/core/test-scenarios'

const BASE_URL = process.env.WEB_URL ?? 'http://localhost:8081'
const REPO_ROOT = path.resolve(__dirname, '..')

const CRAM = path.join(REPO_ROOT, labTestFixtures.apol1Cram[0])
const CRAI = path.join(REPO_ROOT, labTestFixtures.apol1Cram[1])
const FASTA = path.join(REPO_ROOT, labTestFixtures.apol1Cram[2])
const FAI = path.join(REPO_ROOT, labTestFixtures.apol1Cram[3])
const APOL1 = path.join(REPO_ROOT, 'exvitae/assays/risk/APOL1/apol1.py')

async function dismissDisclaimer(page: Page) {
	// The app gates with a "I understand and want to continue" screen on first
	// visit. If we're already past it (cookies), these selectors time out quickly.
	const understand = page.getByText('I understand and want to continue', { exact: false })
	if (await understand.isVisible().catch(() => false)) {
		await understand.click()
		const cont = page.getByText(/^Continue$/)
		await cont.click({ timeout: 10_000 })
	}
}

async function dismissRememberFilesPrompt(page: Page) {
	const notNow = page.getByText('Not now', { exact: true })
	if (await notNow.isVisible({ timeout: 5_000 }).catch(() => false)) {
		await notNow.click()
	}
}

const ALL_FIXTURES = [APOL1, CRAM, CRAI, FASTA, FAI]
const missingFixture = ALL_FIXTURES.find((p) => !fs.existsSync(p))

test('lab: apol1.py runs against NA06985 CRAM without exception-type errors', async ({ page }) => {
	test.skip(
		Boolean(missingFixture),
		`fixture missing: ${missingFixture} — run \`bioscript/tools/fetch_test_data.sh --dataset 1k-genomes\` locally to enable`,
	)
	test.setTimeout(180_000)

	const errors: string[] = []
	const infos: string[] = []
	page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
	page.on('console', (msg) => {
		const text = msg.text()
		if (msg.type() === 'error') errors.push(`console.error: ${text}`)
		else if (text.includes('[bioscript-web]') || text.includes('[BioscriptWasm]')) {
			infos.push(text)
		}
	})

	await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
	await dismissDisclaimer(page)

	await page.goto(`${BASE_URL}/lab`, { waitUntil: 'domcontentloaded' })
	await expect(page.getByText('Import genome', { exact: true })).toBeVisible({
		timeout: 30_000,
	})

	// Intercept the next filechooser and feed the CRAM bundle at once; the lab
	// classifies them and auto-pairs the companions.
	const [chooser] = await Promise.all([
		page.waitForEvent('filechooser'),
		(async () => {
			await page.getByText('Import genome', { exact: true }).click()
			await page.getByLabel('Choose genome files').click()
		})(),
	])
	await chooser.setFiles([APOL1, CRAM, CRAI, FASTA, FAI])
	await dismissRememberFilesPrompt(page)

	await expect(page.getByText('Genome complete').first()).toBeVisible({ timeout: 30_000 })
	await expect(page.getByText('apol1.py', { exact: false }).first()).toBeVisible({ timeout: 30_000 })
	await page.getByPlaceholder('Search assays…').fill('apol1.py')
	const assayRow = page.getByTestId('assay-result-row').filter({ hasText: 'apol1.py' }).first()
	await expect(assayRow).toBeVisible({ timeout: 30_000 })

	await page.screenshot({
		path: '.maestro-web/screenshots/lab-apol1-01-loaded.png',
		fullPage: true,
	})

	const runButton = assayRow.getByText('Run assay', { exact: true })
	await expect(runButton).toBeEnabled({ timeout: 15_000 })
	await runButton.click()

	// Either Latest result appears (success) or the "Run failed" card appears
	// (error — we want to capture the message either way for debugging).
	const results = page.getByText(/Latest result/)
	const runFailed = page.getByText('Run failed', { exact: false })
	await Promise.race([
		results.waitFor({ state: 'visible', timeout: 120_000 }),
		runFailed.waitFor({ state: 'visible', timeout: 120_000 }),
	])

	await page.screenshot({
		path: '.maestro-web/screenshots/lab-apol1-02-after-run.png',
		fullPage: true,
	})

	await expect(page.locator('body')).toContainText('G0/G0', { timeout: 120_000 })
	const finalText = await page.textContent('body')
	// eslint-disable-next-line no-console
	console.log('\n=== info logs ===\n' + infos.join('\n'))
	// eslint-disable-next-line no-console
	console.log('\n=== errors ===\n' + errors.join('\n'))

	// Assert we didn't hit the exception-type bug.
	expect(finalText ?? '').not.toContain("Invalid exception type: 'Error'")

	// Soft-assert on the classifier output — may need adjusting if the CRAM
	// yields a different genotype than expected.
	if ((finalText ?? '').includes('Run failed')) {
		throw new Error(
			`Run failed — errors:\n${errors.join('\n')}\ninfos:\n${infos.join('\n')}`,
		)
	}
	expect(finalText).toContain('G0/G0')
})
