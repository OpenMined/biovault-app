import fs from 'node:fs'
import path from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { parse } from 'yaml'
import { dragFilesIntoLab } from './lab-test-helpers'

const BASE_URL = process.env.WEB_URL ?? 'http://localhost:8081'
const REPO_ROOT = path.resolve(__dirname, '..')
const GENOME_23ANDME = path.join(
	REPO_ROOT,
	'test-data/23andme/v5/hu50B3F5/genome_hu50B3F5_v5_Full.zip',
)
const PGX_RELEASE_YAML = path.join(REPO_ROOT, 'exvitae/assays/pgx/pgx-1/pgx-1.yaml')
const PGX_RELEASE_URL = 'https://github.com/madhavajay/exvitae/blob/main/assays/pgx/pgx-1/pgx-1.yaml'

function localPackageZipFromRelease(): string {
	const release = parse(fs.readFileSync(PGX_RELEASE_YAML, 'utf8')) as {
		artifact?: { path?: string; url?: string }
	}
	const artifactRef = release.artifact?.path ?? release.artifact?.url
	if (!artifactRef) throw new Error(`${PGX_RELEASE_YAML} is missing artifact.path or artifact.url`)
	const artifactName = path.basename(new URL(artifactRef, PGX_RELEASE_URL).pathname)
	return path.join(path.dirname(PGX_RELEASE_YAML), artifactName)
}

async function dismissDisclaimer(page: Page) {
	const understand = page.getByText('I understand and want to continue', { exact: false })
	if (await understand.isVisible().catch(() => false)) {
		await understand.click()
		await page.getByText(/^Continue$/).click({ timeout: 10_000 })
	}
}

async function dismissRememberFilesPrompt(page: Page) {
	const notNow = page.getByText('Not now', { exact: true })
	if (await notNow.isVisible({ timeout: 5_000 }).catch(() => false)) {
		await notNow.evaluate((element) => {
			;(element as HTMLElement).click()
		})
	}
}

async function routePgxPackageToLocalFiles(page: Page) {
	const packageZip = localPackageZipFromRelease()
	await page.route('**/assays/pgx/pgx-1/pgx-1.yaml', async (route) => {
		await route.fulfill({
			body: fs.readFileSync(PGX_RELEASE_YAML),
			contentType: 'application/yaml',
		})
	})
	await page.route('**/assays/pgx/pgx-1/*.zip', async (route) => {
		await route.fulfill({
			body: fs.readFileSync(packageZip),
			contentType: 'application/zip',
		})
	})
}

