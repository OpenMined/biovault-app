export type HomeImportedDocument = {
	contents?: string | null
	importedAt: string
	mimeType: string | null
	name: string
	size: number | null
	uri: string
}

export const HOME_IMPORTED_DOCUMENT_KEY = 'home_imported_document'
