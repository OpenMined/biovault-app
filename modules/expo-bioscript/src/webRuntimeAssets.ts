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

export function getBioscriptWasmUrl() {
	return cacheBustDevAssetUrl(Asset.fromModule(bioscriptWasmAsset).uri, 'bioscript_wasm_build')
}

export function getMontyWasmUrl() {
	return cacheBustDevAssetUrl(Asset.fromModule(montyWasmAsset).uri, 'monty_wasm_build')
}
