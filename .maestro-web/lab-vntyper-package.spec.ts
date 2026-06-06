import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from '@playwright/test'
import {
	chooseGenomeFilesViaPicker,
	dismissRememberFilesPrompt,
	gotoLab,
	missingFixture,
} from './lab-test-helpers'

const packageZip = process.env.VNTYPER_PACKAGE_ZIP ?? ''
const inputKind = process.env.VNTYPER_INPUT_KIND ?? 'bam'
const bam = process.env.VNTYPER_BAM ?? ''
const bai = process.env.VNTYPER_BAI ?? ''
const cram = process.env.VNTYPER_CRAM ?? ''
const crai = process.env.VNTYPER_CRAI ?? ''
const fasta = process.env.VNTYPER_FASTA ?? ''
const fai = process.env.VNTYPER_FAI ?? ''
const outputDir = process.env.VNTYPER_WEB_E2E_OUT ?? ''

function requiredFixtures(): string[] {
	if (inputKind === 'cram') return [packageZip, cram, crai, fasta, fai]
	return [packageZip, bam, bai]
}

function genomeFiles(): string[] {
	if (inputKind === 'cram') return [cram, crai, fasta, fai]
	return [bam, bai]
}

test.describe('lab VNtyper package import and run — web', () => {
	test('runs VNtyper package against aligned fixture input', async ({ page }) => {
		const required = requiredFixtures()
		const missingPath = required.find((file) => !file) ?? missingFixture(required)
		test.skip(Boolean(missingPath), `missing VNtyper fixture: ${missingPath || 'unset environment variable'}`)
		test.setTimeout(360_000)

		await gotoLab(page)
		await chooseGenomeFilesViaPicker(page, [packageZip, ...genomeFiles()])
		await expect(page.getByText('Genome complete', { exact: true })).toBeVisible({ timeout: 60_000 })
		await page.getByRole('button', { name: /Assays/i }).click()
		await expect(page.getByText(/VNtyper|MUC1 VNTR/i).first()).toBeVisible({ timeout: 60_000 })
		await dismissRememberFilesPrompt(page)

		const assayRow = page.getByTestId('assay-result-row').filter({ hasText: /VNtyper|MUC1 VNTR/i }).first()
		await expect(assayRow).toBeVisible({ timeout: 60_000 })
		await expect(assayRow.getByText(/Run (assay|panel|report)/i)).toBeVisible({ timeout: 60_000 })
		await assayRow.getByText(/Run (assay|panel|report)/i).first().evaluate((element) => {
			;(element as HTMLElement).click()
		})

		await expect(page.locator('body')).not.toContainText('Run failed', { timeout: 180_000 })
		await expect(page.getByText(/result artifact/i)).toBeVisible({ timeout: 300_000 })
		await page.getByText(/View result/i).first().click()
		const analysisArtifact = page.getByRole('link', { name: 'analysis.jsonl' })
		await expect(analysisArtifact).toBeVisible({ timeout: 60_000 })
		const analysisText = await analysisArtifact.evaluate(async (link) => {
			const href = (link as HTMLAnchorElement).href
			return fetch(href).then((response) => response.text())
		})
		expect(analysisText).toContain('vntyper_status')
		expect(analysisText).toContain('vntyper_confidence')
		expect(analysisText).toContain('vntyper_variant')
		expect(analysisText).toContain('vntyper_alt_depth')

		if (outputDir) {
			fs.mkdirSync(outputDir, { recursive: true })
			await page.screenshot({
				fullPage: true,
				path: path.join(outputDir, `vntyper-${inputKind}-result.png`),
			})
		}
	})
})
