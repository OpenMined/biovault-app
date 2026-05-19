import { GENERATED_BROWSER_SUPPORT_POLICY } from './browser-support.generated.ts'

export type WebRuntimeCapability = {
	id: string
	label: string
	required: boolean
	supported: boolean
}

export type BrowserSupportAssessment = {
	status: 'supported' | 'warning' | 'blocked'
	browserName: string
	browserVersion: number | null
	requiredMissing: WebRuntimeCapability[]
	optionalMissing: WebRuntimeCapability[]
	versionWarning: string | null
	knownFailureWarning: string | null
	untestedWarning: string | null
	summary: string
	capabilities: WebRuntimeCapability[]
}

type BrowserPolicy = {
	minimumKnownGood: number | null
	latestKnownGood: number | null
	knownFailing: readonly number[]
	label: string
}

export const WEB_RUNTIME_BROWSER_POLICY: Record<string, BrowserPolicy> = {
	chromium: { ...GENERATED_BROWSER_SUPPORT_POLICY.chromium, label: 'Chrome/Chromium' },
	firefox: { ...GENERATED_BROWSER_SUPPORT_POLICY.firefox, label: 'Firefox' },
	safari: { ...GENERATED_BROWSER_SUPPORT_POLICY.safari, label: 'Safari/WebKit' },
	samsungInternet: { ...GENERATED_BROWSER_SUPPORT_POLICY.samsungInternet, label: 'Samsung Internet' },
	chromeIos: { ...GENERATED_BROWSER_SUPPORT_POLICY.chromeIos, label: 'Chrome iOS' },
	firefoxIos: { ...GENERATED_BROWSER_SUPPORT_POLICY.firefoxIos, label: 'Firefox iOS' },
	unknown: { ...GENERATED_BROWSER_SUPPORT_POLICY.unknown, label: 'this browser' },
}

export function assessWebRuntimeSupport(): BrowserSupportAssessment {
	const global = globalThis as typeof globalThis & {
		navigator?: Navigator
		indexedDB?: IDBFactory
		localStorage?: Storage
		isSecureContext?: boolean
		crypto?: Crypto
		showOpenFilePicker?: unknown
	}
	const browser = detectBrowser(global.navigator?.userAgent ?? '')
	const policy = WEB_RUNTIME_BROWSER_POLICY[browser.name] ?? WEB_RUNTIME_BROWSER_POLICY.unknown!
	const completionPolicy = iOSWebKitShells.has(browser.name)
		? WEB_RUNTIME_BROWSER_POLICY.safari!
		: policy
	const capabilities: WebRuntimeCapability[] = [
		capability('wasm', 'WebAssembly', true, typeof WebAssembly !== 'undefined'),
		capability('wasm-validate', 'WebAssembly validation', true, supportsWebAssemblyValidate()),
		capability('worker', 'Web Workers', true, typeof Worker !== 'undefined'),
		capability('blob', 'Blob', true, typeof Blob !== 'undefined'),
		capability('file', 'File', true, typeof File !== 'undefined'),
		capability('file-reader', 'FileReader', true, typeof FileReader !== 'undefined'),
		capability('fetch', 'Fetch', true, typeof fetch === 'function'),
		capability('readable-stream', 'ReadableStream', true, typeof ReadableStream !== 'undefined'),
		capability('indexed-db', 'IndexedDB', true, typeof global.indexedDB !== 'undefined'),
		capability('local-storage', 'localStorage', true, storageAvailable(global.localStorage)),
		capability('secure-context', 'secure context', true, global.isSecureContext === true),
		capability('crypto-subtle', 'Web Crypto', true, Boolean(global.crypto?.subtle)),
		capability('file-system-access', 'persistent file handles', false, typeof global.showOpenFilePicker === 'function'),
	]
	const requiredMissing = capabilities.filter((item) => item.required && !item.supported)
	const optionalMissing = capabilities.filter((item) => !item.required && !item.supported)
	const versionWarning = policy.minimumKnownGood && browser.version && browser.version < policy.minimumKnownGood
		? `${policy.label} ${browser.version} is below the tested minimum ${policy.minimumKnownGood}.`
		: null
	const knownFailureWarning = browser.version && policy.knownFailing.includes(browser.version)
		? `${policy.label} ${browser.version} has a known WebAssembly compatibility failure.`
		: null
	const untestedWarning = !completionPolicy.minimumKnownGood || !completionPolicy.latestKnownGood
		? `${policy.label} has not completed compatibility testing for this WebAssembly demo yet.`
		: null
	const status = requiredMissing.length ? 'blocked' : knownFailureWarning || versionWarning || untestedWarning || optionalMissing.length ? 'warning' : 'supported'
	return {
		status,
		browserName: policy.label,
		browserVersion: browser.version,
		requiredMissing,
		optionalMissing,
		versionWarning,
		knownFailureWarning,
		untestedWarning,
		summary: requiredMissing.length
			? `This browser is missing ${requiredMissing.map((item) => item.label).join(', ')}.`
			: knownFailureWarning ?? versionWarning ?? untestedWarning ?? (optionalMissing.length ? `Some optional browser features are unavailable: ${optionalMissing.map((item) => item.label).join(', ')}.` : 'Browser runtime checks passed.'),
		capabilities,
	}
}

const iOSWebKitShells = new Set<keyof typeof WEB_RUNTIME_BROWSER_POLICY>(['chromeIos', 'firefoxIos'])

function capability(id: string, label: string, required: boolean, supported: boolean): WebRuntimeCapability {
	return { id, label, required, supported }
}

function supportsWebAssemblyValidate(): boolean {
	if (typeof WebAssembly === 'undefined' || typeof WebAssembly.validate !== 'function') return false
	try {
		return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]))
	} catch {
		return false
	}
}

function storageAvailable(storage: Storage | undefined): boolean {
	if (!storage) return false
	try {
		const key = '__biovault_runtime_support__'
		storage.setItem(key, '1')
		const ok = storage.getItem(key) === '1'
		storage.removeItem(key)
		return ok
	} catch {
		return false
	}
}

function detectBrowser(userAgent: string): { name: keyof typeof WEB_RUNTIME_BROWSER_POLICY; version: number | null } {
	const chromeIos = userAgent.match(/CriOS\/(\d+)/)
	if (chromeIos) return { name: 'chromeIos', version: Number(chromeIos[1]) }
	const firefoxIos = userAgent.match(/FxiOS\/(\d+)/)
	if (firefoxIos) return { name: 'firefoxIos', version: Number(firefoxIos[1]) }
	const samsung = userAgent.match(/SamsungBrowser\/(\d+)/)
	if (samsung) return { name: 'samsungInternet', version: Number(samsung[1]) }
	const edge = userAgent.match(/Edg\/(\d+)/)
	if (edge) return { name: 'chromium', version: Number(edge[1]) }
	const chromium = userAgent.match(/(?:Chrome|Chromium|CriOS)\/(\d+)/)
	if (chromium) return { name: 'chromium', version: Number(chromium[1]) }
	const firefox = userAgent.match(/(?:Firefox|FxiOS)\/(\d+)/)
	if (firefox) return { name: 'firefox', version: Number(firefox[1]) }
	const safari = userAgent.match(/Version\/(\d+).+Safari/)
	if (safari) return { name: 'safari', version: Number(safari[1]) }
	return { name: 'unknown', version: null }
}
