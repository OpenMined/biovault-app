import initBioscriptWasm, {
	lookupCramVariants,
	lookupVcfVariants,
} from '../bioscript-wasm/bioscript_wasm.js'

declare class FileReaderSync {
	readAsArrayBuffer(blob: Blob): ArrayBuffer
}

type LookupCramMessage = {
	type: 'lookupCram'
	requestId: number
	wasmUrl: string
	cramFile: File
	craiBytes: Uint8Array
	fastaFile: File
	faiBytes: Uint8Array
	variantsJson: string
}

type LookupVcfMessage = {
	type: 'lookupVcf'
	requestId: number
	wasmUrl: string
	vcfFile: File
	tbiBytes: Uint8Array
	variantsJson: string
}

type WarmupMessage = {
	type: 'warmup'
	requestId: number
	wasmUrl: string
}

type LookupMessage = LookupCramMessage | LookupVcfMessage | WarmupMessage

let wasmReady: Promise<void> | null = null

async function ensureBioscriptModule(wasmUrl: string) {
	wasmReady ??= initBioscriptWasm({ module_or_path: wasmUrl }).then(() => undefined)
	return wasmReady
}

function makeReadAt(file: File, fileReader: FileReaderSync) {
	return (offset: number, length: number) => {
		if (length === 0) return new Uint8Array(0)
		const end = Math.min(file.size, offset + length)
		const slice = file.slice(offset, end)
		const buf = fileReader.readAsArrayBuffer(slice)
		return new Uint8Array(buf)
	}
}

self.onmessage = async (event: MessageEvent<LookupMessage>) => {
	const message = event.data
	if (!message) return

	try {
		await ensureBioscriptModule(message.wasmUrl)
		if (message.type === 'warmup') {
			self.postMessage({
				type: 'done',
				requestId: message.requestId,
				resultJson: '[]',
				durationMs: 0,
			})
			return
		}

		const fileReader = new FileReaderSync()

		if (message.type === 'lookupCram') {
			const cramReadAt = makeReadAt(message.cramFile, fileReader)
			const fastaReadAt = makeReadAt(message.fastaFile, fileReader)
			const startedAt = Date.now()
			const resultJson = lookupCramVariants(
				cramReadAt,
				message.cramFile.size,
				message.craiBytes,
				fastaReadAt,
				message.fastaFile.size,
				message.faiBytes,
				message.variantsJson,
			)
			self.postMessage({
				type: 'done',
				requestId: message.requestId,
				resultJson,
				durationMs: Date.now() - startedAt,
			})
			return
		}

		const vcfReadAt = makeReadAt(message.vcfFile, fileReader)
		const startedAt = Date.now()
		const resultJson = lookupVcfVariants(
			vcfReadAt,
			message.vcfFile.size,
			message.tbiBytes,
			message.variantsJson,
		)
		self.postMessage({
			type: 'done',
			requestId: message.requestId,
			resultJson,
			durationMs: Date.now() - startedAt,
		})
	} catch (error) {
		const messageText = error instanceof Error && error.stack ? error.stack : String(error)
		self.postMessage({ type: 'error', requestId: message.requestId, error: messageText })
	}
}
