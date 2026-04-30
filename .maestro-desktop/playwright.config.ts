import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
	testDir: '.',
	timeout: 120_000,
	workers: 1,
	retries: 0,
	reporter: [['list']],
	use: {
		trace: 'on',
		video: 'on',
		viewport: { width: 1280, height: 800 },
		launchOptions: {
			slowMo: Number(process.env.PW_SLOWMO ?? 400),
		},
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],
})
