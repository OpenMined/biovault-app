import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
	testDir: '.',
	timeout: 120_000,
	retries: 0,
	workers: 1,
	fullyParallel: false,
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
