import fs from 'node:fs'
import path from 'node:path'
import { type Page, expect } from '@playwright/test'
import { parse } from 'yaml'

export const BASE_URL = process.env.WEB_URL ?? 'http://localhost:8081'
export const REPO_ROOT = path.resolve(__dirname, '..')
export const GENOME_23ANDME = path.join(
	REPO_ROOT,
	'test-data/23andme/v5/hu50B3F5/genome_hu50B3F5_v5_Full.zip',
)
export const PGX_RELEASE_YAML = path.join(REPO_ROOT, 'exvitae/assays/pgx/pgx-1/pgx-1.yaml')
export const PGX_RELEASE_URL = 'https://github.com/madhavajay/exvitae/blob/main/assays/pgx/pgx-1/pgx-1.yaml'
export const PGX_PACKAGE_ZIP_URL = 'https://github.com/madhavajay/exvitae/blob/main/assays/pgx/pgx-1/pgx-1.zip'

export function fixturePath(relativePath: string): string {
	return path.join(REPO_ROOT, relativePath)
}

export function localPackageZipFromRelease(): string {
	const release = parse(fs.readFileSync(PGX_RELEASE_YAML, 'utf8')) as {
		artifact?: { path?: string; url?: string }
	}
	const artifactRef = release.artifact?.path ?? release.artifact?.url
	if (!artifactRef) throw new Error(`${PGX_RELEASE_YAML} is missing artifact.path or artifact.url`)
	const artifactName = path.basename(new URL(artifactRef, PGX_RELEASE_URL).pathname)
	return path.join(path.dirname(PGX_RELEASE_YAML), artifactName)
}

export function missingFixture(files: string[]): string | undefined {
	return files.find((file) => !fs.existsSync(file))
}

export async function dismissDisclaimer(page: Page) {
	const understand = page.getByText('I understand and want to continue', { exact: false })
	if (await understand.isVisible().catch(() => false)) {
		await understand.click()
		await page.getByText(/^Continue$/).click({ timeout: 10_000 })
	}
}

export async function dismissRememberFilesPrompt(page: Page) {
	const notNow = page.getByText('Not now', { exact: true })
	if (await notNow.isVisible({ timeout: 5_000 }).catch(() => false)) {
		await notNow.evaluate((element) => {
			;(element as HTMLElement).click()
		})
	}
}

export async function dismissSharedResourcePrompt(page: Page) {
	const dialog = page.getByLabel('Shared resource dialog', { exact: true })
	if (!(await dialog.isVisible({ timeout: 1_000 }).catch(() => false))) return
	const ignore = dialog.getByRole('button', { name: 'Ignore' })
	if (await ignore.isVisible({ timeout: 1_000 }).catch(() => false)) {
		await ignore.evaluate((element) => {
			;(element as HTMLElement).click()
		})
	} else {
		await dialog.getByRole('button', { name: 'Close shared resource dialog' }).evaluate((element) => {
			;(element as HTMLElement).click()
		})
	}
	await expect(dialog).toBeHidden({ timeout: 10_000 })
}

export async function gotoLab(page: Page) {
	await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
	await dismissDisclaimer(page)
	await page.goto(`${BASE_URL}/lab`, { waitUntil: 'domcontentloaded' })
	await expect(page.getByText('Import genome', { exact: true })).toBeVisible({ timeout: 30_000 })
}

export async function routePgxPackageToLocalFiles(page: Page) {
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

export async function importPgxReleaseFromUrl(page: Page) {
	await page.evaluate((url) => {
		window.location.hash = `url=${encodeURIComponent(url)}`
	}, PGX_RELEASE_URL)
	const dialog = page.getByLabel('Shared resource dialog', { exact: true })
	await expect(dialog.getByText(/Fetch this URL\?|Load this file URL\?/)).toBeVisible({ timeout: 30_000 })
	await dialog.getByRole('button', { name: /Fetch URL|Load file/ }).evaluate((element) => {
		;(element as HTMLElement).click()
	})
	const fetchDependencies = dialog.getByRole('button', { name: /Fetch dependencies|Refetch dependencies/ })
	if (await fetchDependencies.isVisible({ timeout: 30_000 }).catch(() => false)) {
		await fetchDependencies.evaluate((element) => {
			;(element as HTMLElement).click()
		})
		await expect(dialog.getByText(/33 dependency files fetched for this session\./)).toBeVisible({ timeout: 60_000 })
	}
	const done = dialog.getByText('Done', { exact: true }).first()
	if (await done.isVisible({ timeout: 1_000 }).catch(() => false)) {
		await done.evaluate((element) => {
			;(element as HTMLElement).click()
		})
	} else {
		const closeSharedResource = dialog.getByRole('button', { name: 'Close shared resource dialog' })
		if (await closeSharedResource.isVisible({ timeout: 1_000 }).catch(() => false)) {
			await closeSharedResource.evaluate((element) => {
				;(element as HTMLElement).click()
			})
		}
	}
	await expect(dialog).toBeHidden({ timeout: 10_000 })
	await page.evaluate(() => {
		window.history.replaceState(null, '', window.location.pathname + window.location.search)
	})
	await dismissSharedResourcePrompt(page)
	await dismissRememberFilesPrompt(page)
}

export async function chooseGenomeFiles(page: Page, files: string | string[]) {
	const importDialog = page.getByLabel('Import genome dialog')
	const [chooser] = await Promise.all([
		page.waitForEvent('filechooser'),
		(async () => {
			if (!(await importDialog.isVisible({ timeout: 500 }).catch(() => false))) {
				await page.getByText('Import genome', { exact: true }).click()
			}
			await page.getByLabel('Choose genome files').click()
		})(),
	])
	await chooser.setFiles(files)
	await dismissRememberFilesPrompt(page)
}

export async function dragFilesIntoLab(page: Page, files: string[]) {
	const payload = files.map((file) => ({
		base64: fs.readFileSync(file).toString('base64'),
		name: path.basename(file),
		type: mimeTypeFor(file),
	}))
	const dataTransfer = await page.evaluateHandle((items) => {
		const dt = new DataTransfer()
		for (const item of items) {
			const bin = atob(item.base64)
			const bytes = new Uint8Array(bin.length)
			for (let index = 0; index < bin.length; index += 1) bytes[index] = bin.charCodeAt(index)
			dt.items.add(new File([bytes], item.name, { type: item.type }))
		}
		return dt
	}, payload)
	await page.dispatchEvent('body', 'dragenter', { dataTransfer })
	await page.dispatchEvent('body', 'dragover', { dataTransfer })
	await page.dispatchEvent('body', 'drop', { dataTransfer })
	await dismissRememberFilesPrompt(page)
}

export function mimeTypeFor(file: string): string {
	const lower = file.toLowerCase()
	if (lower.endsWith('.zip')) return 'application/zip'
	if (lower.endsWith('.gz')) return 'application/gzip'
	if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'application/yaml'
	if (lower.endsWith('.txt')) return 'text/plain'
	return 'application/octet-stream'
}
