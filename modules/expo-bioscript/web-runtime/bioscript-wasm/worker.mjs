// Web Worker host for bioscript-wasm. Loaded from the main thread via
// `new Worker('/modules/expo-bioscript/web-runtime/bioscript-wasm/worker.mjs',
// { type: 'module' })`. The wasm-bindgen bindings and the .wasm binary are
// both referenced through URLs supplied by the main thread (built via
// `Asset.fromModule`, which gives Metro-served absolute URLs).
//
// Why a worker at all: the Rust `JsReader` expects a synchronous
// `readAt(offset, length) -> Uint8Array`. In the browser the only way to
// slice a user-picked File synchronously is `FileReaderSync`, which is only
// available inside workers. So we run the whole lookupCramVariants call
// here and the main thread only does orchestration + UI.

/* eslint-disable no-restricted-globals */

let modulePromise = null

async function ensureModule(bindingsUrl, wasmUrl) {
	if (!modulePromise) {
		modulePromise = (async () => {
			const mod = await import(bindingsUrl)
			await mod.default({ module_or_path: wasmUrl })
			return mod
		})()
	}
	return modulePromise
}

function makeReadAt(file, label, fileReader) {
	return (offset, length) => {
		if (length === 0) return new Uint8Array(0)
		const end = Math.min(file.size, offset + length)
		const slice = file.slice(offset, end)
		const buf = fileReader.readAsArrayBuffer(slice)
		return new Uint8Array(buf)
	}
}

self.onmessage = async (e) => {
	const msg = e.data
	if (!msg) return
	const { type, requestId, bindingsUrl, wasmUrl } = msg
	try {
		const mod = await ensureModule(bindingsUrl, wasmUrl)
		const fileReader = new FileReaderSync()

		if (type === 'lookupCram') {
			const { cramFile, craiBytes, fastaFile, faiBytes, variantsJson } = msg
			const cramReadAt = makeReadAt(cramFile, 'cram', fileReader)
			const fastaReadAt = makeReadAt(fastaFile, 'fasta', fileReader)
			const startedAt = Date.now()
			const resultJson = mod.lookupCramVariants(
				cramReadAt,
				cramFile.size,
				craiBytes,
				fastaReadAt,
				fastaFile.size,
				faiBytes,
				variantsJson,
			)
			const durationMs = Date.now() - startedAt
			self.postMessage({ type: 'done', requestId, resultJson, durationMs })
			return
		}

		if (type === 'lookupVcf') {
			const { vcfFile, tbiBytes, variantsJson } = msg
			const vcfReadAt = makeReadAt(vcfFile, 'vcf', fileReader)
			const startedAt = Date.now()
			const resultJson = mod.lookupVcfVariants(vcfReadAt, vcfFile.size, tbiBytes, variantsJson)
			const durationMs = Date.now() - startedAt
			self.postMessage({ type: 'done', requestId, resultJson, durationMs })
			return
		}

		// Back-compat: old "lookup" type defaults to CRAM.
		if (type === 'lookup') {
			const { cramFile, craiBytes, fastaFile, faiBytes, variantsJson } = msg
			const cramReadAt = makeReadAt(cramFile, 'cram', fileReader)
			const fastaReadAt = makeReadAt(fastaFile, 'fasta', fileReader)
			const startedAt = Date.now()
			const resultJson = mod.lookupCramVariants(
				cramReadAt,
				cramFile.size,
				craiBytes,
				fastaReadAt,
				fastaFile.size,
				faiBytes,
				variantsJson,
			)
			const durationMs = Date.now() - startedAt
			self.postMessage({ type: 'done', requestId, resultJson, durationMs })
		}
	} catch (err) {
		const message = err && err.stack ? err.stack : String(err)
		self.postMessage({ type: 'error', requestId, error: message })
	}
}
