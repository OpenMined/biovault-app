import initBioscriptWasm, {
	generateBamBaiFromReader,
	generateCramCraiFromReader,
	generateFastaFaiFromReader,
	generateVcfTbi,
	lookupCramVariants,
	lookupVcfVariants,
	runPackageReportFromBam,
	runPackageReportFromCram,
	runPackageReportFromVcf,
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

type ReportFromCramMessage = {
	type: 'reportFromCram'
	requestId: number
	wasmUrl: string
	manifestPath: string
	packageFilesJson: string
	inputName: string
	cramFile: File
	craiBytes: Uint8Array
	fastaFile: File
	faiBytes: Uint8Array
	optionsJson: string
}

type ReportFromBamMessage = {
	type: 'reportFromBam'
	requestId: number
	wasmUrl: string
	manifestPath: string
	packageFilesJson: string
	inputName: string
	bamFile: File
	baiBytes: Uint8Array
	optionsJson: string
}

type ReportFromVcfMessage = {
	type: 'reportFromVcf'
	requestId: number
	wasmUrl: string
	manifestPath: string
	packageFilesJson: string
	inputName: string
	vcfFile: File
	tbiBytes: Uint8Array
	optionsJson: string
}

type GenerateVcfTbiMessage = {
	type: 'generateVcfTbi'
	requestId: number
	wasmUrl: string
	vcfFile: File
}

type GenerateIndexMessage = {
	type: 'generateBamBai' | 'generateCramCrai' | 'generateFastaFai'
	requestId: number
	wasmUrl: string
	file: File
}

type LookupMessage =
	| LookupCramMessage
	| LookupVcfMessage
	| WarmupMessage
	| ReportFromBamMessage
	| ReportFromCramMessage
	| ReportFromVcfMessage
	| GenerateVcfTbiMessage
	| GenerateIndexMessage

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

function workerErrorMessage(error: unknown, operation: LookupMessage['type']): string {
	const message = error instanceof Error ? error.message : String(error)
	if (message && !looksLikeWasmStack(message)) return message
	const stack = error instanceof Error ? error.stack ?? '' : ''
	const firstUseful = stack
		.split('\n')
		.map((line) => line.trim())
		.find((line) =>
			line &&
			!line.includes('bioscriptLookupWorker.bundle') &&
			!line.includes('bioscript_wasm_bg.wasm') &&
			!line.includes('wasm-function') &&
			!line.startsWith('__wbg_') &&
			!line.startsWith('bioscript_wasm.wasm.'),
		)
	if (firstUseful && !looksLikeWasmStack(firstUseful)) return firstUseful.replace(/^Error:\s*/, '')
	return operation === 'reportFromVcf'
		? 'BioScript VCF report failed while reading the package or indexed VCF.'
		: `BioScript worker failed during ${operation}.`
}

function looksLikeWasmStack(text: string): boolean {
	return /wasm-function|bioscript_wasm\.wasm|__wbg_|bioscriptLookupWorker\.bundle|wasm_bindgen/.test(text)
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

		if (message.type === 'reportFromCram') {
			const cramReadAt = makeReadAt(message.cramFile, fileReader)
			const fastaReadAt = makeReadAt(message.fastaFile, fileReader)
			const startedAt = Date.now()
			const resultJson = runPackageReportFromCram(
				message.manifestPath,
				message.packageFilesJson,
				message.inputName,
				cramReadAt,
				message.cramFile.size,
				message.craiBytes,
				fastaReadAt,
				message.fastaFile.size,
				message.faiBytes,
				message.optionsJson,
			)
			self.postMessage({
				type: 'done',
				requestId: message.requestId,
				resultJson,
				durationMs: Date.now() - startedAt,
			})
			return
		}

		if (message.type === 'reportFromBam') {
			const bamReadAt = makeReadAt(message.bamFile, fileReader)
			const startedAt = Date.now()
			const resultJson = runPackageReportFromBam(
				message.manifestPath,
				message.packageFilesJson,
				message.inputName,
				bamReadAt,
				message.bamFile.size,
				message.baiBytes,
				message.optionsJson,
			)
			self.postMessage({
				type: 'done',
				requestId: message.requestId,
				resultJson,
				durationMs: Date.now() - startedAt,
			})
			return
		}

		if (message.type === 'reportFromVcf') {
			const vcfReadAt = makeReadAt(message.vcfFile, fileReader)
			const startedAt = Date.now()
			const resultJson = runPackageReportFromVcf(
				message.manifestPath,
				message.packageFilesJson,
				message.inputName,
				vcfReadAt,
				message.vcfFile.size,
				message.tbiBytes,
				message.optionsJson,
			)
			self.postMessage({
				type: 'done',
				requestId: message.requestId,
				resultJson,
				durationMs: Date.now() - startedAt,
			})
			return
		}

		if (message.type === 'generateVcfTbi') {
			const startedAt = Date.now()
			const bytes = new Uint8Array(fileReader.readAsArrayBuffer(message.vcfFile))
			const resultBytes = generateVcfTbi(message.vcfFile.name, bytes)
			self.postMessage({
				type: 'done',
				requestId: message.requestId,
				resultBytes,
				durationMs: Date.now() - startedAt,
			})
			return
		}

		if (message.type === 'generateBamBai' || message.type === 'generateCramCrai' || message.type === 'generateFastaFai') {
			const startedAt = Date.now()
			const readAt = makeReadAt(message.file, fileReader)
			const resultBytes = message.type === 'generateBamBai'
				? generateBamBaiFromReader(message.file.name, readAt, message.file.size)
				: message.type === 'generateCramCrai'
					? generateCramCraiFromReader(message.file.name, readAt, message.file.size)
					: generateFastaFaiFromReader(message.file.name, readAt, message.file.size)
			self.postMessage({
				type: 'done',
				requestId: message.requestId,
				resultBytes,
				durationMs: Date.now() - startedAt,
			})
			return
		}

		if (message.type === 'lookupVcf') {
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
		}
	} catch (error) {
		const messageText = workerErrorMessage(error, message.type)
		self.postMessage({ type: 'error', requestId: message.requestId, error: messageText })
	}
}
