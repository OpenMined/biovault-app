import fs from 'node:fs'
import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { zipSync, strToU8 } from 'fflate'
import { test, expect, type Page } from '@playwright/test'
import { sharedLabTestScenarios, type SharedLabTestScenario } from '../tests/lab-scenarios'

const BASE_URL = process.env.WEB_URL ?? 'http://localhost:1420'
const REPO_ROOT = path.resolve(__dirname, '..')

declare global {
	interface Window {
		__BIOVAULT_DESKTOP_TEST_PICK_PATHS__?: string[]
	}
}

async function openLab(page: Page) {
	await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
	const understand = page.getByText('I understand and want to continue', { exact: false })
	if (await understand.isVisible().catch(() => false)) {
		await understand.click()
		await page.getByText(/^Continue$/).click({ timeout: 10_000 })
	}
	await expect(page.getByRole('heading', { name: 'Lab' })).toBeVisible({ timeout: 30_000 })
}

async function pickDesktopPaths(page: Page, paths: string[]) {
	await page.evaluate((nextPaths) => {
		window.__BIOVAULT_DESKTOP_TEST_PICK_PATHS__ = nextPaths
	}, paths)
	await page.getByRole('button', { name: 'Choose Files' }).click()
}

async function dropDesktopPaths(page: Page, paths: string[]) {
	await page.locator('section').filter({ hasText: 'Local files' }).first().evaluate((element, nextPaths) => {
		const transfer = new DataTransfer()
		transfer.setData('text/plain', nextPaths.join('\n'))
		element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
	}, paths)
}

async function runScenario(page: Page, scenario: SharedLabTestScenario, paths: string[]) {
	await pickDesktopPaths(page, paths)
	await expect(page.getByText(scenario.genome?.expectDisplayName ?? '', { exact: false }).first()).toBeVisible({ timeout: 30_000 })
	await expect(page.getByRole('button', { name: 'Run Assay' })).toBeEnabled({ timeout: 30_000 })
	await page.getByRole('button', { name: 'Run Assay' }).click()
	await expect(page.getByText(scenario.assert.contains, { exact: false })).toBeVisible({ timeout: 180_000 })
	const body = (await page.textContent('body')) ?? ''
	for (const text of scenario.assert.notContains ?? []) {
		expect(body).not.toContain(text)
	}
}

function fixturePath(relativePath: string): string {
	return path.join(REPO_ROOT, relativePath)
}

function createZipFixture(sourcePath: string, outputDir: string): string {
	mkdirSync(outputDir, { recursive: true })
	const zipPath = path.join(outputDir, 'desktop-ui-apol1-g0g0.zip')
	const bytes = zipSync({
		'apol1-g0g0.txt': strToU8(fs.readFileSync(sourcePath, 'utf8')),
	})
	fs.writeFileSync(zipPath, bytes)
	return zipPath
}

function scenarioPaths(scenario: SharedLabTestScenario, outputDir: string): string[] {
	const genome = scenario.genome
	const assay = scenario.assay
	const genomePaths = genome?.zipSourcePath
		? [createZipFixture(fixturePath(genome.zipSourcePath), outputDir)]
		: (genome?.files ?? []).map(fixturePath)
	return assay ? [fixturePath(assay.path), ...genomePaths] : genomePaths
}

test.describe('desktop Lab UI via WebSocket bridge', () => {
	for (const scenario of sharedLabTestScenarios.filter((item) => item.platforms.includes('desktop'))) {
		test(scenario.title, async ({ page }, testInfo) => {
			test.setTimeout(240_000)
			await openLab(page)

			const paths = scenarioPaths(scenario, testInfo.outputDir)
			const missing = paths.find((file) => !fs.existsSync(file))
			test.skip(Boolean(missing), scenario.optional ? scenario.missingMessage : `missing fixture: ${missing}`)

			if (scenario.action === 'app_smoke') {
				await expect(page.getByRole('heading', { name: scenario.assert.contains })).toBeVisible()
				return
			}

			if (scenario.action === 'file_picker') {
				await pickDesktopPaths(page, paths)
				await expect(page.getByText(scenario.genome?.expectDisplayName ?? '', { exact: false }).first()).toBeVisible({ timeout: 30_000 })
				return
			}

			if (scenario.action === 'drag_drop') {
				await dropDesktopPaths(page, paths)
				await expect(page.getByText(scenario.genome?.expectDisplayName ?? '', { exact: false }).first()).toBeVisible({ timeout: 30_000 })
				return
			}

			if (scenario.action === 'run_assay') {
				await runScenario(page, scenario, paths)
				return
			}
		})
	}
})
