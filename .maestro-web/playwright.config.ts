import { defineConfig, devices } from '@playwright/test'
import os from 'node:os'

const autoWorkers = typeof os.availableParallelism === 'function'
	? os.availableParallelism()
	: os.cpus().length
const workers = Number(process.env.PW_WORKERS ?? autoWorkers)
const headed = process.argv.includes('--headed') || process.env.PWDEBUG === '1'
const headedParallel = headed && process.env.PW_HEADED_PARALLEL === '1'
const fullyParallel = headed && !headedParallel ? false : process.env.PW_FULLY_PARALLEL !== '0'
const connectOptions = process.env.PW_CONNECT_WS_ENDPOINT
	? {
			wsEndpoint: process.env.PW_CONNECT_WS_ENDPOINT,
			headers: process.env.PW_CONNECT_HEADERS_JSON ? JSON.parse(process.env.PW_CONNECT_HEADERS_JSON) : undefined,
		}
	: undefined
const requestedProjects = (process.env.PW_BROWSER_PROJECTS ?? 'chromium')
	.split(',')
	.map((value) => value.trim())
	.filter(Boolean)

const projectDefinitions = {
	chromium: {
		name: 'chromium',
		use: { ...devices['Desktop Chrome'] },
	},
	firefox: {
		name: 'firefox',
		use: { ...devices['Desktop Firefox'] },
	},
	webkit: {
		name: 'webkit',
		use: { ...devices['Desktop Safari'] },
	},
	'mobile-chromium': {
		name: 'mobile-chromium',
		use: { ...devices['Pixel 7'] },
	},
	'mobile-firefox': {
		name: 'mobile-firefox',
		use: {
			browserName: 'firefox' as const,
			viewport: { width: 412, height: 915 },
			deviceScaleFactor: 2.625,
			hasTouch: true,
			userAgent: 'Mozilla/5.0 (Android 14; Mobile; rv:125.0) Gecko/125.0 Firefox/125.0',
		},
	},
	'mobile-webkit': {
		name: 'mobile-webkit',
		use: { ...devices['iPhone 15'] },
	},
}

const projects = requestedProjects.map((name) => {
	const project = projectDefinitions[name as keyof typeof projectDefinitions]
	if (!project) throw new Error(`Unknown PW_BROWSER_PROJECTS entry: ${name}`)
	return project
})

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
			executablePath: process.env.PW_EXECUTABLE_PATH,
		},
		connectOptions,
	},
	projects,
})
