import type { HomeImportedDocument } from '@/lib/home-import'
import type { ReactNode } from 'react'
import { createContext, useContext } from 'react'

export type ExploreLayoutContextValue = {
	activeDocument: HomeImportedDocument | null
	importedDocuments: HomeImportedDocument[]
	openPicker: () => void
	refresh: () => Promise<void>
}

const ExploreLayoutContext = createContext<ExploreLayoutContextValue | null>(null)

export function ExploreLayoutContextProvider({
	children,
	value,
}: {
	children: ReactNode
	value: ExploreLayoutContextValue
}) {
	return <ExploreLayoutContext.Provider value={value}>{children}</ExploreLayoutContext.Provider>
}

export function useExploreLayoutContext() {
	const value = useContext(ExploreLayoutContext)
	if (!value) {
		throw new Error('useExploreLayoutContext must be used within ExploreLayoutContextProvider')
	}
	return value
}
