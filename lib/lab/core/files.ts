import type { FileKind } from '@/lib/lab/core/file-kind'

export type LabFileSource = 'bundled' | 'local' | 'url'

export type LabFileRef = {
	id: string
	kind: FileKind
	lastModified?: number
	name: string
	size: number
	source: LabFileSource
}

export type LabFileAdapter<PlatformFile = unknown> = {
	fromPlatformFiles: (files: PlatformFile[], source?: LabFileSource) => LabFileRef[]
	readBytes: (ref: LabFileRef) => Promise<Uint8Array>
	readText: (ref: LabFileRef) => Promise<string>
}
