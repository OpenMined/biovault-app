import { OMText } from '@/components/ui/OMText'
import type { HomeImportedDocument } from '@/lib/home-import'
import { omColors, omRadius, omSpacing, omTheme } from '@/styles/brand'
import { Modal, Pressable, StyleSheet, View } from 'react-native'

type Props = {
	importedDocuments: HomeImportedDocument[]
	onClose: () => void
	onSelectDocument: (document: HomeImportedDocument) => void
	onUseSample: () => void
	selectedDocumentId: string | null
	useSampleInput: boolean
	visible: boolean
}

export function AssayFilePickerModal({
	importedDocuments,
	onClose,
	onSelectDocument,
	onUseSample,
	selectedDocumentId,
	useSampleInput,
	visible,
}: Props) {
	return (
		<Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
			<View style={styles.modalBackdrop}>
				<Pressable style={styles.modalDismissLayer} onPress={onClose} />
				<View style={styles.modalSheet}>
					<View style={styles.modalHeader}>
						<OMText variant="headline" style={styles.modalTitle}>
							Choose file
						</OMText>
						<Pressable onPress={onClose} style={({ pressed }) => [styles.closeButton, pressed ? styles.closeButtonPressed : null]}>
							<OMText variant="subtitle" style={styles.closeButtonText}>
								Close
							</OMText>
						</Pressable>
					</View>

					<View style={styles.fileSelectionStack}>
						{importedDocuments.length ? (
							<>
								<OMText variant="subtitle" style={styles.modalSectionTitle}>
									Your files
								</OMText>
								{importedDocuments.map((document) => {
									const isSelected = !useSampleInput && document.id === selectedDocumentId
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
													{document.mimeType ? ` • ${document.mimeType}` : ''} • Added{' '}
													{new Date(document.importedAt).toLocaleDateString()}
												</OMText>
											</View>
											<OMText variant="subtitle" style={styles.fileOptionAction}>
												{isSelected ? 'Selected' : 'Use file'}
											</OMText>
										</Pressable>
									)
								})}
							</>
						) : null}

						<OMText variant="subtitle" style={styles.modalSectionTitle}>
							Sample data
						</OMText>
						<Pressable
							onPress={onUseSample}
							style={({ pressed }) => [
								styles.fileOption,
								useSampleInput ? styles.fileOptionSelected : null,
								pressed ? styles.fileOptionPressed : null,
							]}
						>
							<View style={styles.fileOptionText}>
								<OMText variant="subtitle" style={styles.fileOptionTitle}>
									Bundled demo sample
								</OMText>
								<OMText variant="caption" style={styles.fileOptionMeta}>
									Use sample data to preview the assay without your own file.
								</OMText>
							</View>
							<OMText variant="subtitle" style={styles.fileOptionAction}>
								{useSampleInput ? 'Selected' : 'Use sample'}
							</OMText>
						</Pressable>
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
	closeButton: {
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(255,255,255,0.08)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
	},
	closeButtonPressed: {
		opacity: 0.9,
	},
	closeButtonText: {
		color: omTheme.primaryText,
	},
	fileSelectionStack: {
		gap: omSpacing.s,
	},
	modalSectionTitle: {
		color: omColors.grayscale500,
		textTransform: 'uppercase',
		letterSpacing: 0.6,
		marginTop: omSpacing.s,
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
})
