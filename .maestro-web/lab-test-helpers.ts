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

async function clickDialogControl(page: Page, dialogLabel: string, labels: string[]): Promise<boolean> {
	const dialog = page.getByLabel(dialogLabel, { exact: true })
	for (const label of labels) {
		const byRole = dialog.getByRole('button', { name: label, exact: true })
		if (await byRole.isVisible({ timeout: 250 }).catch(() => false)) {
			await byRole.click({ force: true, timeout: 1_000 }).catch(() => undefined)
			return true
		}
		const byText = dialog.getByText(label, { exact: true })
		if (await byText.isVisible({ timeout: 250 }).catch(() => false)) {
			await byText.click({ force: true, timeout: 1_000 }).catch(() => undefined)
			return true
		}
	}
	return false
}

export async function dismissDisclaimer(page: Page) {
	const understand = page.getByText('I understand and want to continue', { exact: false })
	if (await understand.isVisible().catch(() => false)) {
		await understand.click()
		await page.getByText(/^Continue$/).click({ timeout: 10_000 })
	}
}

export async function dismissRememberFilesPrompt(page: Page) {
	const dialog = page.getByLabel('Persistent file access dialog', { exact: true })
	if (!(await dialog.isVisible({ timeout: 2_000 }).catch(() => false))) return
	for (let attempt = 0; attempt < 20; attempt += 1) {
		if (!(await dialog.isVisible({ timeout: 250 }).catch(() => false))) return
		if (await clickDialogControl(page, 'Persistent file access dialog', ['Not now', 'Close dialog'])) {
			await expect(dialog).toBeHidden({ timeout: 5_000 }).catch(() => undefined)
			if (!(await dialog.isVisible({ timeout: 250 }).catch(() => false))) return
		}
		await page.waitForTimeout(100)
	}
	await expect(dialog).toBeHidden({ timeout: 5_000 })
}

export async function dismissSharedResourcePrompt(page: Page) {
	const dialog = page.getByLabel('Shared resource dialog', { exact: true })
	if (!(await dialog.isVisible({ timeout: 3_000 }).catch(() => false))) return
	for (let attempt = 0; attempt < 20; attempt += 1) {
		if (!(await dialog.isVisible({ timeout: 250 }).catch(() => false))) return
		if (await clickDialogControl(page, 'Shared resource dialog', ['Ignore', 'Done', 'Close shared resource dialog'])) {
			await expect(dialog).toBeHidden({ timeout: 5_000 }).catch(() => undefined)
			if (!(await dialog.isVisible({ timeout: 250 }).catch(() => false))) return
		}
		await page.waitForTimeout(100)
	}
	await expect(dialog).toBeHidden({ timeout: 5_000 })
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
	await expect.poll(async () => {
		if (!(await dialog.isVisible({ timeout: 250 }).catch(() => false))) return 'closed'
		if (await fetchDependencies.isVisible({ timeout: 250 }).catch(() => false)) return 'dependencies'
		if (await dialog.getByRole('button', { name: 'Retry fetch', exact: true }).isVisible({ timeout: 250 }).catch(() => false)) return 'error'
		return 'pending'
	}, { timeout: 90_000 }).not.toBe('pending')

	if (await fetchDependencies.isVisible({ timeout: 250 }).catch(() => false)) {
		await fetchDependencies.evaluate((element) => {
			;(element as HTMLElement).click()
		})
		await expect(dialog.getByText(/33 dependency files fetched for this session\./)).toBeVisible({ timeout: 60_000 })
	}
	if (await dialog.getByRole('button', { name: 'Retry fetch', exact: true }).isVisible({ timeout: 250 }).catch(() => false)) {
		const message = await dialog.locator('text=/./').allTextContents().catch(() => [])
		throw new Error(`PGx release import failed: ${message.join(' ').trim()}`)
	}
	const done = dialog.getByText('Done', { exact: true }).first()
	if (await done.isVisible({ timeout: 1_000 }).catch(() => false)) {
		await clickDialogControl(page, 'Shared resource dialog', ['Done'])
	} else {
		await clickDialogControl(page, 'Shared resource dialog', ['Close shared resource dialog', 'Ignore'])
	}
	await expect(dialog).toBeHidden({ timeout: 10_000 })
	await page.evaluate(() => {
		window.history.replaceState(null, '', window.location.pathname + window.location.search)
	})
	await dismissSharedResourcePrompt(page)
	await dismissRememberFilesPrompt(page)
}

export async function waitForAssayRegistryPanel(page: Page, title = 'PGx-1 Panel') {
	await expect.poll(async () => page.evaluate(async (panelTitle) => {
		for (let index = 0; index < localStorage.length; index += 1) {
			const key = localStorage.key(index)
			if (!key?.startsWith('biovault-remote-package:')) continue
			try {
				const parsed = JSON.parse(localStorage.getItem(key) ?? '{}') as { files?: unknown[]; name?: string }
				if (parsed.name === 'pgx-1' && Boolean(parsed.files?.length)) return true
			} catch {
				// Ignore unrelated localStorage values.
			}
		}

		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const req = indexedDB.open('biovault-assay-registry', 1)
			req.onupgradeneeded = () => {
				const db = req.result
				if (!db.objectStoreNames.contains('panels')) db.createObjectStore('panels', { keyPath: 'id' })
				if (!db.objectStoreNames.contains('assays')) db.createObjectStore('assays', { keyPath: 'id' })
			}
			req.onsuccess = () => resolve(req.result)
			req.onerror = () => reject(req.error ?? new Error('failed to open assay registry'))
		})
		try {
			if (!db.objectStoreNames.contains('panels')) return false
			const panels = await new Promise<Array<{ title?: string; entrypoint?: string; files?: unknown[] }>>((resolve, reject) => {
				const tx = db.transaction('panels', 'readonly')
				const req = tx.objectStore('panels').getAll()
				req.onsuccess = () => resolve(req.result)
				req.onerror = () => reject(req.error ?? new Error('failed to read assay registry panels'))
			})
			return panels.some((panel) => panel.title === panelTitle && Boolean(panel.entrypoint) && Boolean(panel.files?.length))
		} finally {
			db.close()
		}
	}, title), { timeout: 30_000 }).toBe(true)
}

export async function chooseGenomeFiles(page: Page, files: string | string[]) {
	await dragFilesIntoLab(page, Array.isArray(files) ? files : [files])
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
