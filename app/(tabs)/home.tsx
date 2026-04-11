import { OMButton } from '@/components/ui/OMButton'
import { OMText } from '@/components/ui/OMText'
import { Storage } from '@/lib/storage'
import { omRadius, omSpacing, omTheme } from '@/styles/brand'
import * as DocumentPicker from 'expo-document-picker'
import { Directory, File, Paths } from 'expo-file-system'
import { copyAsync, deleteAsync, getInfoAsync } from 'expo-file-system/legacy'
import { useEffect, useState } from 'react'
import {
	Alert,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	TextInput,
	View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

type ImportedDocument = {
	importedAt: string
	mimeType: string | null
	name: string
	size: number | null
	uri: string
}

const HOME_IMPORTED_DOCUMENT_KEY = 'home_imported_document'
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

function sanitizeFileName(name: string): string {
	return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function hasSupportedExtension(name: string): boolean {
	const lowerName = name.toLowerCase()
	return SUPPORTED_EXTENSIONS.some((extension) => lowerName.endsWith(extension))
}

// ts-prune-ignore-next
export default function HomeScreen() {
	const [pickedFile, setPickedFile] = useState<ImportedDocument | null>(null)
	const [isImporting, setIsImporting] = useState(false)
	const [isPreparingSample, setIsPreparingSample] = useState(false)
	const [sourceUrl, setSourceUrl] = useState('')

	useEffect(() => {
		const loadStoredDocument = async () => {
			const storedValue = Storage.getItemSync(HOME_IMPORTED_DOCUMENT_KEY)
			if (!storedValue) {
				return
			}

			try {
				const storedDocument = JSON.parse(storedValue) as ImportedDocument
				if (Platform.OS === 'web') {
					setPickedFile(storedDocument)
					return
				}

				const info = await getInfoAsync(storedDocument.uri)
				if (!info.exists) {
					Storage.removeItemSync(HOME_IMPORTED_DOCUMENT_KEY)
					return
				}

				setPickedFile(storedDocument)
			} catch (error) {
				console.error('Failed to load imported document:', error)
				Storage.removeItemSync(HOME_IMPORTED_DOCUMENT_KEY)
			}
		}

		void loadStoredDocument()
	}, [])

	const removeStoredDocument = async () => {
		if (pickedFile && Platform.OS !== 'web') {
			try {
				await deleteAsync(pickedFile.uri, { idempotent: true })
			} catch (error) {
				console.error('Failed to delete stored document:', error)
			}
		}

		Storage.removeItemSync(HOME_IMPORTED_DOCUMENT_KEY)
		setPickedFile(null)
	}

	const handlePickDocument = async () => {
		try {
			setIsImporting(true)

			const result = await DocumentPicker.getDocumentAsync({
				copyToCacheDirectory: false,
				type: PICKER_MIME_TYPES,
			})

			if (result.canceled) {
				return
			}

			const asset = result.assets[0]
			if (!asset) {
				return
			}

			if (!hasSupportedExtension(asset.name)) {
				Alert.alert(
					'Unsupported file',
					'Choose a VCF, TXT, TSV, CSV, ZIP, GZ, or BZ2 genomic data file.'
				)
				return
			}

			if (Platform.OS === 'web') {
				const storedDocument: ImportedDocument = {
					importedAt: new Date().toISOString(),
					mimeType: asset.mimeType ?? null,
					name: asset.name,
					size: asset.size ?? null,
					uri: asset.uri,
				}

				Storage.setItemSync(HOME_IMPORTED_DOCUMENT_KEY, JSON.stringify(storedDocument))
				setPickedFile(storedDocument)
				return
			}

			const importsDirectory = new Directory(Paths.cache, 'home-imports')
			if (!importsDirectory.exists) {
				importsDirectory.create({ idempotent: true, intermediates: true })
			}

			const timestamp = Date.now()
			const targetFile = new File(importsDirectory, `${timestamp}-${sanitizeFileName(asset.name)}`)

			await copyAsync({
				from: asset.uri,
				to: targetFile.uri,
			})

			if (pickedFile) {
				try {
					await deleteAsync(pickedFile.uri, { idempotent: true })
				} catch (error) {
					console.error('Failed to delete previous stored document:', error)
				}
			}

			const storedDocument: ImportedDocument = {
				importedAt: new Date().toISOString(),
				mimeType: asset.mimeType ?? null,
				name: asset.name,
				size: asset.size ?? null,
				uri: targetFile.uri,
			}

			Storage.setItemSync(HOME_IMPORTED_DOCUMENT_KEY, JSON.stringify(storedDocument))
			setPickedFile(storedDocument)
		} catch (error) {
			console.error('Failed to pick document:', error)
			Alert.alert('Import error', 'Unable to open the document picker right now.')
		} finally {
			setIsImporting(false)
		}
	}

	const handleTrySample = async () => {
		try {
			setIsPreparingSample(true)
			Alert.alert(
				'Test files coming next',
				'This entry point is in place now. Next step is wiring bundled sample files so people can explore the app before importing their own data.'
			)
		} finally {
			setIsPreparingSample(false)
		}
	}

	const handleUrlImport = () => {
		if (!sourceUrl.trim()) {
			Alert.alert('Enter a URL', 'Paste a direct file URL to prepare this flow.')
			return
		}

		Alert.alert(
			'URL import coming next',
			'This will become a direct-to-device import flow. BioVault will not upload your file to our servers.'
		)
	}

	return (
		<SafeAreaView style={styles.safeArea}>
			<ScrollView
				style={styles.screen}
				contentContainerStyle={styles.content}
				showsVerticalScrollIndicator={false}
			>
				<View style={styles.hero}>
					<OMText variant="caption" style={styles.eyebrow}>
						HOME
					</OMText>
					<OMText variant="h3" style={styles.title}>
						Bring your genomic data into BioVault.
					</OMText>
					<OMText variant="body" style={styles.body}>
						Import your own file, try a sample file, or prepare a direct URL flow. Your data stays
						on your device and is not uploaded to our servers.
					</OMText>
				</View>

				<View style={styles.panel}>
					<OMText variant="headline" style={styles.panelTitle}>
						Start here
					</OMText>
					<OMText variant="body" style={styles.panelBody}>
						Use your own genomic file or try a test path to get a feel for the redesigned app.
					</OMText>

					<View style={styles.actions}>
						<OMButton
							label={isImporting ? 'Importing...' : 'Import your data'}
							onPress={() => {
								void handlePickDocument()
							}}
							disabled={isImporting}
							style={styles.primaryButton}
						/>
						<OMButton
							label={isPreparingSample ? 'Preparing...' : 'Try a test file'}
							variant="secondary"
							onPress={() => {
								void handleTrySample()
							}}
							disabled={isPreparingSample}
							style={styles.secondaryButton}
						/>
					</View>
				</View>

				<View style={styles.panel}>
					<OMText variant="headline" style={styles.panelTitle}>
						Import from a URL
					</OMText>
					<OMText variant="body" style={styles.panelBody}>
						Paste a direct file URL for open test datasets or shared downloads. This flow will stay
						local-first too.
					</OMText>
					<TextInput
						value={sourceUrl}
						onChangeText={setSourceUrl}
						placeholder="https://example.org/sample.vcf.gz"
						placeholderTextColor={omTheme.textMuted}
						autoCapitalize="none"
						autoCorrect={false}
						style={styles.urlInput}
					/>
					<OMButton
						label="Use URL"
						variant="secondary"
						onPress={handleUrlImport}
						style={styles.urlButton}
					/>
				</View>

				{pickedFile ? (
					<View style={styles.panel}>
						<OMText variant="headline" style={styles.panelTitle}>
							Imported file
						</OMText>
						<OMText variant="body" style={styles.fileName}>
							{pickedFile.name}
						</OMText>
						<OMText variant="caption" style={styles.fileMeta}>
							Imported {new Date(pickedFile.importedAt).toLocaleString()}
						</OMText>
						<OMText variant="caption" style={styles.fileMeta}>
							{pickedFile.size ?? 'Unknown'} bytes
						</OMText>
						<OMText variant="caption" style={styles.fileMeta}>
							{pickedFile.mimeType ?? 'Unknown type'}
						</OMText>

						<Pressable onPress={() => void removeStoredDocument()} style={styles.removeButton}>
							<OMText variant="subtitle" style={styles.removeButtonText}>
								Remove imported copy
							</OMText>
						</Pressable>
					</View>
				) : null}
			</ScrollView>
		</SafeAreaView>
	)
}

const styles = StyleSheet.create({
	safeArea: {
		flex: 1,
		backgroundColor: omTheme.background,
	},
	screen: {
		flex: 1,
		backgroundColor: omTheme.background,
	},
	content: {
		padding: omSpacing.xl,
		paddingBottom: omSpacing.xxxl,
		gap: omSpacing.l,
	},
	hero: {
		gap: omSpacing.m,
		paddingTop: omSpacing.m,
	},
	eyebrow: {
		alignSelf: 'flex-start',
		paddingHorizontal: omSpacing.s,
		paddingVertical: omSpacing.xs,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(252,252,253,0.5)',
		color: omTheme.textMuted,
		letterSpacing: 1,
	},
	title: {
		color: omTheme.textHeadline,
		maxWidth: 320,
	},
	body: {
		color: omTheme.textBody,
		maxWidth: 340,
		fontSize: 17,
		lineHeight: 24,
	},
	panel: {
		padding: omSpacing.xl,
		borderRadius: omRadius.l,
		backgroundColor: 'rgba(252,252,253,0.76)',
		borderWidth: 1,
		borderColor: 'rgba(39,37,50,0.06)',
	},
	panelTitle: {
		color: omTheme.textHeadline,
	},
	panelBody: {
		marginTop: omSpacing.s,
		color: omTheme.textBody,
	},
	actions: {
		marginTop: omSpacing.l,
		gap: omSpacing.m,
	},
	primaryButton: {
		minHeight: 54,
		borderRadius: omRadius.l,
	},
	secondaryButton: {
		minHeight: 54,
		borderRadius: omRadius.l,
	},
	urlInput: {
		marginTop: omSpacing.l,
		paddingHorizontal: omSpacing.l,
		paddingVertical: omSpacing.m,
		borderRadius: omRadius.l,
		backgroundColor: omTheme.background,
		borderWidth: 1,
		borderColor: 'rgba(39,37,50,0.08)',
		color: omTheme.textHeadline,
		fontSize: 16,
		lineHeight: 22,
	},
	urlButton: {
		marginTop: omSpacing.m,
		minHeight: 50,
		borderRadius: omRadius.l,
	},
	fileName: {
		marginTop: omSpacing.s,
		color: omTheme.textHeadline,
		fontSize: 18,
		lineHeight: 24,
	},
	fileMeta: {
		marginTop: omSpacing.xs,
		color: omTheme.textMuted,
		fontSize: 13,
		lineHeight: 18,
	},
	removeButton: {
		marginTop: omSpacing.l,
		alignSelf: 'flex-start',
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.m,
		backgroundColor: omTheme.dangerSurface,
		borderWidth: 1,
		borderColor: omTheme.dangerBorder,
	},
	removeButtonText: {
		color: omTheme.dangerText,
	},
})
