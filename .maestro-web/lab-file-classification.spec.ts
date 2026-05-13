import { test, expect } from '@playwright/test'
import {
	GENOME_23ANDME,
	PGX_PACKAGE_ZIP_URL,
	chooseGenomeFiles,
	dragFilesIntoLab,
	gotoLab,
	localPackageZipFromRelease,
	missingFixture,
	routePgxPackageToLocalFiles,
} from './lab-test-helpers'

test.describe('lab file classification — web', () => {
	test('dragging a 23andMe ZIP adds one genome row', async ({ page }) => {
		const missing = missingFixture([GENOME_23ANDME])
		test.skip(Boolean(missing), `missing fixture: ${missing}`)

		await gotoLab(page)
		await dragFilesIntoLab(page, [GENOME_23ANDME])

		await expect(page.getByTestId('session-genome-row')).toHaveCount(1, { timeout: 30_000 })
		await expect(page.getByTestId('session-genome-row').getByText('genome_hu50B3F5_v5_Full.zip')).toBeVisible()
		await expect(page.getByText('Genome complete', { exact: true })).toBeVisible()
	})

	test('dragging a PGx package ZIP loads assay state without adding a genome row', async ({ page }) => {
		const packageZip = localPackageZipFromRelease()
		const missing = missingFixture([packageZip])
		test.skip(Boolean(missing), `missing fixture: ${missing}`)

		await routePgxPackageToLocalFiles(page)
		await gotoLab(page)
		await dragFilesIntoLab(page, [packageZip])

		await expect(page.getByTestId('session-genome-row')).toHaveCount(0)
		await dragFilesIntoLab(page, [GENOME_23ANDME])
		await expect(page.getByText('PGx-1 Panel', { exact: true }).first()).toBeVisible({ timeout: 30_000 })
		await expect(page.getByText('pgx-1.zip', { exact: true })).toHaveCount(0)
	})

	test('mixed genome and assay package drops assign each file to one bucket', async ({ page }) => {
		const packageZip = localPackageZipFromRelease()
		const missing = missingFixture([GENOME_23ANDME, packageZip])
		test.skip(Boolean(missing), `missing fixture: ${missing}`)

		await routePgxPackageToLocalFiles(page)
		await gotoLab(page)
		await dragFilesIntoLab(page, [GENOME_23ANDME, packageZip])

		await expect(page.getByTestId('session-genome-row')).toHaveCount(1, { timeout: 30_000 })
		await expect(page.getByTestId('session-genome-row').getByText('genome_hu50B3F5_v5_Full.zip')).toBeVisible()
		await expect(page.getByText('PGx-1 Panel', { exact: true }).first()).toBeVisible({ timeout: 30_000 })
		await expect(page.getByTestId('session-genome-row').getByText('pgx-1.zip')).toHaveCount(0)
	})

	test('a previously cached assay package ZIP is not restored as a genome row', async ({ page }) => {
		const packageZip = localPackageZipFromRelease()
		const missing = missingFixture([GENOME_23ANDME, packageZip])
		test.skip(Boolean(missing), `missing fixture: ${missing}`)

		await routePgxPackageToLocalFiles(page)
		await gotoLab(page)
		await chooseGenomeFiles(page, GENOME_23ANDME)
		await expect(page.getByTestId('session-genome-row')).toHaveCount(1, { timeout: 30_000 })
		await dragFilesIntoLab(page, [packageZip])
		await page.reload({ waitUntil: 'domcontentloaded' })

		await expect(page.getByTestId('session-genome-row')).toHaveCount(0)
		await expect(page.getByTestId('saved-local-file-title').filter({ hasText: 'pgx-1.zip' })).toHaveCount(0)
		await expect(page.getByText(PGX_PACKAGE_ZIP_URL)).toHaveCount(0)
	})
})
