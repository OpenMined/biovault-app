import { test, expect } from '@playwright/test'

const BASE_URL = process.env.WEB_URL ?? 'http://localhost:1420'

test('desktop smoke', async ({ page }) => {
	const errors: string[] = []
	page.on('pageerror', (err) => errors.push(err.message))
	page.on('console', (msg) => {
		if (msg.type() === 'error') errors.push(msg.text())
	})

	await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
	await page.screenshot({ path: '.maestro-desktop/screenshots/01-launch.png', fullPage: true })

	const understand = page.getByText('I understand and want to continue', { exact: false })
	await expect(understand).toBeVisible({ timeout: 60_000 })
	await page.screenshot({ path: '.maestro-desktop/screenshots/02-warning-screen.png', fullPage: true })
	await understand.click()
	await page.waitForTimeout(600)
	await page.screenshot({ path: '.maestro-desktop/screenshots/03-checkbox-ticked.png', fullPage: true })

	const cont = page.getByText(/^Continue$/)
	await expect(cont).toBeVisible({ timeout: 10_000 })
	await cont.click()
	await page.waitForTimeout(600)

	await expect(page.getByRole('heading', { name: 'Lab' })).toBeVisible({ timeout: 30_000 })
	await expect(page.getByText('Local files', { exact: true })).toBeVisible()
	await expect(page.getByRole('button', { name: 'Choose Files' })).toBeVisible()
	await expect(page.getByRole('button', { name: 'Run Assay' })).toBeDisabled()
	await page.screenshot({ path: '.maestro-desktop/screenshots/04-lab.png', fullPage: true })

	const fatal = errors.filter(
		(msg) =>
			!msg.includes('Invalid DOM property') &&
			!msg.includes('DevTools') &&
			!msg.includes('favicon') &&
			!msg.includes('Failed to load resource')
	)
	expect(fatal, `console/page errors:\n${fatal.join('\n')}`).toEqual([])
})
