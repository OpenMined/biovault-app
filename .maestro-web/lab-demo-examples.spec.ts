import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { test, expect, type Page } from '@playwright/test'
import { parse } from 'yaml'
import { fixturePath, gotoLab, missingFixture } from './lab-test-helpers'

const NA06985_VCF = fixturePath('test-data/1k-genomes/vcf/NA06985.clean.vcf.gz')
const NA06985_TBI = fixturePath('test-data/1k-genomes/vcf/NA06985.clean.vcf.gz.tbi')
const PROSTATE_RELEASE_YAML = fixturePath('exvitae/assays/risk/prostate-cancer-prs/prostate-cancer-prs.yaml')
const PROSTATE_RELEASE_URL =
	'https://github.com/madhavajay/exvitae/blob/main/assays/risk/prostate-cancer-prs/prostate-cancer-prs.yaml'

function localProstatePackageZip(): string {
	const release = parse(fs.readFileSync(PROSTATE_RELEASE_YAML, 'utf8')) as {
		artifact?: { path?: string; url?: string }
	}
	const artifactRef = release.artifact?.path ?? release.artifact?.url
	if (!artifactRef) throw new Error(`${PROSTATE_RELEASE_YAML} is missing artifact.path or artifact.url`)
	const artifactName = path.basename(new URL(artifactRef, PROSTATE_RELEASE_URL).pathname)
	return path.join(path.dirname(PROSTATE_RELEASE_YAML), artifactName)
}

function writeOctal(value: number, width: number): Buffer {
	const output = Buffer.alloc(width, 0)
	const text = value.toString(8).padStart(width - 1, '0')
	output.write(text, 0, width - 1, 'ascii')
	return output
}

function createTarGzWithSingleFile(name: string, body: Buffer): Buffer {
	const header = Buffer.alloc(512, 0)
	header.write(name, 0, Math.min(Buffer.byteLength(name), 100), 'utf8')
	writeOctal(0o644, 8).copy(header, 100)
	writeOctal(0, 8).copy(header, 108)
	writeOctal(0, 8).copy(header, 116)
	writeOctal(body.byteLength, 12).copy(header, 124)
	writeOctal(0, 12).copy(header, 136)
	header.fill(0x20, 148, 156)
	header.write('0', 156, 1, 'ascii')
	header.write('ustar', 257, 5, 'ascii')
	header.write('00', 263, 2, 'ascii')
	let checksum = 0
	for (const byte of header) checksum += byte
	writeOctal(checksum, 8).copy(header, 148)
	const padding = Buffer.alloc((512 - (body.byteLength % 512)) % 512, 0)
	return zlib.gzipSync(Buffer.concat([header, body, padding, Buffer.alloc(1024, 0)]))
}

async function routeNa06985DemoFiles(page: Page) {
	const tarGz = createTarGzWithSingleFile('NA06985.clean.vcf.gz', fs.readFileSync(NA06985_VCF))
	const splitAt = Math.ceil(tarGz.byteLength / 2)
	const firstPart = tarGz.subarray(0, splitAt)
	const secondPart = tarGz.subarray(splitAt)

	await page.route('**/NA06985.clean.vcf.gz.tar.gz.aa', async (route) => {
		await route.fulfill({ body: firstPart, contentType: 'application/octet-stream' })
	})
	await page.route('**/NA06985.clean.vcf.gz.tar.gz.ab', async (route) => {
		await route.fulfill({ body: secondPart, contentType: 'application/octet-stream' })
	})
	await page.route('**/NA06985.clean.vcf.gz.tbi', async (route) => {
		await route.fulfill({ body: fs.readFileSync(NA06985_TBI), contentType: 'application/octet-stream' })
	})
}

async function routeProstatePackageToLocalFiles(page: Page) {
	const packageZip = localProstatePackageZip()
	await page.route('**/assays/risk/prostate-cancer-prs/prostate-cancer-prs.yaml', async (route) => {
		await route.fulfill({
			body: fs.readFileSync(PROSTATE_RELEASE_YAML),
			contentType: 'application/yaml',
		})
	})
	await page.route('**/assays/risk/prostate-cancer-prs/*.zip', async (route) => {
		await route.fulfill({
			body: fs.readFileSync(packageZip),
			contentType: 'application/zip',
		})
	})
}

test.describe('lab demo examples — web', () => {
	test('Getting Started VCF demo runs NA06985 through Prostate Cancer PRS', async ({ page }) => {
		const packageZip = fs.existsSync(PROSTATE_RELEASE_YAML) ? localProstatePackageZip() : ''
		const missing = missingFixture([NA06985_VCF, NA06985_TBI, PROSTATE_RELEASE_YAML, packageZip])
		test.skip(Boolean(missing), `missing fixture: ${missing}`)
		test.setTimeout(600_000)

		const errors: string[] = []
		page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
		page.on('console', (msg) => {
			if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`)
		})
		await routeNa06985DemoFiles(page)
		await routeProstatePackageToLocalFiles(page)

		await gotoLab(page)
		await page.getByRole('button', { name: 'Run 1000 Genomes VCF + Prostate Cancer Example' }).click()

		await expect(page.getByText('NA06985.clean.vcf.gz', { exact: true }).first()).toBeVisible({ timeout: 180_000 })
		await expect(page.getByText('Latest result')).toBeVisible({ timeout: 360_000 })
		await expect(page.locator('body')).not.toContainText('Run failed')
		await expect(page.locator('body')).not.toContainText('unreachable')
		await expect(page.getByText(/result artifacts saved locally\./)).toBeVisible({ timeout: 120_000 })

		await page.getByText('View result', { exact: true }).first().click()
		await expect(page.getByText('ARTIFACTS', { exact: true })).toBeVisible({ timeout: 30_000 })
		await expect(page.getByRole('link', { name: 'observations.tsv' })).toBeVisible()
		await expect(page.getByRole('link', { name: 'analysis.jsonl' })).toBeVisible()
		await expect(page.getByRole('link', { name: 'reports.jsonl' })).toBeVisible()
		await expect(page.locator('iframe[title="index.html"]')).toBeVisible({ timeout: 30_000 })
		const reportFrame = page.frameLocator('iframe[title="index.html"]')
		await expect(reportFrame.getByText(/Prostate Cancer|prostate/i).first()).toBeVisible({ timeout: 30_000 })

		expect(errors.join('\n')).not.toContain('unreachable')
		expect(errors.join('\n')).not.toContain('Run failed')
	})
})
