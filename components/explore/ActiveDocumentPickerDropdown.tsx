import { OMText } from '@/components/ui/OMText'
import type { HomeImportedDocument } from '@/lib/home-import'
import { omColors, omRadius, omSpacing, omTheme } from '@/styles/brand'
import { Pressable, StyleSheet, View } from 'react-native'

type Props = {
	activeDocumentId: string | null
	documents: HomeImportedDocument[]
	emptyBody: string
	onAddFile: () => void
	onManageDocument: (document: HomeImportedDocument) => void
	onSelectDocument: (document: HomeImportedDocument) => void
}

export function ActiveDocumentPickerDropdown({
	activeDocumentId,
	documents,
	emptyBody,
	onAddFile: _onAddFile,
	onManageDocument: _onManageDocument,
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
									<View style={styles.fileOptionRow}>
										<OMText variant="subtitle" style={styles.fileOptionTitle} numberOfLines={1} ellipsizeMode="tail">
											{document.name}
										</OMText>
										<View style={styles.fileOptionActions}>
											{/* Restore Manage here if file-level actions return to the picker. */}
											<View style={[styles.selectButton, isSelected ? styles.selectButtonActive : null]}>
												<OMText
													variant="subtitle"
													style={[styles.fileOptionAction, isSelected ? styles.fileOptionActionActive : null]}
												>
													{isSelected ? 'Active' : 'Use file'}
												</OMText>
											</View>
										</View>
									</View>
								</Pressable>
							)
						})
					) : (
						<View style={styles.emptyCard}>
							<OMText variant="body" style={styles.emptyBody}>
								{emptyBody}
							</OMText>
							{/* Restore Add File here if the picker should handle imports again. */}
						</View>
					)}
					{/* Restore Add File here if the picker should handle imports again. */}
				</View>
			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	dropdownCard: {
		borderRadius: omRadius.m,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
		padding: omSpacing.xs,
		shadowColor: '#000000',
		shadowOpacity: 0.18,
		shadowRadius: 18,
		shadowOffset: { width: 0, height: 10 },
		elevation: 8,
	},
	stack: {
		gap: omSpacing.xs,
	},
	fileOption: {
		borderRadius: omRadius.m,
		backgroundColor: omColors.grayscale850,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.06)',
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
	},
	fileOptionRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: omSpacing.s,
	},
	fileOptionSelected: {
		backgroundColor: 'rgba(82,168,197,0.08)',
		borderColor: 'rgba(82,168,197,0.18)',
	},
	fileOptionPressed: {
		opacity: 0.92,
	},
	fileOptionTitle: {
		color: omTheme.primaryText,
		flex: 1,
		minWidth: 0,
	},
	fileOptionActions: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: omSpacing.s,
		flexShrink: 0,
	},
	selectButton: {
		paddingHorizontal: omSpacing.s,
		paddingVertical: 4,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(83,190,169,0.1)',
		borderWidth: 1,
		borderColor: 'rgba(83,190,169,0.16)',
	},
	selectButtonActive: {
		backgroundColor: 'rgba(82,168,197,0.1)',
		borderColor: 'rgba(82,168,197,0.18)',
	},
	fileOptionAction: {
		color: omTheme.accent,
	},
	fileOptionActionActive: {
		color: omColors.teal500,
	},
	emptyCard: {
		padding: omSpacing.xl,
		borderRadius: omRadius.m,
		backgroundColor: omColors.grayscale850,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.06)',
		gap: omSpacing.m,
	},
	emptyBody: {
		color: omColors.grayscale400,
	},
})
