import fs from 'node:fs'
import path from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import {
	GENOME_23ANDME,
	PGX_RELEASE_URL,
	PGX_RELEASE_YAML,
	chooseGenomeFiles,
	fixturePath,
	gotoLab,
	importPgxReleaseFromUrl,
	localPackageZipFromRelease,
	missingFixture,
	routePgxPackageToLocalFiles,
} from './lab-test-helpers'

const APOL1 = fixturePath('exvitae/assays/risk/APOL1/apol1.py')
const APOL1_BAM = fixturePath('exvitae/assays/risk/APOL1/test-data/apol1.bam')
const APOL1_BAI = fixturePath('exvitae/assays/risk/APOL1/test-data/apol1.bam.bai')
const APOL1_CRAM = fixturePath('exvitae/assays/risk/APOL1/test-data/apol1.cram')
const APOL1_CRAI = fixturePath('exvitae/assays/risk/APOL1/test-data/apol1.cram.crai')
const APOL1_FASTA = fixturePath('exvitae/assays/risk/APOL1/test-data/stub.fa')
const APOL1_FAI = fixturePath('exvitae/assays/risk/APOL1/test-data/stub.fa.fai')

async function routeDemoAndPgxFixtures(page: Page) {
	await routePgxPackageToLocalFiles(page)
	await page.route('**/genome_hu50B3F5_v5_Full.zip*', async (route) => {
		await route.fulfill({
			body: fs.readFileSync(GENOME_23ANDME),
			contentType: 'application/zip',
		})
	})
}

async function importPgxReleaseThroughSearch(page: Page) {
	await page.getByPlaceholder('Search assays or import from URL…').fill(PGX_RELEASE_URL)
	await page.getByLabel('Import assay from URL').click()
	const dialog = page.getByLabel('Shared resource dialog', { exact: true })
	await expect(dialog.getByText(/Fetch this URL\?|Load this file URL\?/)).toBeVisible({ timeout: 30_000 })
	await dialog.getByRole('button', { name: /Fetch URL|Load file/ }).click()
	await expect(page.getByText(/33 fetched variants ready\.|PGx-1 Panel/).first()).toBeVisible({ timeout: 60_000 })
	const closeSharedResource = dialog.getByRole('button', { name: 'Close shared resource dialog' })
	if (await closeSharedResource.isVisible({ timeout: 1_000 }).catch(() => false)) {
		await closeSharedResource.click()
	}
	const done = page.getByText('Done', { exact: true }).first()
	if (await done.isVisible({ timeout: 1_000 }).catch(() => false)) {
		await done.click()
	}
	await expect(dialog).toBeHidden({ timeout: 10_000 })
}

async function runPgxPanelAndAssertReport(page: Page, timeout = 180_000) {
	const panelRow = page.getByTestId('assay-result-row').filter({ hasText: 'PGx-1 Panel' }).first()
	await expect(panelRow).toBeVisible({ timeout: 30_000 })
	await expect(panelRow.getByText('Run panel', { exact: true })).toBeVisible({ timeout: 60_000 })
	await panelRow.getByText('Run panel', { exact: true }).click()

	await expect(page.getByText('Latest result')).toBeVisible({ timeout })
	await expect(page.locator('body')).not.toContainText('Run failed')
	await expect(page.locator('body')).not.toContainText('Unable to fetch remote file')
	await expect(page.locator('body')).not.toContainText('package file not found')
	await expect(page.getByText('4 result artifacts saved locally.')).toBeVisible({ timeout: 30_000 })

	await page.getByText('View result', { exact: true }).first().click()
	await expect(page.getByText('ARTIFACTS', { exact: true })).toBeVisible({ timeout: 30_000 })
	await expect(page.getByRole('link', { name: 'observations.tsv' })).toBeVisible()
	await expect(page.getByRole('link', { name: 'analysis.jsonl' })).toBeVisible()
	await expect(page.getByRole('link', { name: 'reports.jsonl' })).toBeVisible()
	await expect(page.locator('iframe[title="index.html"]')).toBeVisible({ timeout: 30_000 })
	await page.getByRole('button', { name: 'Close' }).last().click()
}

async function runApol1AndAssertG0G0(page: Page) {
	await page.getByPlaceholder(/Search assays/).fill('apol1.py')
	const assayRow = page.getByTestId('assay-result-row').filter({ hasText: 'apol1.py' }).first()
	await expect(assayRow).toBeVisible({ timeout: 30_000 })
	await expect(assayRow.getByText('Run assay', { exact: true })).toBeVisible({ timeout: 120_000 })
	await assayRow.getByText('Run assay', { exact: true }).click()

	await expect(page.getByText('Latest result')).toBeVisible({ timeout: 180_000 })
	await expect(page.locator('body')).toContainText('G0/G0', { timeout: 120_000 })
	const body = await page.textContent('body')
	expect(body ?? '').not.toContain("Invalid exception type: 'Error'")
	expect(body ?? '').not.toContain('Run failed')
}

