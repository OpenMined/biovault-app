// Dependency-free spec for the web browser support assessment. Run with:
//   node --test --experimental-strip-types lib/browser-support.test.ts
import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { assessWebRuntimeSupport } from './browser-support.ts'

const originalDescriptors = new Map<PropertyKey, PropertyDescriptor | undefined>()
const patchedKeys: PropertyKey[] = [
	'navigator',
	'WebAssembly',
	'Worker',
	'Blob',
	'File',
	'FileReader',
	'fetch',
	'indexedDB',
	'localStorage',
	'isSecureContext',
	'ReadableStream',
	'crypto',
	'showOpenFilePicker',
]

for (const key of patchedKeys) {
	originalDescriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
}

afterEach(() => {
	for (const key of patchedKeys) {
		const descriptor = originalDescriptors.get(key)
		if (descriptor) {
			Object.defineProperty(globalThis, key, descriptor)
		} else {
			Reflect.deleteProperty(globalThis, key)
		}
	}
})

test('passes when required capabilities and tested browser version are present', () => {
	installBrowserEnvironment('Mozilla/5.0 Chrome/148.0.7778.96 Safari/537.36')

	const assessment = assessWebRuntimeSupport()

	assert.equal(assessment.status, 'supported')
	assert.equal(assessment.browserName, 'Chrome/Chromium')
	assert.equal(assessment.browserVersion, 148)
	assert.equal(assessment.requiredMissing.length, 0)
	assert.equal(assessment.versionWarning, null)
	assert.equal(assessment.knownFailureWarning, null)
	assert.equal(assessment.untestedWarning, null)
	assert.equal(assessment.summary, 'Browser runtime checks passed.')
})

test('blocks when a required runtime capability is missing', () => {
	installBrowserEnvironment('Mozilla/5.0 Chrome/148.0.7778.96 Safari/537.36', { worker: false })

	const assessment = assessWebRuntimeSupport()

	assert.equal(assessment.status, 'blocked')
	assert.deepEqual(assessment.requiredMissing.map((item) => item.id), ['worker'])
	assert.match(assessment.summary, /Web Workers/)
})

test('blocks when WebAssembly validation is unavailable', () => {
	installBrowserEnvironment('Mozilla/5.0 Chrome/148.0.7778.96 Safari/537.36', { webAssemblyValidate: false })

	const assessment = assessWebRuntimeSupport()

	assert.equal(assessment.status, 'blocked')
	assert.deepEqual(assessment.requiredMissing.map((item) => item.id), ['wasm-validate'])
	assert.match(assessment.summary, /WebAssembly validation/)
})

test('blocks when required streaming or crypto APIs are unavailable', () => {
	installBrowserEnvironment('Mozilla/5.0 Firefox/150.0', { readableStream: false, cryptoSubtle: false })

	const assessment = assessWebRuntimeSupport()

	assert.equal(assessment.status, 'blocked')
	assert.deepEqual(assessment.requiredMissing.map((item) => item.id), ['readable-stream', 'crypto-subtle'])
	assert.deepEqual(assessment.optionalMissing, [])
	assert.match(assessment.summary, /ReadableStream, Web Crypto/)
})

test('blocks when the page is not a secure context', () => {
	installBrowserEnvironment('Mozilla/5.0 Chrome/148.0.7778.96 Safari/537.36', { secureContext: false })

	const assessment = assessWebRuntimeSupport()

	assert.equal(assessment.status, 'blocked')
	assert.deepEqual(assessment.requiredMissing.map((item) => item.id), ['secure-context'])
	assert.match(assessment.summary, /secure context/)
})

test('warns when browser version is below the generated minimum', () => {
	installBrowserEnvironment('Mozilla/5.0 Chrome/95.0.4638.69 Safari/537.36')

	const assessment = assessWebRuntimeSupport()

	assert.equal(assessment.status, 'warning')
	assert.equal(assessment.versionWarning, 'Chrome/Chromium 95 is below the tested minimum 97.')
	assert.equal(assessment.knownFailureWarning, null)
})

test('warns when browser version is a known compatibility failure', () => {
	installBrowserEnvironment('Mozilla/5.0 Version/15.4 Safari/605.1.15')

	const assessment = assessWebRuntimeSupport()

	assert.equal(assessment.status, 'warning')
	assert.equal(assessment.browserName, 'Safari/WebKit')
	assert.equal(assessment.browserVersion, 15)
	assert.equal(assessment.knownFailureWarning, 'Safari/WebKit 15 has a known WebAssembly compatibility failure.')
})

