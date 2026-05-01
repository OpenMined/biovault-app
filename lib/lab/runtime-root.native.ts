import { Directory, File, Paths } from 'expo-file-system'
import { readAsStringAsync } from 'expo-file-system/legacy'

import type { LabRuntimeRoot } from '@/lib/lab/runtime-root'

function toNativePath(uri: string): string {
	return uri.replace('file://', '')
}

function toRelativePath(rootPath: string, fileUri: string): string {
	const nativePath = toNativePath(fileUri)
	const normalizedRoot = rootPath.endsWith('/') ? rootPath : `${rootPath}/`
	if (!nativePath.startsWith(normalizedRoot)) {
		throw new Error(`Path is outside lab runtime root: ${nativePath}`)
	}
	return nativePath.slice(normalizedRoot.length)
}

export async function prepareLabRuntimeRoot(outputFileName: string): Promise<LabRuntimeRoot | null> {
	const labDir = new Directory(Paths.document, 'bioscript-lab')
	if (!labDir.exists) {
		labDir.create({ idempotent: true, intermediates: true })
	}
	const cacheDir = new Directory(labDir, '.bioscript-cache')
	if (!cacheDir.exists) {
		cacheDir.create({ idempotent: true, intermediates: true })
	}
	const inputsDir = new Directory(labDir, 'inputs')
	if (!inputsDir.exists) {
		inputsDir.create({ idempotent: true, intermediates: true })
	}
	const root = toNativePath(labDir.uri)
	const outputFile = new File(labDir, outputFileName)
	if (outputFile.exists) {
		outputFile.delete()
	}
	return {
		root,
		outputFile: toRelativePath(root, outputFile.uri),
		cacheDir: toRelativePath(root, cacheDir.uri),
		readOutputText: async () => {
			if (!outputFile.exists) return ''
			return readAsStringAsync(outputFile.uri)
		},
	}
}
