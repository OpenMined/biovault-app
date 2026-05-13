import fs from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { GENOME_23ANDME, chooseGenomeFiles, gotoLab, missingFixture } from './lab-test-helpers'

const BASE_URL = process.env.WEB_URL ?? 'http://localhost:8081'
const HANDLE_DB = 'biovault-file-handles'
const HANDLE_STORE = 'handles'
const REMOTE_DB = 'biovault-remote-lab-files'
const REMOTE_STORE = 'files'
const REMOTE_GENOME_URL = 'https://fixtures.biovault.test/genome_hu50B3F5_v5_Full.zip'

async function acceptDisclaimerIfPresent(page: Page) {
	const understand = page.getByText('I understand and want to continue', { exact: false })
	if (!(await understand.isVisible({ timeout: 2_000 }).catch(() => false))) return
	await understand.click()
	await page.getByText(/^Continue$/).click()
}

async function seedPersistedLabHandles(page: Page) {
	await page.evaluate(
		async ({ dbName, storeName }) => {
			const open = indexedDB.open(dbName, 1)
			await new Promise<IDBDatabase>((resolve, reject) => {
				open.onupgradeneeded = () => {
					if (!open.result.objectStoreNames.contains(storeName)) {
						open.result.createObjectStore(storeName)
					}
				}
				open.onsuccess = () => resolve(open.result)
				open.onerror = () => reject(open.error)
			}).then((db) => {
				const tx = db.transaction(storeName, 'readwrite')
				const store = tx.objectStore(storeName)
				store.clear()
				const names = [
					'GRCh38_full_analysis_set_plus_decoy_hla.fa',
					'GRCh38_full_analysis_set_plus_decoy_hla.fa.fai',
					'NA06985.final.cram',
					'NA06985.final.cram.crai',
				]

				for (const name of names) {
					store.put({ primary: { name } }, `lab-drop:${name}`)
				}

				return new Promise<void>((resolve, reject) => {
					tx.oncomplete = () => {
						db.close()
						resolve()
					}
					tx.onerror = () => reject(tx.error)
					tx.onabort = () => reject(tx.error)
				})
			})
		},
		{ dbName: HANDLE_DB, storeName: HANDLE_STORE },
	)
}

async function seedPersistedGenomeHandle(page: Page, name: string) {
	await page.evaluate(
		async ({ dbName, name, storeName }) => {
			const open = indexedDB.open(dbName, 1)
			const db = await new Promise<IDBDatabase>((resolve, reject) => {
				open.onupgradeneeded = () => {
					if (!open.result.objectStoreNames.contains(storeName)) {
						open.result.createObjectStore(storeName)
					}
				}
				open.onsuccess = () => resolve(open.result)
				open.onerror = () => reject(open.error)
			})
			const tx = db.transaction(storeName, 'readwrite')
			tx.objectStore(storeName).put({ primary: { name } }, `lab-drop:${name}`)
			await new Promise<void>((resolve, reject) => {
				tx.oncomplete = () => resolve()
				tx.onerror = () => reject(tx.error)
				tx.onabort = () => reject(tx.error)
			})
			db.close()
		},
		{ dbName: HANDLE_DB, name, storeName: HANDLE_STORE },
	)
}

async function persistedHandleKeys(page: Page): Promise<string[]> {
	return page.evaluate(
		async ({ dbName, storeName }) => {
			const open = indexedDB.open(dbName, 1)
			const db = await new Promise<IDBDatabase>((resolve, reject) => {
				open.onsuccess = () => resolve(open.result)
				open.onerror = () => reject(open.error)
			})
			const tx = db.transaction(storeName, 'readonly')
			const request = tx.objectStore(storeName).getAllKeys()
			const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
				request.onsuccess = () => resolve(request.result)
				request.onerror = () => reject(request.error)
			})
			db.close()
			return keys.map(String)
		},
		{ dbName: HANDLE_DB, storeName: HANDLE_STORE },
	)
}

