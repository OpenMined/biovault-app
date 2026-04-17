import { instantiateNapiModuleSync, MessageHandler, WASI } from '@napi-rs/wasm-runtime'

const handler = new MessageHandler({
		onLoad({ wasmModule, wasmMemory }: { wasmModule: WebAssembly.Module; wasmMemory: WebAssembly.Memory }) {
			const wasi = new WASI({
				print(...args: unknown[]) {
					console.log(...args)
				},
				printErr(...args: unknown[]) {
					console.error(...args)
				},
			})
		return instantiateNapiModuleSync(wasmModule, {
			childThread: true,
			wasi,
			overwriteImports(importObject: Record<string, Record<string, unknown>>) {
				importObject.env = {
					...importObject.env,
					...importObject.napi,
					...importObject.emnapi,
					memory: wasmMemory,
				}
			},
		})
	},
})

globalThis.onmessage = (event) => {
	handler.handle(event)
}
