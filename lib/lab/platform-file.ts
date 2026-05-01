import { Platform } from 'react-native'

export function createLabMemoryFile(
	name: string,
	contents: string | Uint8Array,
	type = 'application/octet-stream',
): File {
	if (Platform.OS === 'web') {
		const blobPart = typeof contents === 'string' ? contents : contents.slice().buffer as ArrayBuffer
		return new File([blobPart], name, { type })
	}

	const bytes = typeof contents === 'string' ? stringToUtf8(contents) : contents.slice()
	return {
		arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
		lastModified: Date.now(),
		name,
		size: bytes.byteLength,
		text: async () => bytesToUtf8(bytes),
		type,
	} as File
}

export function bytesToUtf8(bytes: Uint8Array): string {
	let binary = ''
	const chunkSize = 8192
	for (let offset = 0; offset < bytes.length; offset += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
	}
	return decodeURIComponent(escape(binary))
}

function stringToUtf8(text: string): Uint8Array {
	const encoded = unescape(encodeURIComponent(text))
	const bytes = new Uint8Array(encoded.length)
	for (let i = 0; i < encoded.length; i += 1) {
		bytes[i] = encoded.charCodeAt(i)
	}
	return bytes
}
