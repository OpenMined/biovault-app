import { defineConfig, devices } from '@playwright/test'
import os from 'node:os'

const autoWorkers = typeof os.availableParallelism === 'function'
	? os.availableParallelism()
	: os.cpus().length
const workers = Number(process.env.PW_WORKERS ?? autoWorkers)
const headed = process.argv.includes('--headed') || process.env.PWDEBUG === '1'
const headedParallel = headed && process.env.PW_HEADED_PARALLEL === '1'
const fullyParallel = headed && !headedParallel ? false : process.env.PW_FULLY_PARALLEL !== '0'

export default defineConfig({
	testDir: '.',
	timeout: 120_000,
	retries: 0,
	workers: headed && !headedParallel ? 1 : workers,
	fullyParallel,
	reporter: [['list']],
	use: {
		trace: 'on',
		video: 'on',
		ignoreHTTPSErrors: process.env.PW_IGNORE_HTTPS_ERRORS === '1',
		viewport: { width: 1280, height: 800 },
		launchOptions: {
			slowMo: Number(process.env.PW_SLOWMO ?? 400),
			args: process.env.PW_IGNORE_HTTPS_ERRORS === '1' ? ['--ignore-certificate-errors'] : [],
		},
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],
})
