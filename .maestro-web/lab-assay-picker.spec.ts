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

test.describe('lab assay picker filters — web', () => {
	test('filters panels, assays, and grouped package resources after URL import', async ({ page }) => {
		const packageZip = localPackageZipFromRelease()
		const missing = missingFixture([GENOME_23ANDME, PGX_RELEASE_YAML, packageZip])
		test.skip(Boolean(missing), `missing fixture: ${missing}`)

		await routePgxPackageToLocalFiles(page)
		await gotoLab(page)
		await chooseGenomeFiles(page, GENOME_23ANDME)
		await importPgxReleaseFromUrl(page)

		await expect(page.getByRole('button', { name: /^All \d+$/ })).toBeVisible()
		await expect(page.getByRole('button', { name: /^Panels \d+$/ })).toBeVisible()
		await expect(page.getByRole('button', { name: /^Assays \d+$/ })).toBeVisible()

		await expect(page.getByLabel('View assay PGx-1 Panel')).toHaveCount(1)
		await expect(page.getByTestId('assay-result-row').filter({ hasText: /rs1128503|apoe/i })).toHaveCount(0)

		await page.getByRole('button', { name: /^Assays \d+$/ }).click()
		await expect(page.getByText('Part of PGx-1 Panel', { exact: true })).toBeVisible({ timeout: 30_000 })
		await expect(page.getByText('Standalone assays', { exact: true })).toBeVisible()
		await expect(page.getByLabel('View assay APOL1 Risk Assay')).toBeVisible()
		await expect(page.getByRole('button', { name: 'Download APOL1 Risk Assay' })).toBeVisible()
		await expect(page.getByLabel('View assay PGx-1 Panel')).toHaveCount(0)
		await expect(page.getByTestId('assay-result-row').filter({ hasText: /APOE|MTHFR|rs1128503/i }).first()).toBeVisible()

		await page.getByRole('button', { name: /^All \d+$/ }).click()
		await expect(page.getByLabel('View assay PGx-1 Panel')).toHaveCount(1)
		await expect(page.getByTestId('assay-result-row').filter({ hasText: /APOE|MTHFR|rs1128503/i }).first()).toBeVisible()
		await expect(page.getByText(/bioscript:variant|bioscript:assay-compiled|\.py$/i)).toHaveCount(0)
	})
})
