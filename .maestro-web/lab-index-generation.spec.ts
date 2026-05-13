import { test, expect } from '@playwright/test'
import {
	chooseGenomeFiles,
	fixturePath,
	gotoLab,
	missingFixture,
} from './lab-test-helpers'

const APOL1_ASSAY = fixturePath('exvitae/assays/risk/APOL1/apol1.py')
const VCF = fixturePath('test-data/1k-genomes/vcf/NA06985.clean.vcf.gz')
const CRAM = fixturePath('exvitae/assays/risk/APOL1/test-data/apol1.cram')
const BAM = fixturePath('exvitae/assays/risk/APOL1/test-data/apol1.bam')
const FASTA = fixturePath('exvitae/assays/risk/APOL1/test-data/stub.fa')

async function runApol1(page: import('@playwright/test').Page) {
	await page.getByPlaceholder('Search assays…').fill('apol1.py')
	const assayRow = page.getByTestId('assay-result-row').filter({ hasText: 'apol1.py' }).first()
	await expect(assayRow).toBeVisible({ timeout: 30_000 })
	await expect(assayRow.getByText('Run assay', { exact: true })).toBeVisible({ timeout: 120_000 })
	await assayRow.getByText('Run assay', { exact: true }).click()
}

test.describe('lab index generation — web', () => {
	test('VCF missing .tbi can cancel, generate, run, and reuse generated index', async ({ page }) => {
		const missing = missingFixture([APOL1_ASSAY, VCF])
		test.skip(Boolean(missing), `missing optional VCF fixture: ${missing}`)
		test.setTimeout(240_000)

		await gotoLab(page)
		await chooseGenomeFiles(page, [APOL1_ASSAY, VCF])
		await expect(page.getByText('NA06985.clean.vcf.gz', { exact: true }).first()).toBeVisible({ timeout: 30_000 })

		await runApol1(page)
		const prompt = page.getByLabel('Generate VCF index')
		await expect(prompt.getByText('NA06985.clean.vcf.gz.tbi')).toBeVisible({ timeout: 30_000 })
		await prompt.getByRole('button', { name: 'Cancel' }).click()
		await expect(prompt).toBeHidden({ timeout: 10_000 })

		await runApol1(page)
		await expect(prompt.getByText('NA06985.clean.vcf.gz.tbi')).toBeVisible({ timeout: 30_000 })
		await prompt.getByRole('button', { name: 'Generate index' }).click()
		await expect(page.getByText('Latest result')).toBeVisible({ timeout: 180_000 })
		await expect(page.locator('body')).not.toContainText('Run failed')

		await runApol1(page)
		await expect(prompt).toHaveCount(0)
		await expect(page.getByText('Latest result')).toBeVisible({ timeout: 180_000 })
	})

	for (const fixture of [
		{ file: CRAM, index: 'apol1.cram.crai', label: 'CRAM' },
		{ file: BAM, index: 'apol1.bam.bai', label: 'BAM' },
	]) {
		test(`${fixture.label} missing indexes can cancel, generate, run, and reuse generated indexes`, async ({ page }) => {
			const missing = missingFixture([APOL1_ASSAY, fixture.file, FASTA])
			test.skip(Boolean(missing), `missing fixture: ${missing}`)
			test.setTimeout(240_000)

			await gotoLab(page)
			await chooseGenomeFiles(page, [APOL1_ASSAY, fixture.file, FASTA])
			await expect(page.getByText(fixture.file.split('/').pop()!, { exact: true }).first()).toBeVisible({ timeout: 30_000 })

			const prompt = page.getByLabel('Generate alignment indexes')
			await expect(prompt.getByText(fixture.index)).toBeVisible({ timeout: 30_000 })
			await expect(prompt.getByText('stub.fa.fai')).toBeVisible()
			await prompt.getByRole('button', { name: 'Cancel' }).click()
			await expect(prompt).toBeHidden({ timeout: 10_000 })

			await runApol1(page)
			await expect(prompt.getByText(fixture.index)).toBeVisible({ timeout: 30_000 })
			await prompt.getByRole('button', { name: 'Generate indexes' }).click()
			await expect(page.getByText('Latest result')).toBeVisible({ timeout: 180_000 })
			await expect(page.locator('body')).not.toContainText('Run failed')

			await runApol1(page)
			await expect(prompt).toHaveCount(0)
			await expect(page.getByText('Latest result')).toBeVisible({ timeout: 180_000 })
		})
	}
})
