import { Asset } from 'expo-asset'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bioscriptWasmAsset = require('./bioscript-wasm/bioscript_wasm_bg.wasm')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const montyWasmAsset = require('../web-runtime/monty-wasm32-wasi/monty.wasm32-wasi.wasm')

function toAbsoluteUrl(uri: string) {
	return typeof window !== 'undefined' ? new URL(uri, window.location.href).href : uri
}

export function getBioscriptWasmUrl() {
	return toAbsoluteUrl(Asset.fromModule(bioscriptWasmAsset).uri)
}

export function getMontyWasmUrl() {
	return toAbsoluteUrl(Asset.fromModule(montyWasmAsset).uri)
}
