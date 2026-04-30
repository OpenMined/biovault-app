import fs from 'node:fs'
import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { zipSync, strToU8 } from 'fflate'
import { test, expect, type Page } from '@playwright/test'
import { labFormatMatrixScenarios } from '../tests/lab-scenarios'

const BASE_URL = process.env.WEB_URL ?? 'http://localhost:8081'
const REPO_ROOT = path.resolve(__dirname, '..')

async function dismissDisclaimer(page: Page) {
	const understand = page.getByText('I understand and want to continue', { exact: false })
	if (await understand.isVisible().catch(() => false)) {
		await understand.click()
		await page.getByText(/^Continue$/).click({ timeout: 10_000 })
	}
}

async function loadGenomeFiles(page: Page, files: string[]) {
	await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
	await dismissDisclaimer(page)
	await page.goto(`${BASE_URL}/lab`, { waitUntil: 'domcontentloaded' })
	await expect(page.getByText(/Drop a genome|Drop a different genome/)).toBeVisible({ timeout: 30_000 })

	const [chooser] = await Promise.all([
		page.waitForEvent('filechooser'),
		page.getByText(/Drop a genome|Drop a different genome/).first().click(),
	])
	await chooser.setFiles(files)
}

async function runApol1AndExpectStatus(page: Page, genomeName: string, expectedStatus: string) {
	await expect(page.getByText(genomeName, { exact: false })).toBeVisible({ timeout: 30_000 })
	await expect(page.getByText('APOL1 kidney risk', { exact: false })).toBeVisible({ timeout: 30_000 })
	await expect(page.getByText('Run assay', { exact: true }).first()).toBeVisible({ timeout: 120_000 })

	await page.getByText('Run assay', { exact: true }).first().click()

	await expect(page.getByText('LATEST RESULT')).toBeVisible({ timeout: 120_000 })
	await expect(page.getByText('APOL1 kidney risk', { exact: false }).first()).toBeVisible()
	const body = await page.textContent('body')
	expect(body ?? '').not.toContain("Invalid exception type: 'Error'")
	expect(body ?? '').not.toContain('Run failed')
	expect(body ?? '').toContain(expectedStatus)
}

function fixturePath(relativePath: string): string {
	return path.join(REPO_ROOT, relativePath)
}

function createZipFixture(sourcePath: string, outputDir: string): string {
	mkdirSync(outputDir, { recursive: true })
	const zipPath = path.join(outputDir, 'apol1-g0g0.zip')
	const bytes = zipSync({
		'apol1-g0g0.txt': strToU8(fs.readFileSync(sourcePath, 'utf8')),
	})
	fs.writeFileSync(zipPath, bytes)
	return zipPath
}

test.describe('lab format matrix — web', () => {
	for (const scenario of labFormatMatrixScenarios) {
		test(scenario.title, async ({ page }, testInfo) => {
			const fixturePaths = scenario.fixturePaths.map(fixturePath)
			const zipSourcePath = scenario.zipSourcePath ? fixturePath(scenario.zipSourcePath) : null
			const requiredPaths = zipSourcePath ? [zipSourcePath] : fixturePaths
			const missing = requiredPaths.find((file) => !fs.existsSync(file))
			test.skip(Boolean(missing), scenario.optional ? scenario.missingMessage : `missing fixture: ${missing}`)
			test.setTimeout(180_000)

			const files = zipSourcePath
				? [createZipFixture(zipSourcePath, testInfo.outputDir)]
				: fixturePaths
			await loadGenomeFiles(page, files)
			await runApol1AndExpectStatus(page, scenario.expectedGenomeName, scenario.expectedStatus)
		})
	}
})
