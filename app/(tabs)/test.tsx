import { useEffect, useState } from 'react'
import { Alert, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import { Directory, File, Paths } from 'expo-file-system'
import { copyAsync, deleteAsync, getInfoAsync } from 'expo-file-system/legacy'
import { useAnalytics } from '@/hooks/useAnalytics'
import { Storage } from '@/lib/storage'

type StoredDocument = {
	importedAt: string
	mimeType: string | null
	name: string
	size: number | null
	uri: string
}

const STORED_DOCUMENT_KEY = 'test_imported_document'
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
	'text/tab-separated-values',
	'text/csv',
	'application/zip',
	'application/gzip',
	'application/x-gzip',
	'application/x-bzip2',
	'application/octet-stream',
]

function sanitizeFileName(name: string): string {
	return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function hasSupportedExtension(name: string): boolean {
	const lowerName = name.toLowerCase()
	return SUPPORTED_EXTENSIONS.some((extension) => lowerName.endsWith(extension))
}

// ts-prune-ignore-next
export default function TestScreen() {
	const [pickedFile, setPickedFile] = useState<StoredDocument | null>(null)
	const [isImporting, setIsImporting] = useState(false)

	useAnalytics({
		trackScreenView: true,
		screenProperties: { screen: 'Test' },
	})

	useEffect(() => {
		const loadStoredDocument = async () => {
			const storedValue = Storage.getItemSync(STORED_DOCUMENT_KEY)
			if (!storedValue) {
				return
			}

			try {
				const storedDocument = JSON.parse(storedValue) as StoredDocument
				const info = await getInfoAsync(storedDocument.uri)

				if (!info.exists) {
					Storage.removeItemSync(STORED_DOCUMENT_KEY)
					return
				}

				setPickedFile(storedDocument)
			} catch (error) {
				console.error('Failed to load stored document:', error)
				Storage.removeItemSync(STORED_DOCUMENT_KEY)
			}
		}

		void loadStoredDocument()
	}, [])

	const removeStoredDocument = async () => {
		if (pickedFile) {
			try {
				await deleteAsync(pickedFile.uri, { idempotent: true })
			} catch (error) {
				console.error('Failed to delete stored document:', error)
			}
		}

		Storage.removeItemSync(STORED_DOCUMENT_KEY)
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

			const importsDirectory = new Directory(Paths.document, 'imports')
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

			const storedDocument: StoredDocument = {
				importedAt: new Date().toISOString(),
				mimeType: asset.mimeType ?? null,
				name: asset.name,
				size: asset.size ?? null,
				uri: targetFile.uri,
			}

			Storage.setItemSync(STORED_DOCUMENT_KEY, JSON.stringify(storedDocument))
			setPickedFile(storedDocument)
		} catch (error) {
			console.error('Failed to pick document:', error)
			Alert.alert('Document Picker Error', 'Unable to open the document picker right now.')
		} finally {
			setIsImporting(false)
		}
	}

	const handleDeleteDocument = () => {
		Alert.alert('Delete Imported File', 'Remove the imported copy from app storage?', [
			{
				style: 'cancel',
				text: 'Cancel',
			},
			{
				style: 'destructive',
				text: 'Delete',
				onPress: () => {
					void removeStoredDocument()
				},
			},
		])
	}

	return (
		<SafeAreaView style={styles.container}>
			<View style={styles.content}>
				<Text style={styles.title}>Test</Text>
				<Pressable style={styles.button} onPress={handlePickDocument}>
					<Text style={styles.buttonText}>{isImporting ? 'Importing...' : 'Pick document'}</Text>
				</Pressable>

				{pickedFile ? (
					<View style={styles.resultCard}>
						<Text style={styles.resultLabel}>Imported file</Text>
						<Text style={styles.resultValue}>{pickedFile.name}</Text>
						<Text style={styles.resultMeta}>URI: {pickedFile.uri}</Text>
						<Text style={styles.resultMeta}>Size: {pickedFile.size ?? 'Unknown'} bytes</Text>
						<Text style={styles.resultMeta}>Type: {pickedFile.mimeType ?? 'Unknown'}</Text>
						<Text style={styles.resultMeta}>Imported: {pickedFile.importedAt}</Text>
						<Pressable style={styles.deleteButton} onPress={handleDeleteDocument}>
							<Text style={styles.deleteButtonText}>Delete imported copy</Text>
						</Pressable>
					</View>
				) : null}
			</View>
		</SafeAreaView>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#f6fbf7',
	},
	content: {
		flex: 1,
		paddingHorizontal: 24,
		paddingTop: 32,
	},
	title: {
		fontSize: 32,
		fontWeight: '800',
		color: '#0f172a',
		marginBottom: 24,
	},
	button: {
		backgroundColor: '#059669',
		borderRadius: 14,
		paddingHorizontal: 18,
		paddingVertical: 16,
		alignItems: 'center',
	},
	buttonText: {
		fontSize: 16,
		fontWeight: '700',
		color: '#ffffff',
	},
	resultCard: {
		marginTop: 24,
		padding: 18,
		borderRadius: 16,
		backgroundColor: '#ffffff',
		borderWidth: 1,
		borderColor: '#d1fae5',
	},
	resultLabel: {
		fontSize: 12,
		fontWeight: '700',
		letterSpacing: 1,
		textTransform: 'uppercase',
		color: '#065f46',
		marginBottom: 8,
	},
	resultValue: {
		fontSize: 18,
		fontWeight: '700',
		color: '#111827',
		marginBottom: 10,
	},
	resultMeta: {
		fontSize: 14,
		color: '#475569',
		marginTop: 4,
	},
	deleteButton: {
		marginTop: 18,
		alignSelf: 'flex-start',
		borderRadius: 10,
		paddingHorizontal: 14,
		paddingVertical: 10,
		backgroundColor: '#fee2e2',
	},
	deleteButtonText: {
		color: '#b91c1c',
		fontSize: 14,
		fontWeight: '700',
	},
})
