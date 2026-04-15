import type { Backend, FileRef, InspectOptions, Inspection } from './types'

// Placeholder. Slice 2/3 wires up expo-document-picker + expo-file-system + an FFI
// path that calls bioscript-formats::inspect_file. For now the widget is web-first.
async function notImplemented(): Promise<never> {
	throw new Error('native file-picker backend not yet implemented')
}

export const backend: Backend = {
	label: 'native:stub',
	supportsUrlInput: true,
	supportsDragDrop: false,
	linksInPlace: false,
	pickPrimary: notImplemented,
	pickReference: notImplemented,
	inspect: ((_ref: FileRef, _options?: InspectOptions): Promise<Inspection> =>
		notImplemented()) as Backend['inspect'],
}
