import { deleteAsync, getInfoAsync } from 'expo-file-system/legacy'
import { Platform } from 'react-native'
import { Storage } from 'expo-sqlite/kv-store'

export type HomeImportedDocument = {
	contents?: string | null
	id: string
	importedAt: string
	mimeType: string | null
	name: string
	originalName: string
	size: number | null
	uri: string
}

export const HOME_IMPORTED_DOCUMENT_KEY = 'home_imported_document'
export const HOME_IMPORTED_DOCUMENTS_KEY = 'home_imported_documents'
export const HOME_ACTIVE_IMPORTED_DOCUMENT_ID_KEY = 'home_active_imported_document_id'
export const HOME_DATA_SOURCE_KEY = 'home_data_source'
export type HomeDataSource = 'sample' | 'imported'

export type HomeImportState = {
	activeImportedDocumentId: string | null
	dataSource: HomeDataSource | null
	importedDocuments: HomeImportedDocument[]
}

const DISPLAY_NAME_EXTENSIONS = [
	'.vcf.gz',
	'.vcf.bz2',
	'.tsv.bz2',
	'.txt',
	'.tsv',
	'.csv',
	'.zip',
	'.gz',
	'.bz2',
	'.vcf',
] as const

function createImportedDocumentId() {
	return `home-import-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function getDisplayNameBase(name: string) {
	const trimmedName = name.trim()
	const lowerName = trimmedName.toLowerCase()
	const matchedExtension = DISPLAY_NAME_EXTENSIONS.find((extension) => lowerName.endsWith(extension))

	if (!matchedExtension) {
		return trimmedName || 'Imported file'
	}

	const baseName = trimmedName.slice(0, -matchedExtension.length).trim()
	return baseName || trimmedName
}

function normalizeImportedDocument(
	document: Partial<HomeImportedDocument> & Pick<HomeImportedDocument, 'name' | 'uri' | 'importedAt'>
): HomeImportedDocument {
	const resolvedName = document.name.trim()
	const resolvedOriginalName = document.originalName?.trim() || resolvedName || 'Imported file'
	return {
		contents: document.contents ?? null,
		id: document.id ?? createImportedDocumentId(),
		importedAt: document.importedAt,
		mimeType: document.mimeType ?? null,
		name: resolvedName || getDisplayNameBase(resolvedOriginalName),
		originalName: resolvedOriginalName,
		size: document.size ?? null,
		uri: document.uri,
	}
}

function parseImportedDocuments(rawValue: string | null): HomeImportedDocument[] {
	if (!rawValue) {
		return []
	}

	try {
		const parsed = JSON.parse(rawValue)
		if (!Array.isArray(parsed)) {
			return []
		}

		return parsed
			.filter(
				(value): value is Partial<HomeImportedDocument> &
					Pick<HomeImportedDocument, 'name' | 'uri' | 'importedAt'> =>
					typeof value === 'object' &&
					value !== null &&
					typeof value.name === 'string' &&
					typeof value.uri === 'string' &&
					typeof value.importedAt === 'string'
			)
			.map(normalizeImportedDocument)
	} catch (error) {
		console.error('Failed to parse imported documents:', error)
		return []
	}
}

function resolveStoredDataSource(value: string | null): HomeDataSource | null {
	return value === 'sample' || value === 'imported' ? value : null
}

function migrateLegacyImportedDocument(): HomeImportedDocument[] {
	const legacyValue = Storage.getItemSync(HOME_IMPORTED_DOCUMENT_KEY)
	if (!legacyValue) {
		return []
	}

	try {
		const parsed = JSON.parse(legacyValue) as Partial<HomeImportedDocument> &
			Pick<HomeImportedDocument, 'name' | 'uri' | 'importedAt'>
		const migrated = normalizeImportedDocument(parsed)
		Storage.removeItemSync(HOME_IMPORTED_DOCUMENT_KEY)
		return [migrated]
	} catch (error) {
		console.error('Failed to migrate legacy imported document:', error)
		Storage.removeItemSync(HOME_IMPORTED_DOCUMENT_KEY)
		return []
	}
}

export function saveHomeImportState(state: HomeImportState) {
	Storage.setItemSync(HOME_IMPORTED_DOCUMENTS_KEY, JSON.stringify(state.importedDocuments))

	if (state.activeImportedDocumentId) {
		Storage.setItemSync(HOME_ACTIVE_IMPORTED_DOCUMENT_ID_KEY, state.activeImportedDocumentId)
	} else {
		Storage.removeItemSync(HOME_ACTIVE_IMPORTED_DOCUMENT_ID_KEY)
	}

	if (state.dataSource) {
		Storage.setItemSync(HOME_DATA_SOURCE_KEY, state.dataSource)
	} else {
		Storage.removeItemSync(HOME_DATA_SOURCE_KEY)
	}

	const activeDocument = getActiveImportedDocument(state)
	if (activeDocument) {
		Storage.setItemSync(HOME_IMPORTED_DOCUMENT_KEY, JSON.stringify(activeDocument))
	} else {
		Storage.removeItemSync(HOME_IMPORTED_DOCUMENT_KEY)
	}
}

export function loadHomeImportStateSync(): HomeImportState {
	const parsedDocuments = parseImportedDocuments(Storage.getItemSync(HOME_IMPORTED_DOCUMENTS_KEY))
	const resolvedDocuments = parsedDocuments.length ? parsedDocuments : migrateLegacyImportedDocument()

	const storedActiveId = Storage.getItemSync(HOME_ACTIVE_IMPORTED_DOCUMENT_ID_KEY)
	const activeImportedDocumentId =
		storedActiveId && resolvedDocuments.some((document) => document.id === storedActiveId)
			? storedActiveId
			: resolvedDocuments[0]?.id ?? null

	const state: HomeImportState = {
		activeImportedDocumentId,
		dataSource: resolveStoredDataSource(Storage.getItemSync(HOME_DATA_SOURCE_KEY)),
		importedDocuments: resolvedDocuments,
	}

	if (state.dataSource === 'imported' && !activeImportedDocumentId) {
		state.dataSource = null
	}

	if (!parsedDocuments.length && resolvedDocuments.length) {
		saveHomeImportState(state)
	}

	return state
}

export async function loadHomeImportState(): Promise<HomeImportState> {
	const state = loadHomeImportStateSync()
	if (Platform.OS === 'web') {
		return state
	}

	let didChange = false
	const importedDocuments: HomeImportedDocument[] = []

	for (const document of state.importedDocuments) {
		const info = await getInfoAsync(document.uri)
		if (info.exists) {
			importedDocuments.push(document)
			continue
		}

		didChange = true
	}

	const activeImportedDocumentId =
		state.activeImportedDocumentId &&
		importedDocuments.some((document) => document.id === state.activeImportedDocumentId)
			? state.activeImportedDocumentId
			: importedDocuments[0]?.id ?? null

	const dataSource =
		state.dataSource === 'imported' && !activeImportedDocumentId ? null : state.dataSource

	if (!didChange && activeImportedDocumentId === state.activeImportedDocumentId && dataSource === state.dataSource) {
		return state
	}

	const nextState = {
		activeImportedDocumentId,
		dataSource,
		importedDocuments,
	}
	saveHomeImportState(nextState)
	return nextState
}

export function getActiveImportedDocument(
	state: Pick<HomeImportState, 'activeImportedDocumentId' | 'importedDocuments'>
) {
	return (
		state.importedDocuments.find((document) => document.id === state.activeImportedDocumentId) ??
		state.importedDocuments[0] ??
		null
	)
}

export async function deleteAllImportedDocuments() {
	const state = await loadHomeImportState()

	if (Platform.OS !== 'web') {
		for (const document of state.importedDocuments) {
			try {
				await deleteAsync(document.uri, { idempotent: true })
			} catch (error) {
				console.error('Failed to delete imported document:', error)
			}
		}
	}

	saveHomeImportState({
		activeImportedDocumentId: null,
		dataSource: null,
		importedDocuments: [],
	})
}
