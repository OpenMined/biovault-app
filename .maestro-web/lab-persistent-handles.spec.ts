import { test, expect, type Page } from '@playwright/test'

const BASE_URL = process.env.WEB_URL ?? 'http://localhost:8081'
const HANDLE_DB = 'biovault-file-handles'
const HANDLE_STORE = 'handles'

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
		await expect(page.getByTestId('saved-local-file-meta')).toContainText('4 persisted files')
		await expect(page.getByText('NA06985.final.cram.crai', { exact: true })).toHaveCount(0)
	})
})
