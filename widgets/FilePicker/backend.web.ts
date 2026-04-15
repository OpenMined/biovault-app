import { unzipSync } from 'fflate'

import { inspectFromSample, sampleLinesFromText } from './heuristics'
import type { Backend, FileRef, InspectOptions, Inspection } from './types'
import { fileRefName, fileRefSize } from './types'

const TEXT_SLICE_BYTES = 128 * 1024

// Accept anything genomic-ish. Individual heuristics take over from here.
// Rules Chrome enforces on showOpenFilePicker acceptTypes:
//   * each extension must start with '.' and contain no further dots
//     (so `.fa.gz` is invalid — gotta pick one);
//   * the same extension cannot appear more than once across the whole config.
// We flatten everything into one group so the user doesn't have to hunt for a
// filter dropdown to see their CRAM. "All files" remains available via
// excludeAcceptAllOption: false.
const ACCEPT_TYPES: FilePickerAcceptType[] = [
	{
		description: 'Genomic files',
		accept: {
			'application/octet-stream': [
				'.txt',
				'.tsv',
				'.csv',
				'.vcf',
				'.zip',
				'.gz',
				'.bam',
				'.cram',
				'.fa',
				'.fasta',
			],
		},
	},
]

type FilePickerAcceptType = {
	description?: string
	accept: Record<string, string[]>
}

function hasShowOpenFilePicker(): boolean {
	if (typeof window === 'undefined') return false
	if (!('showOpenFilePicker' in window)) return false
	// E2E opt-out so Playwright can drive the <input> fallback path, where
	// page.waitForEvent('filechooser') is reliable across browsers.
	try {
		if (new URLSearchParams(window.location.search).get('e2e') === 'input') return false
	} catch {
		/* noop */
	}
	return true
}

async function pickViaFileSystemAccess(): Promise<FileRef | null> {
	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const [handle] = (await (window as any).showOpenFilePicker({
			multiple: false,
			types: ACCEPT_TYPES,
			excludeAcceptAllOption: false,
		})) as FileSystemFileHandle[]
		if (!handle) return null
		const file = await handle.getFile()
		return { kind: 'handle', handle, name: file.name, size: file.size }
	} catch (err) {
		// User cancel throws AbortError; treat as null.
		if ((err as DOMException)?.name === 'AbortError') return null
		throw err
	}
}

async function pickViaInput(): Promise<FileRef | null> {
	return new Promise<FileRef | null>((resolve) => {
		const input = document.createElement('input')
		input.type = 'file'
		input.style.display = 'none'
		input.accept = '.zip,.gz,.txt,.tsv,.csv,.vcf,.bam,.cram,.fa,.fasta'
		input.onchange = () => {
			const file = input.files?.[0]
			document.body.removeChild(input)
			resolve(file ? { kind: 'blob', file } : null)
		}
		input.oncancel = () => {
			document.body.removeChild(input)
			resolve(null)
		}
		document.body.appendChild(input)
		input.click()
	})
}

async function refToFile(ref: FileRef): Promise<File> {
	switch (ref.kind) {
		case 'blob':
			return ref.file
		case 'handle':
			return await ref.handle.getFile()
		case 'url': {
			const res = await fetch(ref.url)
			if (!res.ok) throw new Error(`fetch failed ${res.status}`)
			const blob = await res.blob()
			return new File([blob], fileRefName(ref))
		}
		case 'path':
			throw new Error('web backend cannot read raw paths')
	}
}

async function readSampleBytes(file: File): Promise<Uint8Array> {
	const slice = file.slice(0, Math.min(file.size, TEXT_SLICE_BYTES))
	const buf = await slice.arrayBuffer()
	return new Uint8Array(buf)
}

function decodeUtf8(bytes: Uint8Array): string {
	return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

function selectZipEntry(entries: string[]): string | undefined {
	const candidates = entries.filter((name) => !name.endsWith('/') && !name.startsWith('__MACOSX/'))
	const preferred = ['.vcf', '.vcf.gz', '.txt', '.tsv', '.csv']
	for (const ext of preferred) {
		const hit = candidates.find((n) => n.toLowerCase().endsWith(ext))
		if (hit) return hit
	}
	return candidates[0]
}

async function inspectFileRef(ref: FileRef, options?: InspectOptions): Promise<Inspection> {
	const name = fileRefName(ref)
	const sizeBytes = fileRefSize(ref)
	const lower = name.toLowerCase()

	// Binary formats: detected from extension, no bytes needed.
	if (
		lower.endsWith('.cram') ||
		lower.endsWith('.bam') ||
		lower.endsWith('.fa') ||
		lower.endsWith('.fasta')
	) {
		const insp = inspectFromSample({ name, container: 'plain', sampleLines: [], sizeBytes })
		if (
			options?.reference &&
			(insp.detectedKind === 'alignment_cram' || insp.detectedKind === 'alignment_bam')
		) {
			insp.referenceMatches = await referencePairMatches(options.reference, insp)
		}
		return insp
	}

	const file = await refToFile(ref)

	if (lower.endsWith('.zip')) {
		// fflate needs the full buffer; zip central directory lives at EOF.
		const buf = new Uint8Array(await file.arrayBuffer())
		const unzipped = unzipSync(buf)
		const entryName = selectZipEntry(Object.keys(unzipped))
		if (!entryName) {
			return inspectFromSample({
				name,
				container: 'zip',
				sampleLines: [],
				sizeBytes,
			})
		}
		const entryBytes = unzipped[entryName]
		if (!entryBytes) {
			return inspectFromSample({
				name,
				container: 'zip',
				sampleLines: [],
				sizeBytes,
			})
		}
		const slice = entryBytes.slice(0, Math.min(entryBytes.length, TEXT_SLICE_BYTES))
		const sampleLines = sampleLinesFromText(decodeUtf8(slice))
		return inspectFromSample({
			name,
			container: 'zip',
			selectedEntry: entryName,
			sampleLines,
			sizeBytes,
		})
	}

	// Plain text (or .vcf.gz — TODO: bgzf decode; for now sample the gz prefix unchanged,
	// which will fall through to "unknown" but still report size/name).
	const bytes = await readSampleBytes(file)
	const sampleLines = sampleLinesFromText(decodeUtf8(bytes))
	return inspectFromSample({ name, container: 'plain', sampleLines, sizeBytes })
}

async function referencePairMatches(ref: FileRef, primary: Inspection): Promise<boolean> {
	const refName = fileRefName(ref)
	const refLower = refName.toLowerCase()
	const refIsFasta = refLower.endsWith('.fa') || refLower.endsWith('.fasta')
	if (!refIsFasta) return false
	// Quick assembly sniff from the reference filename (we don't need to open it
	// for the common case: 1k-genomes file names embed GRCh38 / hg19 tokens).
	const refAssembly = refLower.includes('grch38') || refLower.includes('hg38')
		? 'grch38'
		: refLower.includes('grch37') || refLower.includes('hg19')
			? 'grch37'
			: undefined
	if (refAssembly && primary.assembly && refAssembly !== primary.assembly) return false
	return true
}

async function pickPrimary(): Promise<FileRef | null> {
	return hasShowOpenFilePicker() ? pickViaFileSystemAccess() : pickViaInput()
}

export const backend: Backend = {
	label: hasShowOpenFilePicker() ? 'web:fs-access' : 'web:input',
	supportsUrlInput: true,
	supportsDragDrop: true,
	linksInPlace: hasShowOpenFilePicker(),
	pickPrimary,
	pickReference: pickPrimary,
	inspect: inspectFileRef,
}
