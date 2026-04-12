import {
	getActiveImportedDocument,
	loadHomeImportState,
	setActiveImportedDocumentId,
	type HomeImportedDocument,
} from '@/lib/home-import'
import type { ReactNode } from 'react'
import { createContext, useCallback, useContext, useState } from 'react'

type ActiveDocumentContextValue = {
	activeDocument: HomeImportedDocument | null
	importedDocuments: HomeImportedDocument[]
	isPickerOpen: boolean
	closePicker: () => void
	openPicker: () => void
	refresh: () => Promise<void>
	selectDocument: (document: HomeImportedDocument) => Promise<void>
	togglePicker: () => void
}

const ActiveDocumentContext = createContext<ActiveDocumentContextValue | null>(null)

export function ActiveDocumentProvider({ children }: { children: ReactNode }) {
	const [activeDocument, setActiveDocument] = useState<HomeImportedDocument | null>(null)
	const [importedDocuments, setImportedDocuments] = useState<HomeImportedDocument[]>([])
	const [isPickerOpen, setIsPickerOpen] = useState(false)

	const refresh = useCallback(async () => {
		const state = await loadHomeImportState()
		setImportedDocuments(state.importedDocuments)
		setActiveDocument(getActiveImportedDocument(state))
	}, [])

	const selectDocument = useCallback(
		async (document: HomeImportedDocument) => {
			await setActiveImportedDocumentId(document.id)
			await refresh()
			setIsPickerOpen(false)
		},
		[refresh]
	)

	return (
		<ActiveDocumentContext.Provider
			value={{
				activeDocument,
				importedDocuments,
				isPickerOpen,
				closePicker: () => setIsPickerOpen(false),
				openPicker: () => setIsPickerOpen(true),
				refresh,
				selectDocument,
				togglePicker: () => setIsPickerOpen((current) => !current),
			}}
		>
			{children}
		</ActiveDocumentContext.Provider>
	)
}

export function useActiveDocument() {
	const value = useContext(ActiveDocumentContext)
	if (!value) {
		throw new Error('useActiveDocument must be used within ActiveDocumentProvider')
	}
	return value
}
