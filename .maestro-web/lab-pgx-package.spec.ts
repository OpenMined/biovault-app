import { test, expect } from '@playwright/test'
import {
	GENOME_23ANDME,
	PGX_RELEASE_YAML,
	chooseGenomeFiles,
	gotoLab,
	importPgxReleaseFromUrl,
	localPackageZipFromRelease,
	missingFixture,
	routePgxPackageToLocalFiles,
} from './lab-test-helpers'

test.describe('lab PGx package import — web', () => {
	test('importing PGx-1 release resolves package files and opens source viewer from the row', async ({ page }) => {
		const packageZip = localPackageZipFromRelease()
		const missing = missingFixture([GENOME_23ANDME, PGX_RELEASE_YAML, packageZip])
		test.skip(Boolean(missing), `missing fixture: ${missing}`)

		await routePgxPackageToLocalFiles(page)
		await gotoLab(page)
		await chooseGenomeFiles(page, GENOME_23ANDME)
		await expect(page.getByText('Genome complete', { exact: true })).toBeVisible({ timeout: 30_000 })

		await importPgxReleaseFromUrl(page)

		const panelRows = page.getByTestId('assay-result-row').filter({ hasText: 'PGx-1 Panel' })
		await expect(panelRows).toHaveCount(1)
		await expect(panelRows.first().getByText('Run panel', { exact: true })).toBeVisible()
		await expect(page.getByText('Download', { exact: true })).toHaveCount(0)

		await panelRows.first().click()
		const sourceDialog = page.getByLabel('Source files dialog')
		await expect(sourceDialog).toBeVisible({ timeout: 30_000 })
		await expect(sourceDialog.getByText(/file[s]? used by this assay\/report/)).toBeVisible()
		await expect(sourceDialog.getByLabel('assets/ABCB1/rs1128503-pgx.yaml')).toBeVisible()
		await expect(sourceDialog.getByLabel('assets/APOE/apoe.py')).toBeVisible()
		await expect(sourceDialog.getByLabel('manifest.yaml')).toBeVisible()

		await sourceDialog.getByLabel('assets/APOE/apoe.py').evaluate((element) => {
			;(element as HTMLElement).click()
		})
		await expect(sourceDialog.getByText('assets/APOE/apoe.py', { exact: true })).toBeVisible()
		await expect(sourceDialog.getByText('def main():', { exact: true })).toBeVisible({ timeout: 10_000 })
	})

	test('PGx-1 package remains runnable after refresh and reselecting 23andMe ZIP', async ({ page }) => {
		const packageZip = localPackageZipFromRelease()
		const missing = missingFixture([GENOME_23ANDME, PGX_RELEASE_YAML, packageZip])
		test.skip(Boolean(missing), `missing fixture: ${missing}`)
		test.setTimeout(240_000)

		await routePgxPackageToLocalFiles(page)
		await gotoLab(page)
		await importPgxReleaseFromUrl(page)
		await page.reload({ waitUntil: 'domcontentloaded' })
		await chooseGenomeFiles(page, GENOME_23ANDME)
		await expect(page.getByText('Genome complete', { exact: true })).toBeVisible({ timeout: 30_000 })

		const panelRow = page.getByTestId('assay-result-row').filter({ hasText: 'PGx-1 Panel' }).first()
		await expect(panelRow).toBeVisible({ timeout: 30_000 })
		await expect(panelRow.getByText('Run panel', { exact: true })).toBeVisible({ timeout: 60_000 })
		await panelRow.getByText('Run panel', { exact: true }).click()

		await expect(page.getByText('Latest result')).toBeVisible({ timeout: 180_000 })
		await expect(page.locator('body')).not.toContainText('package file not found')
		await expect(page.locator('body')).not.toContainText('Run failed')
		await expect(page.getByText('4 result artifacts saved locally.')).toBeVisible({ timeout: 30_000 })
	})
})
