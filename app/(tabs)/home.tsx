import { OMButton } from '@/components/ui/OMButton'
import { HOME_IMPORTED_DOCUMENT_KEY, type HomeImportedDocument } from '@/lib/home-import'
import { OMText } from '@/components/ui/OMText'
import { Storage } from '@/lib/storage'
import { testCatalog } from '@/lib/test-catalog'
import { omRadius, omSpacing, omTheme } from '@/styles/brand'
import * as DocumentPicker from 'expo-document-picker'
import { Link } from 'expo-router'
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
	const [pickedFile, setPickedFile] = useState<HomeImportedDocument | null>(null)
	const [isImporting, setIsImporting] = useState(false)
	const [sourceUrl, setSourceUrl] = useState('')

	useEffect(() => {
		const loadStoredDocument = async () => {
			const storedValue = Storage.getItemSync(HOME_IMPORTED_DOCUMENT_KEY)
			if (!storedValue) {
				return
			}

			try {
				const storedDocument = JSON.parse(storedValue) as HomeImportedDocument
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
				const storedDocument: HomeImportedDocument = {
					importedAt: new Date().toISOString(),
					mimeType: asset.mimeType ?? null,
					name: asset.name,
					size: asset.size ?? null,
					uri: asset.uri,
					contents: asset.file ? await asset.file.text() : null,
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

			const storedDocument: HomeImportedDocument = {
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
						Run the Bioscript tests already in BioVault.
					</OMText>
					<OMText variant="body" style={styles.body}>
						Import your own data, use a URL later, or open one of the tests that already exists in
						the repo. Your file stays on your device and is not uploaded to our servers.
					</OMText>
				</View>

				<View style={styles.panel}>
					<OMText variant="headline" style={styles.panelTitle}>
						Import your data
					</OMText>
					<OMText variant="body" style={styles.panelBody}>
						Choose a genomic file from your device to start with your own data.
					</OMText>

					<View style={styles.actions}>
						<OMButton
							label={isImporting ? 'Importing...' : 'Choose file'}
							onPress={() => {
								void handlePickDocument()
							}}
							disabled={isImporting}
							style={styles.primaryButton}
						/>
					</View>
				</View>

				<View style={styles.panel}>
					<OMText variant="headline" style={styles.panelTitle}>
						Import from a URL
					</OMText>
					<OMText variant="body" style={styles.panelBody}>
						Paste a direct file URL for open datasets or shared downloads. This flow will stay
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

				<View style={styles.panel}>
					<OMText variant="headline" style={styles.panelTitle}>
						Available tests
					</OMText>
					<OMText variant="body" style={styles.panelBody}>
						These are the tests currently available in the Bioscript repo surface. Some are fully
						runnable now, and some are still preview-only until their older classifier shape is
						ported.
					</OMText>

					<View style={styles.cardStack}>
						{testCatalog.map((category) => (
							<Link
								key={category.slug}
								href={{ pathname: '/tests/[slug]', params: { slug: category.slug } }}
								asChild
							>
								<Pressable style={styles.categoryCard}>
									<OMText variant="caption" style={styles.categoryTag}>
										{category.category.toUpperCase()}
									</OMText>
									<OMText variant="headline" style={styles.categoryTitle}>
										{category.title}
									</OMText>
									<OMText variant="body" style={styles.categoryDescription}>
										{category.subtitle}
									</OMText>
									<OMText variant="subtitle" style={styles.categoryLink}>
										View test details
									</OMText>
								</Pressable>
							</Link>
						))}
					</View>
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
		backgroundColor: 'rgba(252,252,253,0.78)',
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
	cardStack: {
		marginTop: omSpacing.l,
		gap: omSpacing.m,
	},
	categoryCard: {
		padding: omSpacing.l,
		borderRadius: omRadius.l,
		backgroundColor: omTheme.background,
		borderWidth: 1,
		borderColor: 'rgba(39,37,50,0.08)',
	},
	categoryTag: {
		alignSelf: 'flex-start',
		paddingHorizontal: omSpacing.s,
		paddingVertical: omSpacing.xs,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(60,159,139,0.12)',
		color: omTheme.accentDeep,
		letterSpacing: 0.8,
	},
	categoryTitle: {
		marginTop: omSpacing.m,
		color: omTheme.textHeadline,
	},
	categoryDescription: {
		marginTop: omSpacing.s,
		color: omTheme.textBody,
	},
	categoryLink: {
		marginTop: omSpacing.l,
		color: omTheme.accentDeep,
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
