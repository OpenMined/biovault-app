import { classifyLabFile, makeLabId } from '@/lib/lab/file-model'
import type { LabFileAdapter, LabFileRef, LabFileSource } from '@/lib/lab/core/files'

export type WebLabFileAdapter = LabFileAdapter<File> & {
	getFile: (ref: LabFileRef) => File
	getFiles: (refs: LabFileRef[]) => File[]
}

export function createWebLabFileAdapter(): WebLabFileAdapter {
	const files = new Map<string, File>()

	const getFile = (ref: LabFileRef) => {
		const file = files.get(ref.id)
		if (!file) throw new Error(`File handle is unavailable for ${ref.name}`)
		return file
	}

	return {
		fromPlatformFiles(platformFiles: File[], source: LabFileSource = 'local') {
			return platformFiles.map((file) => {
				const ref: LabFileRef = {
					id: makeLabId('file'),
					kind: classifyLabFile(file.name),
					lastModified: file.lastModified,
					name: file.name,
					size: file.size,
					source,
				}
				files.set(ref.id, file)
				return ref
			})
		},
		getFile,
		getFiles(refs: LabFileRef[]) {
			return refs.map(getFile)
		},
		async readBytes(ref: LabFileRef) {
			return new Uint8Array(await getFile(ref).arrayBuffer())
		},
		async readText(ref: LabFileRef) {
			return getFile(ref).text()
		},
	}
}
