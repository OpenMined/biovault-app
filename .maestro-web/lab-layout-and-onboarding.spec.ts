import { test, expect } from '@playwright/test'
import { BASE_URL, GENOME_23ANDME, chooseGenomeFiles, dismissRememberFilesPrompt, gotoLab, missingFixture } from './lab-test-helpers'

test.describe('lab layout, onboarding, and copy — web', () => {
	test('first load agreement accepts once and persists after refresh', async ({ page }) => {
		await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
		const agreement = page.getByText('I understand and want to continue', { exact: false })
		if (await agreement.isVisible({ timeout: 5_000 }).catch(() => false)) {
			await agreement.click()
			await page.getByText(/^Continue$/).click({ timeout: 10_000 })
		}
		await expect(agreement).toHaveCount(0)
		await page.reload({ waitUntil: 'domcontentloaded' })
		await expect(agreement).toHaveCount(0)
	})

	test('import copy and sample state stay consistent', async ({ page }) => {
		const missing = missingFixture([GENOME_23ANDME])
		test.skip(Boolean(missing), `missing fixture: ${missing}`)

		await gotoLab(page)
		await page.getByText('Import genome', { exact: true }).click()
		const importDialog = page.getByLabel('Import genome dialog')
		await expect(importDialog).toBeVisible()
		await expect(importDialog.getByText('BAM/CRAM references are required. Indexes for BAM/CRAM/VCF are optional.')).toBeVisible()
		await expect(importDialog.getByText('Paste a URL to a text or zip SNP array, or VCF to download into the browser.')).toBeVisible()
		await expect(importDialog.getByText(/genome_hu50B3F5_v5_Full\.zip/)).toBeVisible()
		await page.keyboard.press('Escape')

		await chooseGenomeFiles(page, GENOME_23ANDME)
		await expect(page.getByText('Genome complete', { exact: true })).toBeVisible({ timeout: 30_000 })
		await dismissRememberFilesPrompt(page)
		await page.getByText('Import genome', { exact: true }).evaluate((element) => {
			;(element as HTMLElement).click()
		})
		await expect(importDialog).toBeVisible()
		await expect(importDialog.getByLabel(/Download .*23andMe/i)).toHaveAttribute('aria-disabled', 'true')
	})

	test('getting started toggle preserves loaded genome and basic sidebar/footer layout', async ({ page }) => {
		const missing = missingFixture([GENOME_23ANDME])
		test.skip(Boolean(missing), `missing fixture: ${missing}`)

		await gotoLab(page)
		await chooseGenomeFiles(page, GENOME_23ANDME)
		await expect(page.getByTestId('session-genome-row')).toHaveCount(1, { timeout: 30_000 })

		const guideButton = page.getByLabel('Open the getting started guide')
		await dismissRememberFilesPrompt(page)
		await guideButton.evaluate((element) => {
			;(element as HTMLElement).click()
		})
		await expect(page.getByRole('button', { name: 'Load sample data and run a demo assay locally' })).toBeVisible()
		await expect(page.getByTestId('session-genome-row')).toHaveCount(1)

		await page.getByLabel(/Select genome genome_hu50B3F5_v5_Full\.zip/).evaluate((element) => {
			;(element as HTMLElement).click()
		})
		await expect(page.getByText('Genome complete', { exact: true })).toBeVisible()

		const settings = page.getByLabel('Lab settings: theme and clear stored data')
		const theme = page.getByLabel(/Color theme:/)
		await expect(settings).toBeVisible()
		await expect(theme).toBeVisible()
		const settingsBox = await settings.boundingBox()
		const themeBox = await theme.boundingBox()
		expect(settingsBox?.y ?? 0).toBeGreaterThan(0)
		expect(themeBox?.x ?? 0).toBeGreaterThan(settingsBox?.x ?? 0)
		await expect(page.getByLabel(/Feedback or request a feature/)).toBeVisible()
	})
})
