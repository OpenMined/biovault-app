import * as DocumentPicker from 'expo-document-picker'
import { EncodingType, readAsStringAsync } from 'expo-file-system/legacy'

import type { LabFileDropSubscription, LabFilePickerAdapter } from '@/lib/lab/adapters/file-picker'
import { createLabMemoryFile } from '@/lib/lab/platform-file'

export function createNativeLabFilePickerAdapter(): LabFilePickerAdapter {
	return {
		canDropFiles: false,
		canPickFiles: true,
		pickFiles,
		subscribeToFileDrops(_subscription: LabFileDropSubscription) {
			return () => {}
		},
	}
}

async function pickFiles(): Promise<File[]> {
	const result = await DocumentPicker.getDocumentAsync({
		copyToCacheDirectory: true,
		multiple: true,
		type: '*/*',
	})
	if (result.canceled) return []
	return Promise.all(
		result.assets.map(async (asset) => {
			const base64 = await readAsStringAsync(asset.uri, { encoding: EncodingType.Base64 })
			return createLabMemoryFile(
				asset.name,
				base64ToBytes(base64),
				asset.mimeType ?? 'application/octet-stream',
			)
		}),
	)
}

function base64ToBytes(value: string): Uint8Array {
	const binary = atob(value)
	const bytes = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i += 1) {
		bytes[i] = binary.charCodeAt(i)
	}
	return bytes
}
