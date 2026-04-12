import { OMText } from '@/components/ui/OMText'
import type { HomeImportedDocument } from '@/lib/home-import'
import { omColors, omRadius, omSpacing, omTheme } from '@/styles/brand'
import { Pressable, StyleSheet, View } from 'react-native'

type Props = {
	activeDocumentId: string | null
	documents: HomeImportedDocument[]
	emptyBody: string
	onSelectDocument: (document: HomeImportedDocument) => void
}

export function ActiveDocumentPickerDropdown({
	activeDocumentId,
	documents,
	emptyBody,
	onSelectDocument,
}: Props) {
	const orderedDocuments = [
		...documents.filter((document) => document.id === activeDocumentId),
		...documents.filter((document) => document.id !== activeDocumentId),
	]

	return (
		<View style={styles.dropdownShell}>
			<View style={styles.dropdownCard}>
				<View style={styles.stack}>
					{orderedDocuments.length ? (
						orderedDocuments.map((document) => {
							const isSelected = activeDocumentId === document.id
							return (
								<Pressable
									key={document.id}
									onPress={() => onSelectDocument(document)}
									style={({ pressed }) => [
										styles.fileOption,
										isSelected ? styles.fileOptionSelected : null,
										pressed ? styles.fileOptionPressed : null,
									]}
								>
									<OMText variant="subtitle" style={styles.fileOptionTitle} numberOfLines={1} ellipsizeMode="tail">
										{document.name}
									</OMText>
									<OMText variant="subtitle" style={styles.fileOptionAction}>
										{isSelected ? 'Active' : 'Use file'}
									</OMText>
								</Pressable>
							)
						})
					) : (
						<View style={styles.emptyCard}>
							<OMText variant="body" style={styles.emptyBody}>
								{emptyBody}
							</OMText>
						</View>
					)}
				</View>
			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	dropdownCard: {
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
		padding: omSpacing.xs,
		shadowColor: '#000000',
		shadowOpacity: 0.16,
		shadowRadius: 16,
		shadowOffset: { width: 0, height: 8 },
		elevation: 6,
	},
	stack: {
		gap: omSpacing.xs,
	},
	fileOption: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: omSpacing.m,
		padding: omSpacing.m,
		borderRadius: omRadius.m,
		backgroundColor: omColors.grayscale850,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
	},
	fileOptionSelected: {
		backgroundColor: 'rgba(82,168,197,0.1)',
		borderColor: 'rgba(82,168,197,0.35)',
	},
	fileOptionPressed: {
		opacity: 0.92,
	},
	fileOptionTitle: {
		color: omTheme.primaryText,
		flex: 1,
		minWidth: 0,
	},
	fileOptionAction: {
		color: omColors.teal500,
	},
	emptyCard: {
		padding: omSpacing.l,
		borderRadius: omRadius.m,
		backgroundColor: omColors.grayscale850,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
	},
	emptyBody: {
		color: omColors.grayscale400,
	},
})
