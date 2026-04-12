import { OMText } from '@/components/ui/OMText'
import {
	getDisplayNameBase,
	loadHomeImportStateSync,
	saveHomeImportState,
	type HomeImportedDocument,
} from '@/lib/home-import'
import { omColors, omRadius, omSpacing, omTheme } from '@/styles/brand'
import * as DocumentPicker from 'expo-document-picker'
import { router } from 'expo-router'
import { Directory, File, Paths } from 'expo-file-system'
import { copyAsync } from 'expo-file-system/legacy'
import { useState } from 'react'
import * as Linking from 'expo-linking'
import {
	Alert,
	Keyboard,
	KeyboardAvoidingView,
	Modal,
	Platform,
	Pressable,
	StyleSheet,
	TextInput,
	View,
	type TextInputSubmitEditingEventData,
	type NativeSyntheticEvent,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

const SUPPORTED_EXTENSIONS = [
	'.vcf',
	'.vcf.gz',
	'.vcf.bz2',
	'.txt',
	'.tsv',
	'.tsv.bz2',
	'.csv',
	'.zip',
	'.gz',
	'.bz2',
]

const PICKER_MIME_TYPES = [
	'text/*',
	'text/plain',
	'text/tab-separated-values',
	'text/csv',
	'application/octet-stream',
	'application/zip',
	'application/gzip',
	'application/x-gzip',
	'application/x-bzip2',
]

type QueuedImportAsset = {
	displayName: string
	file?: DocumentPicker.DocumentPickerAsset['file'] | null
	mimeType: string | null
	name: string
	size: number | null
	uri: string
}

function sanitizeFileName(name: string): string {
	return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function hasSupportedExtension(name: string): boolean {
	const lowerName = name.toLowerCase()
	return SUPPORTED_EXTENSIONS.some((extension) => lowerName.endsWith(extension))
}

function createImportedDocumentId() {
	return `home-import-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export default function DataSourceScreen() {
	const [isImporting, setIsImporting] = useState(false)
	const [pendingAssets, setPendingAssets] = useState<QueuedImportAsset[]>([])
	const [reviewedAssets, setReviewedAssets] = useState<QueuedImportAsset[]>([])
	const [displayName, setDisplayName] = useState('')

	const currentAsset = pendingAssets[0] ?? null

	const finalizeImports = async (assets: QueuedImportAsset[]) => {
		const currentState = loadHomeImportStateSync()
		const importedDocuments = [...currentState.importedDocuments]

		if (Platform.OS === 'web') {
			for (const asset of assets) {
				const storedDocument: HomeImportedDocument = {
					contents: asset.file ? await asset.file.text() : null,
					id: createImportedDocumentId(),
					importedAt: new Date().toISOString(),
					mimeType: asset.mimeType ?? null,
					name: asset.displayName,
					originalName: asset.name,
					size: asset.size ?? null,
					uri: asset.uri,
				}

				importedDocuments.push(storedDocument)
			}

			saveHomeImportState({
				activeImportedDocumentId: importedDocuments[0]?.id ?? null,
				dataSource: null,
				importedDocuments,
			})
			router.back()
			return
		}

		const importsDirectory = new Directory(Paths.cache, 'home-imports')
		if (!importsDirectory.exists) {
			importsDirectory.create({ idempotent: true, intermediates: true })
		}

		for (const asset of assets) {
			const timestamp = Date.now()
			const targetFile = new File(importsDirectory, `${timestamp}-${sanitizeFileName(asset.name)}`)

			await copyAsync({
				from: asset.uri,
				to: targetFile.uri,
			})

			const storedDocument: HomeImportedDocument = {
				id: createImportedDocumentId(),
				importedAt: new Date().toISOString(),
				mimeType: asset.mimeType ?? null,
				name: asset.displayName,
				originalName: asset.name,
				size: asset.size ?? null,
				uri: targetFile.uri,
			}

			importedDocuments.push(storedDocument)
		}

		saveHomeImportState({
			activeImportedDocumentId: importedDocuments[0]?.id ?? null,
			dataSource: null,
			importedDocuments,
		})
		router.back()
	}

	const queueImports = async () => {
		try {
			setIsImporting(true)

			const result = await DocumentPicker.getDocumentAsync({
				copyToCacheDirectory: false,
				multiple: true,
				type: PICKER_MIME_TYPES,
			})

			if (result.canceled || !result.assets.length) {
				return
			}

			const unsupportedAsset = result.assets.find((asset) => !hasSupportedExtension(asset.name))
			if (unsupportedAsset) {
				Alert.alert('Unsupported file', 'Choose VCF, TXT, TSV, CSV, ZIP, GZ, or BZ2 genomic data files.')
				return
			}

			const queuedAssets = result.assets.map((asset) => ({
				...asset,
				displayName: getDisplayNameBase(asset.name),
				file: asset.file ?? null,
				mimeType: asset.mimeType ?? null,
				size: asset.size ?? null,
			}))
			setReviewedAssets([])
			setPendingAssets(queuedAssets)
			setDisplayName(queuedAssets[0]?.displayName ?? '')
		} catch (error) {
			console.error('Failed to pick document:', error)
			Alert.alert('Import error', 'Unable to open the document picker right now.')
		} finally {
			setIsImporting(false)
		}
	}

	const commitCurrentAssetName = (value: string) => {
		if (!currentAsset) {
			return
		}

		const nextName = value.trim() || currentAsset.name
		const completedAsset: QueuedImportAsset = { ...currentAsset, displayName: nextName }
		const remainingAssets = pendingAssets.slice(1)
		const nextReviewedAssets = [...reviewedAssets, completedAsset]

		if (!remainingAssets.length) {
			setPendingAssets([])
			setReviewedAssets([])
			setDisplayName('')
			void finalizeImports(nextReviewedAssets).catch((error) => {
				console.error('Failed to save imported files:', error)
				Alert.alert('Import error', 'Unable to save the imported files.')
			})
			return
		}

		setReviewedAssets(nextReviewedAssets)
		setPendingAssets(remainingAssets)
		setDisplayName(remainingAssets[0]?.displayName ?? getDisplayNameBase(remainingAssets[0]?.name ?? ''))
	}

	const handleRenameSubmit = (
		event?: NativeSyntheticEvent<TextInputSubmitEditingEventData>
	) => {
		commitCurrentAssetName(event?.nativeEvent.text ?? displayName)
	}

	return (
		<SafeAreaView style={styles.safeArea}>
			<View style={styles.content}>
				<View style={styles.topBar}>
					<Pressable onPress={() => router.back()} style={styles.closeButton}>
						<OMText variant="subtitle" style={styles.closeButtonText}>
							Close
						</OMText>
					</Pressable>
				</View>

				<View style={styles.header}>
					<OMText variant="h4" style={styles.title}>
						Add files
					</OMText>
				</View>

				<View style={styles.actionStack}>
					<Pressable onPress={() => void queueImports()} style={styles.importButton}>
						<OMText variant="headline" style={styles.importButtonTitle}>
							Import from device
						</OMText>
						<OMText variant="caption" style={styles.importButtonMeta}>
							{isImporting ? 'Opening file picker...' : 'VCF, TXT, TSV, CSV, ZIP, GZ, BZ2'}
						</OMText>
					</Pressable>
				</View>

				<Pressable
					onPress={() => void Linking.openURL('https://biovault.net')}
					hitSlop={8}
					style={styles.helpLinkButton}
				>
					<OMText variant="subtitle" style={styles.helpLink}>
						How do I get my genomic data?
					</OMText>
				</Pressable>
			</View>

			<Modal
				visible={!!currentAsset}
				transparent
				animationType="fade"
				onRequestClose={() => {
					Keyboard.dismiss()
					setPendingAssets([])
					setReviewedAssets([])
					setDisplayName('')
				}}
			>
				<KeyboardAvoidingView
					behavior={Platform.OS === 'ios' ? 'padding' : undefined}
					style={styles.modalRoot}
				>
					<Pressable style={styles.modalBackdrop} onPress={Keyboard.dismiss}>
						<Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
							<OMText variant="h4" style={styles.modalTitle}>
								Name this file
							</OMText>
							<OMText variant="body" style={styles.modalBody}>
								Choose a display name for {currentAsset?.name}. You can keep the existing name if it
								is already clear.
							</OMText>
							<TextInput
								value={displayName}
								onChangeText={setDisplayName}
								onSubmitEditing={handleRenameSubmit}
								placeholder={currentAsset?.name}
								placeholderTextColor={omColors.grayscale500}
								autoCapitalize="none"
								autoCorrect={false}
								autoFocus
								blurOnSubmit
								returnKeyType="done"
								style={styles.nameInput}
							/>
							<View style={styles.modalActions}>
								<Pressable
									onPress={() => commitCurrentAssetName(currentAsset?.name ?? displayName)}
									style={styles.secondaryAction}
								>
									<OMText variant="subtitle" style={styles.secondaryActionText}>
										Keep As Is
									</OMText>
								</Pressable>
								<Pressable onPress={() => commitCurrentAssetName(displayName)} style={styles.primaryAction}>
									<OMText variant="subtitle" style={styles.primaryActionText}>
										Save Name
									</OMText>
								</Pressable>
							</View>
						</Pressable>
					</Pressable>
				</KeyboardAvoidingView>
			</Modal>
		</SafeAreaView>
	)
}

const styles = StyleSheet.create({
	safeArea: {
		flex: 1,
		backgroundColor: omColors.grayscale850,
	},
	content: {
		flex: 1,
		padding: omSpacing.xl,
		gap: omSpacing.xxxl,
	},
	topBar: {
		alignItems: 'flex-start',
	},
	closeButton: {
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.full,
		backgroundColor: 'rgba(255,255,255,0.08)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.12)',
	},
	closeButtonText: {
		color: omColors.grayscale300,
	},
	header: {
		gap: omSpacing.m,
	},
	actionStack: {
		gap: omSpacing.m,
	},
	title: {
		color: omTheme.primaryText,
	},
	helpLinkButton: {
		alignSelf: 'center',
		paddingVertical: omSpacing.xs,
	},
	helpLink: {
		color: omTheme.accent,
		fontSize: 14,
		lineHeight: 20,
	},
	body: {
		color: omColors.grayscale400,
		maxWidth: 340,
	},
	importButton: {
		padding: omSpacing.xl,
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.1)',
	},
	importButtonTitle: {
		color: omTheme.primaryText,
	},
	importButtonMeta: {
		marginTop: omSpacing.s,
		color: omColors.grayscale500,
	},
	modalBackdrop: {
		flex: 1,
		backgroundColor: 'rgba(23,22,29,0.72)',
		padding: omSpacing.xl,
		justifyContent: 'center',
	},
	modalRoot: {
		flex: 1,
	},
	modalCard: {
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.1)',
		padding: omSpacing.xl,
	},
	modalTitle: {
		color: omTheme.primaryText,
	},
	modalBody: {
		marginTop: omSpacing.m,
		color: omColors.grayscale400,
	},
	nameInput: {
		marginTop: omSpacing.xl,
		paddingHorizontal: omSpacing.l,
		paddingVertical: omSpacing.m,
		borderRadius: omRadius.m,
		backgroundColor: omColors.grayscale850,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.1)',
		color: omTheme.primaryText,
		fontSize: 16,
		lineHeight: 24,
	},
	modalActions: {
		marginTop: omSpacing.xl,
		flexDirection: 'row',
		justifyContent: 'flex-end',
		gap: omSpacing.s,
	},
	secondaryAction: {
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.full,
		backgroundColor: 'rgba(255,255,255,0.08)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.12)',
	},
	secondaryActionText: {
		color: omColors.grayscale300,
	},
	primaryAction: {
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.full,
		backgroundColor: omTheme.accent,
	},
	primaryActionText: {
		color: omTheme.primaryText,
	},
})
