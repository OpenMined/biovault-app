import { OMText } from '@/components/ui/OMText'
import type { HomeImportedDocument } from '@/lib/home-import'
import { omColors, omRadius, omSpacing, omTheme } from '@/styles/brand'
import { Modal, Pressable, StyleSheet, View } from 'react-native'

type Props = {
	activeDocumentId: string | null
	documents: HomeImportedDocument[]
	emptyBody: string
	onClose: () => void
	onSelectDocument: (document: HomeImportedDocument) => void
	visible: boolean
}

export function ActiveDocumentPickerModal({
	activeDocumentId,
	documents,
	emptyBody,
	onClose,
	onSelectDocument,
	visible,
}: Props) {
	return (
		<Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
			<View style={styles.modalBackdrop}>
				<Pressable style={styles.modalDismissLayer} onPress={onClose} />
				<View style={styles.modalSheet}>
					<View style={styles.modalHeader}>
						<OMText variant="headline" style={styles.modalTitle}>
							Choose active file
						</OMText>
						<Pressable onPress={onClose} style={({ pressed }) => [styles.modalClose, pressed ? styles.modalClosePressed : null]}>
							<OMText variant="subtitle" style={styles.modalCloseText}>
								Close
							</OMText>
						</Pressable>
					</View>
					<View style={styles.modalStack}>
						{documents.length ? (
							documents.map((document) => {
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
										<View style={styles.fileOptionText}>
											<OMText variant="subtitle" style={styles.fileOptionTitle}>
												{document.name}
											</OMText>
											<OMText variant="caption" style={styles.fileOptionMeta}>
												{document.originalName}
											</OMText>
										</View>
										<OMText variant="subtitle" style={styles.fileOptionAction}>
											{isSelected ? 'Active' : 'Use file'}
										</OMText>
									</Pressable>
								)
							})
						) : (
							<View style={styles.emptyPickerCard}>
								<OMText variant="body" style={styles.emptyPickerBody}>
									{emptyBody}
								</OMText>
							</View>
						)}
					</View>
				</View>
			</View>
		</Modal>
	)
}

const styles = StyleSheet.create({
	modalBackdrop: {
		flex: 1,
		backgroundColor: 'rgba(12,11,17,0.56)',
		justifyContent: 'flex-end',
	},
	modalDismissLayer: {
		flex: 1,
	},
	modalSheet: {
		paddingHorizontal: omSpacing.l,
		paddingTop: omSpacing.l,
		paddingBottom: omSpacing.xl,
		borderTopLeftRadius: omRadius.xl,
		borderTopRightRadius: omRadius.xl,
		backgroundColor: omColors.grayscale850,
		borderTopWidth: 1,
		borderLeftWidth: 1,
		borderRightWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
		gap: omSpacing.m,
	},
	modalHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: omSpacing.m,
	},
	modalTitle: {
		color: omTheme.primaryText,
	},
	modalClose: {
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(255,255,255,0.08)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
	},
	modalClosePressed: {
		opacity: 0.9,
	},
	modalCloseText: {
		color: omTheme.primaryText,
	},
	modalStack: {
		gap: omSpacing.s,
	},
	fileOption: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: omSpacing.m,
		padding: omSpacing.m,
		borderRadius: omRadius.m,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
	},
	fileOptionSelected: {
		backgroundColor: 'rgba(82,168,197,0.1)',
		borderColor: 'rgba(82,168,197,0.35)',
	},
	fileOptionPressed: {
		opacity: 0.9,
	},
	fileOptionText: {
		flex: 1,
		gap: omSpacing.xs,
	},
	fileOptionTitle: {
		color: omTheme.primaryText,
	},
	fileOptionMeta: {
		color: omColors.grayscale500,
	},
	fileOptionAction: {
		color: omColors.teal500,
	},
	emptyPickerCard: {
		padding: omSpacing.l,
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
	},
	emptyPickerBody: {
		color: omColors.grayscale400,
	},
})
