import fs from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { GENOME_23ANDME, gotoLab, localPackageZipFromRelease, missingFixture } from './lab-test-helpers'

const CACHE_DB = 'biovault-remote-lab-files'
const CACHE_STORE = 'files'
const REMOTE_GENOME_URL = 'https://fixtures.biovault.test/genome_hu50B3F5_v5_Full.zip'
const REMOTE_PGX_ZIP_URL = 'https://fixtures.biovault.test/pgx-1.zip'

async function routeRemoteFile(page: Page, url: string, file: string, contentType: string) {
	await page.route(url, async (route) => {
		await route.fulfill({ body: fs.readFileSync(file), contentType })
	})
}

async function loadUrlFromHash(page: Page, url: string) {
	await page.evaluate((targetUrl) => {
		window.location.hash = `url=${encodeURIComponent(targetUrl)}`
	}, url)
	const dialog = page.getByLabel('Shared resource dialog', { exact: true })
	await expect(dialog.getByText('Load this file URL?')).toBeVisible({ timeout: 30_000 })
	await dialog.getByRole('button', { name: 'Load file' }).click()
	await expect(dialog.getByText(/REMOTE FILE LOADED|Load failed/i).first()).toBeVisible({ timeout: 60_000 })
	return dialog
}

async function cachedUrls(page: Page): Promise<string[]> {
	return page.evaluate(
		async ({ dbName, storeName }) => {
			const db = await new Promise<IDBDatabase>((resolve, reject) => {
				const request = indexedDB.open(dbName, 1)
				request.onsuccess = () => resolve(request.result)
				request.onerror = () => reject(request.error)
			})
			try {
				return await new Promise<string[]>((resolve, reject) => {
					const tx = db.transaction(storeName, 'readonly')
					const request = tx.objectStore(storeName).getAll()
					request.onsuccess = () => resolve(((request.result as Array<{ sourceUrl?: string }> | undefined) ?? []).map((row) => row.sourceUrl ?? ''))
					request.onerror = () => reject(request.error)
				})
			} finally {
				db.close()
			}
		},
		{ dbName: CACHE_DB, storeName: CACHE_STORE },
	)
}

test.describe('lab remote cache — web', () => {
	test('cached genome ZIP survives refresh and can be removed with its cache record', async ({ page }) => {
		const missing = missingFixture([GENOME_23ANDME])
		test.skip(Boolean(missing), `missing fixture: ${missing}`)
		await routeRemoteFile(page, REMOTE_GENOME_URL, GENOME_23ANDME, 'application/zip')

		await gotoLab(page)
		const dialog = await loadUrlFromHash(page, REMOTE_GENOME_URL)
		await expect(page.getByTestId('session-genome-row').getByText('genome_hu50B3F5_v5_Full.zip')).toBeVisible({ timeout: 30_000 })
		await expect(await cachedUrls(page)).toContain(REMOTE_GENOME_URL)
		await dialog.getByRole('button', { name: 'Done' }).click()

		await page.reload({ waitUntil: 'domcontentloaded' })
		const cachedRow = page.getByTestId('saved-local-file-row').filter({ hasText: 'genome_hu50B3F5_v5_Full.zip' })
		await expect(cachedRow.getByTestId('saved-local-file-title')).toBeVisible({ timeout: 30_000 })
		await cachedRow.getByTestId('saved-local-file-forget').evaluate((element) => {
			;(element as HTMLElement).click()
		})
		await expect(await cachedUrls(page)).not.toContain(REMOTE_GENOME_URL)
	})

	test('cached assay package ZIP survives refresh but is excluded from genome rows', async ({ page }) => {
		const packageZip = localPackageZipFromRelease()
		const missing = missingFixture([packageZip])
		test.skip(Boolean(missing), `missing fixture: ${missing}`)
		await routeRemoteFile(page, REMOTE_PGX_ZIP_URL, packageZip, 'application/zip')

		await gotoLab(page)
		await loadUrlFromHash(page, REMOTE_PGX_ZIP_URL)
		await expect(await cachedUrls(page)).toContain(REMOTE_PGX_ZIP_URL)
		await page.reload({ waitUntil: 'domcontentloaded' })

		await expect(page.getByTestId('session-genome-row')).toHaveCount(0)
		await expect(page.getByTestId('saved-local-file-title').filter({ hasText: 'pgx-1.zip' })).toHaveCount(0)
	})

	test('disallowed hosts fail clearly without writing cache records', async ({ page }) => {
		await gotoLab(page)
		await page.evaluate(() => {
			window.location.hash = `url=${encodeURIComponent('https://example.com/not-allowed.zip')}`
		})
		const dialog = page.getByLabel('Shared resource dialog', { exact: true })
		await expect(dialog.getByText('Load this file URL?')).toBeVisible({ timeout: 30_000 })
		await dialog.getByRole('button', { name: 'Load file' }).click()
		await expect(dialog.getByText(/github\.com, raw\.githubusercontent\.com, or an allowed local test host/)).toBeVisible({ timeout: 30_000 })
		await expect(await cachedUrls(page)).not.toContain('https://example.com/not-allowed.zip')
	})
})
