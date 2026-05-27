import { test, expect } from '@playwright/test'
import WebSocket from 'ws'

const BASE_URL = process.env.WEB_URL ?? 'http://localhost:1420'
const TOKEN = 'biovault-dev-token'
const WS_URL = `ws://127.0.0.1:17890/ws?token=${TOKEN}`

async function resetDesktopState() {
	await new Promise<void>((resolve, reject) => {
		const ws = new WebSocket(WS_URL)
		const timeout = setTimeout(() => {
			ws.close()
			reject(new Error('timed out resetting desktop state'))
		}, 10_000)
		ws.on('open', () => {
			ws.send(JSON.stringify({ type: 'command', command: { type: 'reset' } }))
		})
		ws.on('message', (data) => {
			const msg = JSON.parse(data.toString())
			if (msg.type === 'state' && msg.state?.screen === 'warning') {
				clearTimeout(timeout)
				ws.close()
				resolve()
			}
		})
		ws.on('error', reject)
	})
}

test('desktop smoke', async ({ page }) => {
	await resetDesktopState()
	const errors: string[] = []
	page.on('pageerror', (err) => errors.push(err.message))
	page.on('console', (msg) => {
		if (msg.type() === 'error') errors.push(msg.text())
	})

	await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
	await page.screenshot({ path: '.maestro-desktop/screenshots/01-launch.png', fullPage: true })

	await expect(page.getByText('Getting Started', { exact: true }).first()).toBeVisible({ timeout: 30_000 })
	await expect(page.getByText('Native Rust runtime', { exact: true })).toBeVisible()
	await expect(page.getByText('Import genome', { exact: true })).toBeVisible()
	await page.getByText('Import genome', { exact: true }).click()
	await expect(page.getByRole('button', { name: 'Choose genome files' })).toBeVisible()
	await page.screenshot({ path: '.maestro-desktop/screenshots/04-lab.png', fullPage: true })

	const fatal = errors.filter(
		(msg) =>
			!msg.includes('Invalid DOM property') &&
			!msg.includes('DevTools') &&
			!msg.includes('favicon') &&
			!msg.includes('Failed to load resource')
	)
	expect(fatal, `console/page errors:\n${fatal.join('\n')}`).toEqual([])
})
