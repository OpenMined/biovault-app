import { inspectBytes, type BioscriptInspection } from '@/modules/expo-bioscript/src/BioscriptWasm'

import type { Backend, FileRef, InspectOptions, Inspection } from './types'
import { fileRefName, fileRefSize } from './types'

// Web FilePicker backend. All classification/parsing goes through bioscript-wasm
// (see docs/architecture/bioscript-is-source-of-truth.md). This file only
// handles the DOM bits: showOpenFilePicker / <input> fallback / drag-drop and
// marshalling bytes into Rust.

// Rules Chrome enforces on showOpenFilePicker acceptTypes:
//   * each extension must start with '.' and contain no further dots
//     (so `.fa.gz` is invalid — gotta pick one);
//   * the same extension cannot appear more than once across the whole config.
// One flat group with "All files" toggle available covers every case without
// hunting for a filter.
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

// Cap how many bytes we ship into wasm for non-container files. Heuristics
// only need the first ~128 KB; streaming the whole 3 GB reference is pointless.
const MAX_TEXT_SAMPLE_BYTES = 128 * 1024

async function readInspectionBytes(file: File, name: string): Promise<Uint8Array> {
	const lower = name.toLowerCase()
	const needsFull =
		lower.endsWith('.zip') || lower.endsWith('.vcf.gz') || lower.endsWith('.gz')
	const slice = needsFull ? file : file.slice(0, Math.min(file.size, MAX_TEXT_SAMPLE_BYTES))
	return new Uint8Array(await slice.arrayBuffer())
}

async function inspectFileRef(ref: FileRef, options?: InspectOptions): Promise<Inspection> {
	const name = fileRefName(ref)
	const sizeBytes = fileRefSize(ref)
	const lower = name.toLowerCase()

	// Binary alignment / reference formats — extension-only classification.
	// Still go through wasm so the heuristics rules stay in one place.
	if (
		lower.endsWith('.cram') ||
		lower.endsWith('.bam') ||
		lower.endsWith('.fa') ||
		lower.endsWith('.fasta')
	) {
		const rust = await inspectBytes(name, new Uint8Array(0))
		const inspection: Inspection = { ...rust, sizeBytes }
		if (
			options?.reference &&
			(inspection.detectedKind === 'alignment_cram' ||
				inspection.detectedKind === 'alignment_bam')
		) {
			inspection.referenceMatches = await referencePairMatches(options.reference, inspection)
		}
		return inspection
	}

	const file = await refToFile(ref)
	const bytes = await readInspectionBytes(file, name)
	const rust: BioscriptInspection = await inspectBytes(name, bytes)
	return { ...rust, sizeBytes }
}

async function referencePairMatches(ref: FileRef, primary: Inspection): Promise<boolean> {
	const refName = fileRefName(ref)
	const refLower = refName.toLowerCase()
	const refIsFasta = refLower.endsWith('.fa') || refLower.endsWith('.fasta')
	if (!refIsFasta) return false
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
