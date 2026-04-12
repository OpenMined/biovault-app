import type { HomeImportedDocument } from '@/lib/home-import'
import { omSpacing } from '@/styles/brand'
import { StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ActiveDocumentPickerDropdown } from './ActiveDocumentPickerDropdown'
import { ExploreActiveFileBar } from './ExploreActiveFileBar'

type Props = {
	activeDocumentId: string | null
	documents: HomeImportedDocument[]
	emptyBody: string
	fileName: string
	isHighlighted?: boolean
	isOpen: boolean
	isVisible?: boolean
	onAddFile: () => void
	onManageDocument: (document: HomeImportedDocument) => void
	onSelectDocument: (document: HomeImportedDocument) => void
	onToggle: () => void
}

export function ActiveDocumentFloatingPicker({
	activeDocumentId,
	documents,
	emptyBody,
	fileName,
	isHighlighted = false,
	isOpen,
	isVisible = true,
	onAddFile,
	onManageDocument,
	onSelectDocument,
	onToggle,
}: Props) {
	return (
		<SafeAreaView
			edges={['left', 'right']}
			pointerEvents={isVisible ? 'box-none' : 'none'}
			style={[styles.chrome, !isVisible ? styles.chromeHidden : null]}
		>
			<View style={styles.anchor}>
				<View style={styles.stickyBar}>
					<ExploreActiveFileBar
						fileName={fileName}
						isHighlighted={isHighlighted}
						chevronDirection="down"
						onPress={onToggle}
					/>
				</View>
				{isOpen ? (
					<View style={styles.dropdownLayer}>
						<ActiveDocumentPickerDropdown
							documents={documents}
							activeDocumentId={activeDocumentId}
							emptyBody={emptyBody}
							onAddFile={onAddFile}
							onManageDocument={onManageDocument}
							onSelectDocument={onSelectDocument}
						/>
					</View>
				) : null}
			</View>
		</SafeAreaView>
	)
}

const styles = StyleSheet.create({
	chrome: {
		width: '100%',
		alignItems: 'center',
		zIndex: 20,
		elevation: 20,
		overflow: 'visible',
	},
	chromeHidden: {
		opacity: 0,
	},
	anchor: {
		width: '100%',
		maxWidth: 460,
		alignSelf: 'center',
		position: 'relative',
	},
	stickyBar: {
		width: '100%',
		zIndex: 2,
	},
	dropdownLayer: {
		position: 'absolute',
		left: 0,
		right: 0,
		top: '100%',
		paddingTop: omSpacing.s,
		zIndex: 21,
		elevation: 21,
	},
})
