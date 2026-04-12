import { ActiveDocumentContextCard } from '@/components/explore/ActiveDocumentContextCard'
import { ActiveDocumentPickerModal } from '@/components/explore/ActiveDocumentPickerModal'
import { ExploreCategoryCard } from '@/components/explore/ExploreCategoryCard'
import { OMText } from '@/components/ui/OMText'
import { exploreCategories, getAssaysForExploreCategory } from '@/lib/explore-categories'
import {
	getActiveImportedDocument,
	loadHomeImportState,
	setActiveImportedDocumentId,
	type HomeImportedDocument,
} from '@/lib/home-import'
import { omColors, omSpacing, omTheme } from '@/styles/brand'
import { ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useEffect, useState } from 'react'

export default function ExploreScreen() {
	const [activeDocument, setActiveDocument] = useState<HomeImportedDocument | null>(null)
	const [importedDocuments, setImportedDocuments] = useState<HomeImportedDocument[]>([])
	const [isFilePickerOpen, setIsFilePickerOpen] = useState(false)

	useEffect(() => {
		void loadHomeImportState()
			.then((state) => {
				setImportedDocuments(state.importedDocuments)
				setActiveDocument(getActiveImportedDocument(state))
			})
			.catch((error) => {
				console.error('Failed to load Explore file context:', error)
				setImportedDocuments([])
				setActiveDocument(null)
			})
	}, [])

	return (
		<SafeAreaView style={styles.safeArea}>
			<ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
				<View style={styles.hero}>
					<OMText variant="h4" style={styles.pageTitle}>
						Explore
					</OMText>
					<OMText variant="body" style={styles.pageBody}>
						Browse analysis categories and open a category to view its description, example, and available assays.
					</OMText>
				</View>

				<ActiveDocumentContextCard
					label="Browsing with"
					title={activeDocument ? activeDocument.name : 'No active file selected'}
					body={
						activeDocument
							? 'Compatibility badges in Explore use this file.'
							: 'Pick a file to make assay recommendations more useful.'
					}
					buttonLabel={activeDocument ? 'Change' : 'Choose'}
					onPress={() => setIsFilePickerOpen(true)}
				/>

				<View style={styles.stack}>
					{exploreCategories.map((category) => (
						<ExploreCategoryCard
							key={category.slug}
							category={category}
							assayCount={getAssaysForExploreCategory(category.slug).length}
						/>
					))}
				</View>
			</ScrollView>

			<ActiveDocumentPickerModal
				visible={isFilePickerOpen}
				onClose={() => setIsFilePickerOpen(false)}
				documents={importedDocuments}
				activeDocumentId={activeDocument?.id ?? null}
				emptyBody="Import a file first to get file-aware assay recommendations."
				onSelectDocument={(document) => {
					void setActiveImportedDocumentId(document.id)
						.then(() => {
							setActiveDocument(document)
							setIsFilePickerOpen(false)
						})
						.catch((error) => {
							console.error('Failed to update active file:', error)
						})
				}}
			/>
		</SafeAreaView>
	)
}

const styles = StyleSheet.create({
	safeArea: {
		flex: 1,
		backgroundColor: omColors.grayscale850,
	},
	screen: {
		flex: 1,
		backgroundColor: omColors.grayscale850,
	},
	content: {
		padding: omSpacing.xl,
		paddingBottom: omSpacing.xxxl,
		gap: omSpacing.xl,
	},
	hero: {
		gap: omSpacing.s,
	},
	pageTitle: {
		color: omTheme.primaryText,
	},
	pageBody: {
		color: omColors.grayscale400,
		lineHeight: 22,
	},
	stack: {
		gap: omSpacing.s,
	},
})
