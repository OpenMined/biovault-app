import { ActiveDocumentPickerDropdown } from '@/components/explore/ActiveDocumentPickerDropdown'
import { ExploreActiveFileBar } from '@/components/explore/ExploreActiveFileBar'
import { ExploreLayoutContextProvider } from '@/components/explore/ExploreLayoutContext'
import {
	getActiveImportedDocument,
	loadHomeImportState,
	setActiveImportedDocumentId,
	type HomeImportedDocument,
} from '@/lib/home-import'
import { omColors, omSpacing } from '@/styles/brand'
import { Stack } from 'expo-router'
import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function ExploreLayout() {
	const [activeDocument, setActiveDocument] = useState<HomeImportedDocument | null>(null)
	const [importedDocuments, setImportedDocuments] = useState<HomeImportedDocument[]>([])
	const [isPickerOpen, setIsPickerOpen] = useState(false)

	const refresh = useCallback(async () => {
		try {
			const state = await loadHomeImportState()
			setImportedDocuments(state.importedDocuments)
			setActiveDocument(getActiveImportedDocument(state))
		} catch (error) {
			console.error('Failed to load Explore layout file context:', error)
			setImportedDocuments([])
			setActiveDocument(null)
		}
	}, [])

	useFocusEffect(
		useCallback(() => {
			void refresh()
		}, [refresh])
	)

	return (
		<ExploreLayoutContextProvider
			value={{
				activeDocument,
				importedDocuments,
				openPicker: () => setIsPickerOpen(true),
				refresh,
			}}
		>
			<SafeAreaView style={styles.safeArea}>
				<View style={styles.container}>
					{isPickerOpen ? <Pressable style={styles.dismissOverlay} onPress={() => setIsPickerOpen(false)} /> : null}

					<View style={styles.stickyChrome}>
						<View style={styles.stickyBar}>
							<ExploreActiveFileBar
								fileName={activeDocument ? activeDocument.name : 'No active file selected'}
								onPress={() => setIsPickerOpen((current) => !current)}
							/>
						</View>
						{isPickerOpen ? (
							<View style={styles.dropdownLayer}>
								<ActiveDocumentPickerDropdown
									documents={importedDocuments}
									activeDocumentId={activeDocument?.id ?? null}
									emptyBody="Import a file first to get file-aware assay recommendations."
									onSelectDocument={(document) => {
										void setActiveImportedDocumentId(document.id)
											.then(async () => {
												await refresh()
												setIsPickerOpen(false)
											})
											.catch((error) => {
												console.error('Failed to update active file:', error)
											})
									}}
								/>
							</View>
						) : null}
					</View>

					<View style={styles.content}>
						<Stack
							screenOptions={{
								headerShown: false,
								contentStyle: { backgroundColor: omColors.grayscale850 },
								animation: 'default',
							}}
						>
							<Stack.Screen name="index" />
							<Stack.Screen name="[category]" />
						</Stack>
					</View>
				</View>
			</SafeAreaView>
		</ExploreLayoutContextProvider>
	)
}

const styles = StyleSheet.create({
	safeArea: {
		flex: 1,
		backgroundColor: omColors.grayscale850,
	},
	container: {
		flex: 1,
		backgroundColor: omColors.grayscale850,
	},
	dismissOverlay: {
		...StyleSheet.absoluteFillObject,
		zIndex: 1,
	},
	stickyChrome: {
		position: 'relative',
		zIndex: 2,
	},
	stickyBar: {
		paddingHorizontal: omSpacing.xl,
		paddingTop: omSpacing.m,
		paddingBottom: omSpacing.s,
	},
	dropdownLayer: {
		position: 'absolute',
		left: omSpacing.xl,
		right: omSpacing.xl,
		top: '100%',
	},
	content: {
		flex: 1,
	},
})
