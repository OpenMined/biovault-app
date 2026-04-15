import fs from 'node:fs'
import path from 'node:path'
import { test, expect, type Page } from '@playwright/test'

const BASE_URL = process.env.WEB_URL ?? 'http://localhost:8081'
const REPO_ROOT = path.resolve(__dirname, '..')
const FIXTURE_23ANDME = path.join(
	REPO_ROOT,
	'test-data/23andme/v5/hu50B3F5/genome_hu50B3F5_v5_Full.zip',
)

async function expectInspection(page: Page) {
	const inspection = page.getByTestId('file-picker-inspection')
	await expect(inspection).toBeVisible({ timeout: 30_000 })
	await expect(page.getByTestId('inspection-kind')).toHaveText('Genotype (text)')
	await expect(page.getByTestId('inspection-vendor')).toContainText('23andMe')
	await expect(page.getByTestId('inspection-confidence')).toContainText('strong')
}

test.describe('file picker — web', () => {
	test('click Choose file → picks 23andMe v5 zip', async ({ page }) => {
		// ?e2e=input forces the <input> fallback so Playwright's filechooser is
		// the one driving the picker. The FS-Access path is covered by manual QA
		// and by the drag-drop test below.
		await page.goto(`${BASE_URL}/file-picker?e2e=input`, { waitUntil: 'domcontentloaded' })
		await expect(page.getByTestId('file-picker')).toBeVisible({ timeout: 30_000 })
		await page.screenshot({
			path: '.maestro-web/screenshots/file-picker-01-empty.png',
			fullPage: true,
		})

		const chooseButton = page.getByTestId('file-picker-pick')
		await expect(chooseButton).toBeVisible()
		const [chooser] = await Promise.all([
			page.waitForEvent('filechooser'),
			chooseButton.click(),
		])
		await chooser.setFiles(FIXTURE_23ANDME)

		await expectInspection(page)
		await page.screenshot({
			path: '.maestro-web/screenshots/file-picker-02-click-inspection.png',
			fullPage: true,
		})

		await page.getByTestId('file-picker-confirm').click()
		await expect(page.getByTestId('file-picker-confirmed')).toBeVisible()
		await page.screenshot({
			path: '.maestro-web/screenshots/file-picker-03-confirmed.png',
			fullPage: true,
		})
	})

	test('drag-and-drop → picks 23andMe v5 zip', async ({ page }) => {
		await page.goto(`${BASE_URL}/file-picker`, { waitUntil: 'domcontentloaded' })
		await expect(page.getByTestId('file-picker-drop')).toBeVisible({ timeout: 30_000 })

		const base64 = fs.readFileSync(FIXTURE_23ANDME).toString('base64')
		const dataTransfer = await page.evaluateHandle(
			({ base64, name, type }) => {
				const bin = atob(base64)
				const bytes = new Uint8Array(bin.length)
				for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
				const dt = new DataTransfer()
				dt.items.add(new File([bytes], name, { type }))
				return dt
			},
			{ base64, name: '23andme.zip', type: 'application/zip' },
		)

		const drop = page.getByTestId('file-picker-drop')
		await drop.dispatchEvent('dragenter', { dataTransfer })
		await drop.dispatchEvent('dragover', { dataTransfer })
		await page.screenshot({
			path: '.maestro-web/screenshots/file-picker-04-drag-hover.png',
			fullPage: true,
		})
		await drop.dispatchEvent('drop', { dataTransfer })

		await expectInspection(page)
		await page.screenshot({
			path: '.maestro-web/screenshots/file-picker-05-drop-inspection.png',
			fullPage: true,
		})
	})
})