test('lab: PGx-1 package runs against default 23andMe ZIP in browser', async ({ page }) => {
	const packageZip = fs.existsSync(PGX_RELEASE_YAML) ? localPackageZipFromRelease() : ''
	const missing = [GENOME_23ANDME, PGX_RELEASE_YAML, packageZip].find((file) => !file || !fs.existsSync(file))
	test.skip(Boolean(missing), `missing fixture: ${missing}`)
	test.setTimeout(240_000)

	const errors: string[] = []
	page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
	page.on('console', (msg) => {
		if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`)
	})
	await routePgxPackageToLocalFiles(page)

	await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
	await dismissDisclaimer(page)
	await page.goto(`${BASE_URL}/lab`, { waitUntil: 'domcontentloaded' })
	await expect(page.getByText('Import genome', { exact: true })).toBeVisible({ timeout: 30_000 })

	await dragFilesIntoLab(page, [GENOME_23ANDME])
	await expect(page.getByText('Genome complete').first()).toBeVisible({ timeout: 30_000 })

	await expect(page.getByText('PGx-1 Panel', { exact: true }).first()).toBeVisible({ timeout: 30_000 })
	await page.evaluate((url) => {
		window.location.hash = `url=${encodeURIComponent(url)}`
	}, PGX_RELEASE_URL)
	const dialog = page.getByLabel('Shared resource dialog', { exact: true })
	await expect(dialog.getByText('Fetch this URL?')).toBeVisible({ timeout: 30_000 })
	await dialog.getByRole('button', { name: 'Fetch URL' }).evaluate((element) => {
		;(element as HTMLElement).click()
	})
	const fetchDependencies = dialog.getByRole('button', { name: /Fetch dependencies|Refetch dependencies/ })
	if (await fetchDependencies.isVisible({ timeout: 30_000 }).catch(() => false)) {
		await fetchDependencies.evaluate((element) => {
			;(element as HTMLElement).click()
		})
		await expect(dialog.getByText(/33 dependency files fetched for this session\./)).toBeVisible({ timeout: 60_000 })
	}
	await expect(page.getByTestId('assay-result-row').filter({ hasText: 'PGx-1 Panel' }).first().getByText('Run panel', { exact: true })).toBeVisible({ timeout: 60_000 })
	const closeSharedResource = dialog.getByRole('button', { name: 'Close shared resource dialog' })
	if (await closeSharedResource.isVisible({ timeout: 1_000 }).catch(() => false)) {
		await closeSharedResource.click({ force: true, timeout: 5_000 }).catch(() => {})
	}
	if (await dialog.isVisible({ timeout: 1_000 }).catch(() => false)) {
		await expect(dialog).toBeHidden({ timeout: 10_000 })
	}

	await expect(page.getByText('PGx-1 Panel', { exact: true })).toHaveCount(1)
	await dismissRememberFilesPrompt(page)
	await page.screenshot({
		path: '.maestro-web/screenshots/lab-pgx-01-loaded.png',
		fullPage: true,
	})

	await page.getByText('Run panel', { exact: true }).evaluate((element) => {
		;(element as HTMLElement).click()
	})
	await expect(page.getByText('Run failed')).toHaveCount(0)
	await expect(page.getByText('unreachable')).toHaveCount(0)
	await expect(page.getByText('4 result artifacts saved locally.')).toBeVisible({ timeout: 180_000 })

	await page.getByText('View result', { exact: true }).click()
	// The 4 download buttons in the modal's ARTIFACTS row.
	await expect(page.getByText('ARTIFACTS', { exact: true })).toBeVisible({ timeout: 30_000 })
	await expect(page.getByRole('link', { name: 'observations.tsv' })).toBeVisible()
	await expect(page.getByRole('link', { name: 'analysis.jsonl' })).toBeVisible()
	await expect(page.getByRole('link', { name: 'reports.jsonl' })).toBeVisible()
	await expect(page.getByRole('link', { name: 'index.html' })).toBeVisible()

	// The rust-rendered report lives in an iframe (srcDoc). Inspect it directly.
	const reportFrame = page.frameLocator('iframe[title="index.html"]')
	await expect(reportFrame.getByText('37 observation(s)', { exact: false })).toBeVisible({ timeout: 30_000 })
	await expect(reportFrame.getByText('2 analysis output(s)', { exact: false })).toBeVisible()
	await expect(reportFrame.getByText('mthfr_677ct_1298ac_compound_heterozygous').first()).toBeVisible()
	await expect(reportFrame.getByText('APOE epsilon genotype').first()).toBeVisible()
	await expect(reportFrame.getByText('MTHFR combined genotype').first()).toBeVisible()
	await expect(reportFrame.getByText('e3/e3').first()).toBeVisible()
	// Section navigation generated by the rust report renderer.
	await expect(reportFrame.getByRole('link', { name: 'Observations', exact: true })).toBeVisible()
	await expect(reportFrame.getByRole('link', { name: 'Analysis', exact: true })).toBeVisible()
	await expect(reportFrame.getByRole('link', { name: 'PGx', exact: true })).toBeVisible()
	// Specific known variant rows that the rust observation table renders.
	await expect(reportFrame.getByText('rs429358').first()).toBeVisible()
	await expect(reportFrame.getByText('rs1801133').first()).toBeVisible()
	// PGx label findings (from the rust PGx panel).
	await expect(reportFrame.getByText('peginterferon alfa-2b').first()).toBeVisible()

	expect(errors.join('\n')).not.toContain('time not implemented on this platform')
	expect(errors.join('\n')).not.toContain('unreachable')

	await page.screenshot({
		path: '.maestro-web/screenshots/lab-pgx-02-after-run.png',
		fullPage: true,
	})
})
