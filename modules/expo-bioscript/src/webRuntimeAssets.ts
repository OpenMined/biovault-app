import { Asset } from 'expo-asset'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bioscriptWasmAsset = require('./bioscript-wasm/bioscript_wasm_bg.wasm')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const montyWasmAsset = require('../web-runtime/monty-wasm32-wasi/monty.wasm32-wasi.wasm')

function cacheBustDevAssetUrl(uri: string, key: string) {
	if (typeof window === 'undefined') return uri
	const url = new URL(uri, window.location.href)
	if (process.env.NODE_ENV !== 'production') {
		url.searchParams.set(key, String(Date.now()))
	}
	return url.href
}

// Approximate uncompressed byte sizes, used as the progress-bar denominator
// when the server can't give a reliable Content-Length (compression). The
// progress bus clamps to <100% until the download truly completes, so a small
// build-to-build drift only affects the last sliver of the bar.
export const BIOSCRIPT_WASM_APPROX_BYTES = 9_500_000
export const MONTY_WASM_APPROX_BYTES = 36_500_000

export function getBioscriptWasmUrl() {
	return cacheBustDevAssetUrl(Asset.fromModule(bioscriptWasmAsset).uri, 'bioscript_wasm_build')
}

export function getMontyWasmUrl() {
	return cacheBustDevAssetUrl(Asset.fromModule(montyWasmAsset).uri, 'monty_wasm_build')
}