test.describe('lab requested user scenarios — web', () => {
	test('scratch demo, report view, refresh, reselect 23andMe, and rerun PGx-1', async ({ page }) => {
		const missing = missingFixture([GENOME_23ANDME, PGX_RELEASE_YAML, localPackageZipFromRelease()])
		test.skip(Boolean(missing), `missing fixture: ${missing}`)
		test.setTimeout(300_000)

		await routeDemoAndPgxFixtures(page)
		await gotoLab(page)
		await page.getByRole('button', { name: 'Run 23andMe + Drug Interactions Example' }).click()
		await expect(page.getByText('Latest result')).toBeVisible({ timeout: 240_000 })
		await expect(page.getByText('4 result artifacts saved locally.')).toBeVisible({ timeout: 30_000 })
		await page.getByText('View result', { exact: true }).first().click()
		await expect(page.getByText('ARTIFACTS', { exact: true })).toBeVisible({ timeout: 30_000 })
		await expect(page.locator('iframe[title="index.html"]')).toBeVisible({ timeout: 30_000 })
		await page.getByRole('button', { name: 'Close' }).last().click()

		await page.reload({ waitUntil: 'domcontentloaded' })
		await chooseGenomeFiles(page, GENOME_23ANDME)
		await expect(page.getByText('Genome complete', { exact: true })).toBeVisible({ timeout: 30_000 })
		await runPgxPanelAndAssertReport(page)
	})

	test('VCF without index can build index, run PGx-1, then run APOL1', async ({ page }) => {
		test.fixme(true, 'missing-index browser flow is tracked in .maestro-web/lab-index-generation.spec.ts and currently times out')
		await gotoLab(page)
	})

	test('BAM plus reference runs APOL1 and returns G0/G0', async ({ page }) => {
		const missing = missingFixture([APOL1, APOL1_BAM, APOL1_BAI, APOL1_FASTA, APOL1_FAI])
		test.skip(Boolean(missing), `missing fixture: ${missing}`)
		test.setTimeout(240_000)

		await gotoLab(page)
		await chooseGenomeFiles(page, [APOL1, APOL1_BAM, APOL1_BAI, APOL1_FASTA, APOL1_FAI])
		await expect(page.getByText('Genome complete', { exact: true }).first()).toBeVisible({ timeout: 30_000 })
		await runApol1AndAssertG0G0(page)
	})

	test('CRAM with indexes can run PGx-1 and open the generated report', async ({ page }) => {
		const missing = missingFixture([
			APOL1_CRAM,
			APOL1_CRAI,
			APOL1_FASTA,
			APOL1_FAI,
			PGX_RELEASE_YAML,
			localPackageZipFromRelease(),
		])
		test.skip(Boolean(missing), `missing fixture: ${missing}`)
		test.setTimeout(360_000)

		await routePgxPackageToLocalFiles(page)
		await gotoLab(page)
		await chooseGenomeFiles(page, [APOL1_CRAM, APOL1_CRAI, APOL1_FASTA, APOL1_FAI])
		await expect(page.getByText('Genome complete', { exact: true }).first()).toBeVisible({ timeout: 30_000 })
		await importPgxReleaseFromUrl(page)
		await runPgxPanelAndAssertReport(page, 240_000)
	})

	test('add, delete, re-add, import URL, inspect source, and finish with a PGx report', async ({ page }) => {
		const missing = missingFixture([GENOME_23ANDME, PGX_RELEASE_YAML, localPackageZipFromRelease()])
		test.skip(Boolean(missing), `missing fixture: ${missing}`)
		test.setTimeout(300_000)

		await routePgxPackageToLocalFiles(page)
		await gotoLab(page)
		await chooseGenomeFiles(page, GENOME_23ANDME)
		await expect(page.getByText('Genome complete', { exact: true })).toBeVisible({ timeout: 30_000 })
		await page.getByLabel('Remove genome genome_hu50B3F5_v5_Full.zip').click()
		await expect(page.getByText('Genome complete', { exact: true })).toHaveCount(0)

		await chooseGenomeFiles(page, GENOME_23ANDME)
		await expect(page.getByText('Genome complete', { exact: true })).toBeVisible({ timeout: 30_000 })
		await importPgxReleaseThroughSearch(page)

		await page.getByText('Panels', { exact: true }).click()
		await expect(page.getByTestId('assay-result-row').filter({ hasText: 'PGx-1 Panel' }).first()).toBeVisible()
		await page.getByText('Assays', { exact: true }).click()
		await page.getByText('All', { exact: true }).click()

		const panelRow = page.getByTestId('assay-result-row').filter({ hasText: 'PGx-1 Panel' }).first()
		await panelRow.click()
		const sourceDialog = page.getByLabel('Source files dialog')
		await expect(sourceDialog).toBeVisible({ timeout: 30_000 })
		await expect(sourceDialog.getByLabel('manifest.yaml')).toBeVisible()
		await page.getByLabel('Close dialog').click({ force: true })
		await expect(sourceDialog).toBeHidden({ timeout: 10_000 })

		await page.getByLabel('Forget assay PGx-1 Panel').click()
		await importPgxReleaseThroughSearch(page)
		await runPgxPanelAndAssertReport(page)
	})
})
