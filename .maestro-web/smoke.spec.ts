import { test, expect } from '@playwright/test'

const BASE_URL = process.env.WEB_URL ?? 'http://localhost:8081'

test('web smoke', async ({ page }) => {
	const errors: string[] = []
	page.on('pageerror', (err) => errors.push(err.message))
	page.on('console', (msg) => {
		if (msg.type() === 'error') errors.push(msg.text())
	})

	await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
	await page.screenshot({ path: '.maestro-web/screenshots/01-launch.png', fullPage: true })

	const understand = page.getByText('I understand and want to continue', { exact: false })
	if (await understand.isVisible({ timeout: 10_000 }).catch(() => false)) {
		await page.screenshot({ path: '.maestro-web/screenshots/02-warning-screen.png', fullPage: true })
		await understand.click()
		await page.waitForTimeout(600)
		await page.screenshot({ path: '.maestro-web/screenshots/03-checkbox-ticked.png', fullPage: true })

		const cont = page.getByText(/^Continue$/)
		await expect(cont).toBeVisible({ timeout: 10_000 })
		await cont.click()
		await page.waitForTimeout(600)
	}

	await expect(page.getByText('Getting Started', { exact: true }).first()).toBeVisible({ timeout: 30_000 })
	await expect(page.getByRole('button', { name: 'Run 23andMe + Drug Interactions Example' })).toBeVisible()
	await expect(page.getByRole('button', { name: 'Run 1000 Genomes VCF + Prostate Cancer Example' })).toBeVisible()
	await page.screenshot({ path: '.maestro-web/screenshots/04-home.png', fullPage: true })

	const fatal = errors.filter(
		(msg) =>
			!msg.includes('Invalid DOM property') &&
			!msg.includes('DevTools') &&
			!msg.includes('favicon') &&
			!msg.includes('Failed to load resource') &&
			!msg.includes('Permissions policy violation: compute-pressure is not allowed in this document')
	)
	expect(fatal, `console/page errors:\n${fatal.join('\n')}`).toEqual([])
})
