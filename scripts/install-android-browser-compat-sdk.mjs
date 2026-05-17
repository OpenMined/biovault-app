#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const sdkRoot = path.resolve(process.env.ANDROID_SDK_ROOT ?? process.env.ANDROID_HOME ?? path.join(os.homedir(), 'Android/Sdk'))
const cmdlineUrl = process.env.ANDROID_CMDLINE_TOOLS_URL ?? 'https://dl.google.com/android/repository/commandlinetools-linux-14742923_latest.zip'
const packages = csvEnv('ANDROID_BROWSER_COMPAT_PACKAGES', [
	'platform-tools',
	'emulator',
	'platforms;android-36',
	'system-images;android-36;google_apis;x86_64',
])
const avdName = process.env.ANDROID_BROWSER_COMPAT_AVD ?? 'biovault-web-compat-api36'
const createAvd = process.env.ANDROID_BROWSER_COMPAT_CREATE_AVD === '1'
const toolsBin = path.join(sdkRoot, 'cmdline-tools/latest/bin')
const sdkmanager = path.join(toolsBin, 'sdkmanager')
const avdmanager = path.join(toolsBin, 'avdmanager')

fs.mkdirSync(sdkRoot, { recursive: true })
ensureCmdlineTools()
run(sdkmanager, ['--sdk_root=' + sdkRoot, '--licenses'], { input: 'y\n'.repeat(64) })
run(sdkmanager, ['--sdk_root=' + sdkRoot, ...packages])

if (createAvd) {
	const image = packages.find((item) => item.startsWith('system-images;'))
	if (!image) {
		console.error('ANDROID_BROWSER_COMPAT_CREATE_AVD=1 requires a system-images package.')
		process.exit(2)
	}
	const avdHome = process.env.ANDROID_AVD_HOME ?? path.join(os.homedir(), '.android/avd')
	if (!fs.existsSync(path.join(avdHome, `${avdName}.avd`))) {
		run(avdmanager, ['create', 'avd', '--force', '--name', avdName, '--package', image, '--device', 'pixel_7'], {
			input: 'no\n',
		})
	}
}

console.log('Android browser compatibility SDK ready.')
console.log(`export ANDROID_SDK_ROOT=${sdkRoot}`)
console.log(`export ANDROID_HOME=${sdkRoot}`)
console.log(`export PATH=${path.join(sdkRoot, 'platform-tools')}:${path.join(sdkRoot, 'emulator')}:${toolsBin}:$PATH`)
if (createAvd) console.log(`export ANDROID_BROWSER_COMPAT_AVD=${avdName}`)

function ensureCmdlineTools() {
	if (fs.existsSync(sdkmanager)) return
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'android-cmdline-tools-'))
	const zipPath = path.join(tempDir, 'commandlinetools.zip')
	try {
		run('curl', ['-L', '--fail', '--retry', '3', '-o', zipPath, cmdlineUrl])
		run('unzip', ['-q', zipPath, '-d', tempDir])
		const source = path.join(tempDir, 'cmdline-tools')
		const destination = path.join(sdkRoot, 'cmdline-tools/latest')
		fs.rmSync(destination, { recursive: true, force: true })
		fs.mkdirSync(path.dirname(destination), { recursive: true })
		fs.cpSync(source, destination, { recursive: true })
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true })
	}
}

function run(command, args, options = {}) {
	const result = spawnSync(command, args, {
		cwd: root,
		encoding: 'utf8',
		stdio: options.input ? ['pipe', 'inherit', 'inherit'] : 'inherit',
		input: options.input,
		env: {
			...process.env,
			ANDROID_SDK_ROOT: sdkRoot,
			ANDROID_HOME: sdkRoot,
			PATH: [
				path.join(sdkRoot, 'platform-tools'),
				path.join(sdkRoot, 'emulator'),
				toolsBin,
				process.env.PATH,
			].filter(Boolean).join(path.delimiter),
		},
	})
	if (result.status !== 0) process.exit(result.status ?? 1)
}

function csvEnv(name, defaultValue) {
	if (!(name in process.env)) return defaultValue
	return String(process.env[name] ?? '').split(',').map((item) => item.trim()).filter(Boolean)
}