test('warns for unknown browsers when required capabilities are present', () => {
	installBrowserEnvironment('Mozilla/5.0 ExampleBrowser/1.0')

	const assessment = assessWebRuntimeSupport()

	assert.equal(assessment.status, 'warning')
	assert.equal(assessment.browserName, 'this browser')
	assert.equal(assessment.browserVersion, null)
	assert.equal(assessment.untestedWarning, 'this browser has not completed compatibility testing for this WebAssembly demo yet.')
	assert.deepEqual(assessment.requiredMissing, [])
})

test('detects Samsung Internet separately from generic Chromium', () => {
	installBrowserEnvironment('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36')

	const assessment = assessWebRuntimeSupport()

	assert.equal(assessment.status, 'warning')
	assert.equal(assessment.browserName, 'Samsung Internet')
	assert.equal(assessment.browserVersion, 25)
	assert.equal(assessment.untestedWarning, 'Samsung Internet has not completed compatibility testing for this WebAssembly demo yet.')
})

test('detects iOS Chrome and Firefox shells separately', () => {
	installBrowserEnvironment('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1')
	const chrome = assessWebRuntimeSupport()
	assert.equal(chrome.status, 'warning')
	assert.equal(chrome.browserName, 'Chrome iOS')
	assert.equal(chrome.browserVersion, 126)
	assert.equal(chrome.untestedWarning, 'Chrome iOS has not completed compatibility testing for this WebAssembly demo yet.')

	installBrowserEnvironment('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15')
	const firefox = assessWebRuntimeSupport()
	assert.equal(firefox.status, 'warning')
	assert.equal(firefox.browserName, 'Firefox iOS')
	assert.equal(firefox.browserVersion, 127)
	assert.equal(firefox.untestedWarning, 'Firefox iOS has not completed compatibility testing for this WebAssembly demo yet.')
})

test('warns but does not block when only optional capabilities are missing', () => {
	installBrowserEnvironment('Mozilla/5.0 Firefox/150.0', { fileSystemAccess: false })

	const assessment = assessWebRuntimeSupport()

	assert.equal(assessment.status, 'warning')
	assert.deepEqual(assessment.requiredMissing, [])
	assert.deepEqual(assessment.optionalMissing.map((item) => item.id), ['file-system-access'])
	assert.match(assessment.summary, /optional browser features/)
})

function installBrowserEnvironment(
	userAgent: string,
	options: {
		webAssembly?: boolean
		webAssemblyValidate?: boolean
		worker?: boolean
		readableStream?: boolean
		cryptoSubtle?: boolean
		fileSystemAccess?: boolean
		secureContext?: boolean
	} = {},
) {
	const enabled = {
		webAssembly: options.webAssembly ?? true,
		webAssemblyValidate: options.webAssemblyValidate ?? true,
		worker: options.worker ?? true,
		readableStream: options.readableStream ?? true,
		cryptoSubtle: options.cryptoSubtle ?? true,
		fileSystemAccess: options.fileSystemAccess ?? true,
		secureContext: options.secureContext ?? true,
	}
	defineGlobal('navigator', { userAgent })
	defineGlobal('WebAssembly', enabled.webAssembly ? { validate: () => enabled.webAssemblyValidate } : undefined)
	defineGlobal('Worker', enabled.worker ? class Worker {} : undefined)
	defineGlobal('Blob', class Blob {})
	defineGlobal('File', class File {})
	defineGlobal('FileReader', class FileReader {})
	defineGlobal('fetch', async () => ({ ok: true }))
	defineGlobal('indexedDB', {})
	defineGlobal('localStorage', createStorage())
	defineGlobal('isSecureContext', enabled.secureContext)
	defineGlobal('ReadableStream', enabled.readableStream ? class ReadableStream {} : undefined)
	defineGlobal('crypto', enabled.cryptoSubtle ? { subtle: {} } : {})
	defineGlobal('showOpenFilePicker', enabled.fileSystemAccess ? async () => [] : undefined)
}

function defineGlobal(key: PropertyKey, value: unknown) {
	if (value === undefined) {
		Reflect.deleteProperty(globalThis, key)
		return
	}
	Object.defineProperty(globalThis, key, {
		configurable: true,
		value,
		writable: true,
	})
}

function createStorage(): Storage {
	const values = new Map<string, string>()
	return {
		get length() {
			return values.size
		},
		clear() {
			values.clear()
		},
		getItem(key: string) {
			return values.get(key) ?? null
		},
		key(index: number) {
			return Array.from(values.keys())[index] ?? null
		},
		removeItem(key: string) {
			values.delete(key)
		},
		setItem(key: string, value: string) {
			values.set(key, value)
		},
	}
}
