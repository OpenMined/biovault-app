import { getAppDbSync } from '@/lib/app-db'
import { deleteAsync, getInfoAsync } from 'expo-file-system/legacy'
import { Platform } from 'react-native'

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
export const BUILT_IN_SAMPLE_DOCUMENT_ID = 'biovault-sample-data'
export type HomeDataSource = 'sample' | 'imported'

export type HomeImportState = {
	activeImportedDocumentId: string | null
	dataSource: HomeDataSource | null
	importedDocuments: HomeImportedDocument[]
}

type ImportedDocumentRow = {
	contents: string | null
	id: string
	imported_at: string
	mime_type: string | null
	name: string
	original_name: string
	size: number | null
	uri: string
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

const BUILT_IN_SAMPLE_DOCUMENT: HomeImportedDocument = {
	id: BUILT_IN_SAMPLE_DOCUMENT_ID,
	name: 'BioVault demo genome',
	originalName: 'biovault_sample_23andme.txt',
	mimeType: 'text/plain',
	size: null,
	uri: 'biovault://sample',
	importedAt: '2026-04-12T00:00:00.000Z',
	contents: null,
}

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

export function getBuiltInSampleDocument(): HomeImportedDocument {
	return { ...BUILT_IN_SAMPLE_DOCUMENT }
}

function ensureBuiltInSampleDocument(documents: HomeImportedDocument[]) {
	if (documents.some((document) => document.id === BUILT_IN_SAMPLE_DOCUMENT_ID)) {
		return documents
	}

	return [...documents, getBuiltInSampleDocument()]
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

function rowToImportedDocument(row: ImportedDocumentRow): HomeImportedDocument {
	return {
		contents: row.contents,
		id: row.id,
		importedAt: row.imported_at,
		mimeType: row.mime_type,
		name: row.name,
		originalName: row.original_name,
		size: row.size,
		uri: row.uri,
	}
}

function getPreference(key: string) {
	const db = getAppDbSync()
	return db.getFirstSync<{ value: string | null }>('SELECT value FROM app_preferences WHERE key = ?', key)?.value ?? null
}

function setPreference(key: string, value: string | null) {
	const db = getAppDbSync()

	if (value === null) {
		db.runSync('DELETE FROM app_preferences WHERE key = ?', key)
		return
	}

	db.runSync(
		`INSERT INTO app_preferences (key, value)
		 VALUES (?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
		key,
		value
	)
}

function resolveStoredDataSource(value: string | null): HomeDataSource | null {
	return value === 'sample' || value === 'imported' ? value : null
}

export function saveHomeImportState(state: HomeImportState) {
	const db = getAppDbSync()
	const documentsToSave = ensureBuiltInSampleDocument(state.importedDocuments).map(normalizeImportedDocument)

	db.withTransactionSync(() => {
		db.runSync('DELETE FROM imported_documents')

		for (const document of documentsToSave) {
			db.runSync(
				`INSERT INTO imported_documents
				 (id, name, original_name, uri, mime_type, size, imported_at, contents)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
				document.id,
				document.name,
				document.originalName,
				document.uri,
				document.mimeType,
				document.size,
				document.importedAt,
				document.contents ?? null
			)
		}

		const activeImportedDocumentId =
			state.activeImportedDocumentId &&
			documentsToSave.some((document) => document.id === state.activeImportedDocumentId)
				? state.activeImportedDocumentId
				: documentsToSave[0]?.id ?? null

		setPreference(HOME_ACTIVE_IMPORTED_DOCUMENT_ID_KEY, activeImportedDocumentId)
		setPreference(HOME_DATA_SOURCE_KEY, state.dataSource)
	})
}

export function loadHomeImportStateSync(): HomeImportState {
	const db = getAppDbSync()
	const importedDocuments = ensureBuiltInSampleDocument(
		db
		.getAllSync<ImportedDocumentRow>(
			`SELECT id, name, original_name, uri, mime_type, size, imported_at, contents
			 FROM imported_documents
			 ORDER BY imported_at DESC, id DESC`
		)
		.map(rowToImportedDocument)
	)

	const storedActiveId = getPreference(HOME_ACTIVE_IMPORTED_DOCUMENT_ID_KEY)
	const activeImportedDocumentId =
		storedActiveId && importedDocuments.some((document) => document.id === storedActiveId)
			? storedActiveId
			: importedDocuments[0]?.id ?? null

	const state: HomeImportState = {
		activeImportedDocumentId,
		dataSource: resolveStoredDataSource(getPreference(HOME_DATA_SOURCE_KEY)),
		importedDocuments,
	}

	if (state.dataSource === 'imported' && !activeImportedDocumentId) {
		state.dataSource = null
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
		if (document.id === BUILT_IN_SAMPLE_DOCUMENT_ID) {
			importedDocuments.push(document)
			continue
		}

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
			if (document.id === BUILT_IN_SAMPLE_DOCUMENT_ID) {
				continue
			}

			try {
				await deleteAsync(document.uri, { idempotent: true })
			} catch (error) {
				console.error('Failed to delete imported document:', error)
			}
		}
	}

	saveHomeImportState({
		activeImportedDocumentId: BUILT_IN_SAMPLE_DOCUMENT_ID,
		dataSource: null,
		importedDocuments: [getBuiltInSampleDocument()],
	})
}

export async function setActiveImportedDocumentId(documentId: string | null) {
	const state = await loadHomeImportState()
	const nextActiveImportedDocumentId =
		documentId && state.importedDocuments.some((document) => document.id === documentId) ? documentId : null

	saveHomeImportState({
		...state,
		activeImportedDocumentId: nextActiveImportedDocumentId,
		dataSource: nextActiveImportedDocumentId ? 'imported' : state.dataSource,
	})
}