async function seedCachedRemoteGenome(page: Page) {
	await page.evaluate(
		async ({ bytes, dbName, name, sourceUrl, storeName }) => {
			const blob = new Blob([Uint8Array.from(bytes)], { type: 'application/zip' })
			const open = indexedDB.open(dbName, 1)
			const db = await new Promise<IDBDatabase>((resolve, reject) => {
				open.onupgradeneeded = () => {
					if (!open.result.objectStoreNames.contains(storeName)) {
						open.result.createObjectStore(storeName, { keyPath: 'sourceUrl' })
					}
				}
				open.onsuccess = () => resolve(open.result)
				open.onerror = () => reject(open.error)
			})
			const tx = db.transaction(storeName, 'readwrite')
			tx.objectStore(storeName).put({
				blob,
				cachedAt: new Date().toISOString(),
				contentType: 'application/zip',
				name,
				size: blob.size,
				sourceUrl,
			})
			await new Promise<void>((resolve, reject) => {
				tx.oncomplete = () => resolve()
				tx.onerror = () => reject(tx.error)
				tx.onabort = () => reject(tx.error)
			})
			db.close()
		},
		{
			bytes: Array.from(fs.readFileSync(GENOME_23ANDME)),
			dbName: REMOTE_DB,
			name: 'genome_hu50B3F5_v5_Full.zip',
			sourceUrl: REMOTE_GENOME_URL,
			storeName: REMOTE_STORE,
		},
	)
}

async function cachedRemoteUrls(page: Page): Promise<string[]> {
	return page.evaluate(
		async ({ dbName, storeName }) => {
			const open = indexedDB.open(dbName, 1)
			const db = await new Promise<IDBDatabase>((resolve, reject) => {
				open.onsuccess = () => resolve(open.result)
				open.onerror = () => reject(open.error)
			})
			const tx = db.transaction(storeName, 'readonly')
			const request = tx.objectStore(storeName).getAll()
			const rows = await new Promise<Array<{ sourceUrl?: string }>>((resolve, reject) => {
				request.onsuccess = () => resolve(request.result)
				request.onerror = () => reject(request.error)
			})
			db.close()
			return rows.map((row) => row.sourceUrl ?? '')
		},
		{ dbName: REMOTE_DB, storeName: REMOTE_STORE },
	)
}

test.describe('lab persistent handles — web', () => {
	test('restores old one-at-a-time genome handles as one saved local file group after refresh', async ({ page }) => {
		await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
		await acceptDisclaimerIfPresent(page)
		await seedPersistedLabHandles(page)

		await page.goto(`${BASE_URL}/lab`, { waitUntil: 'domcontentloaded' })

		const savedFiles = page.getByTestId('saved-local-files')
		await expect(savedFiles).toBeVisible({ timeout: 30_000 })

		const rows = page.getByTestId('saved-local-file-row')
		await expect(rows).toHaveCount(1)
		await expect(page.getByTestId('saved-local-file-title')).toHaveText('NA06985.final.cram')
		await expect(page.getByTestId('saved-local-file-meta')).toContainText('Remembered local files')
		await expect(page.getByTestId('saved-local-file-meta')).toContainText('cram')
		await expect(page.getByTestId('saved-local-file-meta')).toContainText('crai')
		await expect(page.getByText('NA06985.final.cram.crai', { exact: true })).toHaveCount(0)
	})

	test('removing a session genome also clears the matching remembered handle entry', async ({ page }) => {
		const missing = missingFixture([GENOME_23ANDME])
		test.skip(Boolean(missing), `missing fixture: ${missing}`)

		await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
		await acceptDisclaimerIfPresent(page)
		await seedPersistedGenomeHandle(page, 'genome_hu50B3F5_v5_Full.zip')
		await gotoLab(page)
		await chooseGenomeFiles(page, GENOME_23ANDME)
		await expect(page.getByTestId('session-genome-row')).toHaveCount(1, { timeout: 30_000 })

		await page.getByLabel('Remove genome genome_hu50B3F5_v5_Full.zip').click()
		await expect(page.getByTestId('session-genome-row')).toHaveCount(0)
		expect(await persistedHandleKeys(page)).not.toContain('lab-drop:genome_hu50B3F5_v5_Full.zip')
	})

	test('removing a session genome also clears the matching cached remote file entry', async ({ page }) => {
		const missing = missingFixture([GENOME_23ANDME])
		test.skip(Boolean(missing), `missing fixture: ${missing}`)

		await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
		await acceptDisclaimerIfPresent(page)
		await seedCachedRemoteGenome(page)
		await gotoLab(page)
		await chooseGenomeFiles(page, GENOME_23ANDME)
		await expect(page.getByTestId('session-genome-row')).toHaveCount(1, { timeout: 30_000 })
		expect(await cachedRemoteUrls(page)).toContain(REMOTE_GENOME_URL)

		await page.getByLabel('Remove genome genome_hu50B3F5_v5_Full.zip').click()
		await expect(page.getByTestId('session-genome-row')).toHaveCount(0)
		expect(await cachedRemoteUrls(page)).not.toContain(REMOTE_GENOME_URL)
	})
})
