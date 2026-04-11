import { useEffect, useState } from 'react'
import { Alert, Platform, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import { Directory, File, Paths } from 'expo-file-system'
import { copyAsync, deleteAsync, getInfoAsync, readAsStringAsync, writeAsStringAsync } from 'expo-file-system/legacy'
import { useAnalytics } from '@/hooks/useAnalytics'
import { Storage } from '@/lib/storage'
import { runFile } from '@/modules/expo-bioscript'

type StoredDocument = {
	importedAt: string
	mimeType: string | null
	name: string
	size: number | null
	uri: string
	contents?: string | null
}

type APol1Result = {
	participantId: string
	apol1Status: string
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
	'.bz2'
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
const APOL1_SCRIPT = `G1_SITE_1 = bioscript.variant(
    rsid="rs73885319",
    grch37="22:36661906-36661906",
    grch38="22:36265860-36265860",
    ref="A",
    alt="G",
    kind="snp",
)

G1_SITE_2 = bioscript.variant(
    rsid="rs60910145",
    grch37="22:36662034-36662034",
    grch38="22:36265988-36265988",
    ref="T",
    alt="G",
    kind="snp",
)

G2_SITE = bioscript.variant(
    rsid=["rs71785313", "rs1317778148", "rs143830837"],
    grch37="22:36662046-36662051",
    grch38="22:36266000-36266005",
    ref="I",
    alt="D",
    kind="deletion",
    deletion_length=6,
    motifs=["TTATAA", "ATAATT"],
)


def count_char(text, needle):
    if text is None:
        return 0
    total = 0
    for ch in text:
        if ch == needle:
            total = total + 1
    return total


def count_non_ref(text, ref):
    if text is None:
        return 0
    total = 0
    for ch in text:
        if ch != ref and ch != "-":
            total = total + 1
    return total


def classify_apol1(genotypes):
    site1 = genotypes.lookup_variant(G1_SITE_1)
    site2 = genotypes.lookup_variant(G1_SITE_2)
    g2 = genotypes.lookup_variant(G2_SITE)

    if site1 is None and site2 is None and g2 is None:
        return "G-/G-"

    d_count = count_char(g2, "D")
    site1_variants = count_non_ref(site1, "A")
    site2_variants = count_non_ref(site2, "T")

    has_g1 = site1_variants > 0 and site2_variants > 0
    if has_g1:
        g1_total = site1_variants + site2_variants
    else:
        g1_total = 0

    if d_count == 2:
        return "G2/G2"
    if d_count == 1:
        if g1_total >= 2:
            return "G2/G1"
        return "G2/G0"
    if g1_total == 4:
        return "G1/G1"
    if g1_total >= 2:
        return "G1/G0"
    return "G0/G0"


def main():
    genotypes = bioscript.load_genotypes(input_file)
    status = classify_apol1(genotypes)
    rows = [{
        "participant_id": participant_id,
        "apol1_status": status,
    }]
    bioscript.write_tsv(output_file, rows)
    print(status)


if __name__ == "__main__":
    main()
`

function sanitizeFileName(name: string): string {
	return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function hasSupportedExtension(name: string): boolean {
	const lowerName = name.toLowerCase()
	return SUPPORTED_EXTENSIONS.some((extension) => lowerName.endsWith(extension))
}

function toNativePath(uri: string): string {
	return uri.replace('file://', '')
}

function commonPathPrefix(paths: string[]): string {
	if (paths.length === 0) {
		throw new Error('No paths provided')
	}

	const splitPaths = paths.map((path) => path.split('/').filter(Boolean))
	const prefix: string[] = []

	for (let index = 0; ; index += 1) {
		const segment = splitPaths[0][index]
		if (!segment) {
			break
		}

		if (splitPaths.every((path) => path[index] === segment)) {
			prefix.push(segment)
			continue
		}

		break
	}

	return `/${prefix.join('/')}`
}

function toRelativePath(rootPath: string, fileUri: string): string {
	const nativePath = toNativePath(fileUri)
	const normalizedRoot = rootPath.endsWith('/') ? rootPath : `${rootPath}/`

	if (!nativePath.startsWith(normalizedRoot)) {
		throw new Error(`Path is outside Bioscript root: ${nativePath}`)
	}

	return nativePath.slice(normalizedRoot.length)
}

function parseApol1Result(tsv: string): APol1Result | null {
	const lines = tsv
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)

	if (lines.length < 2) {
		return null
	}

	const headers = lines[0].split('\t')
	const values = lines[1].split('\t')
	const participantIdIndex = headers.indexOf('participant_id')
	const apol1StatusIndex = headers.indexOf('apol1_status')

	if (participantIdIndex === -1 || apol1StatusIndex === -1) {
		return null
	}

	return {
		participantId: values[participantIdIndex] ?? '',
		apol1Status: values[apol1StatusIndex] ?? '',
	}
}

// ts-prune-ignore-next
export default function TestScreen() {
	const [pickedFile, setPickedFile] = useState<StoredDocument | null>(null)
	const [isImporting, setIsImporting] = useState(false)
	const [isRunning, setIsRunning] = useState(false)
	const [runOutput, setRunOutput] = useState<string | null>(null)
	const [runError, setRunError] = useState<string | null>(null)

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
				if (Platform.OS === 'web') {
					setPickedFile(storedDocument)
					return
				}
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
				if (Platform.OS !== 'web') {
					await deleteAsync(pickedFile.uri, { idempotent: true })
				}
			} catch (error) {
				console.error('Failed to delete stored document:', error)
			}
		}

		Storage.removeItemSync(STORED_DOCUMENT_KEY)
		setPickedFile(null)
		setRunOutput(null)
		setRunError(null)
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
				const webFile = asset.file
				if (!webFile) {
					throw new Error('Web document picker did not return a File object.')
				}

				const storedDocument: StoredDocument = {
					importedAt: new Date().toISOString(),
					mimeType: asset.mimeType ?? webFile.type ?? null,
					name: asset.name,
					size: asset.size ?? webFile.size ?? null,
					uri: asset.uri,
					contents: await webFile.text(),
				}

				Storage.setItemSync(STORED_DOCUMENT_KEY, JSON.stringify(storedDocument))
				setPickedFile(storedDocument)
				setRunOutput(null)
				setRunError(null)
				return
			}

			const importsDirectory = new Directory(Paths.cache, 'imports')
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
			setRunOutput(null)
			setRunError(null)
		} catch (error) {
			console.error('Failed to pick document:', error)
			Alert.alert('Document Picker Error', 'Unable to open the document picker right now.')
		} finally {
			setIsImporting(false)
		}
	}

	const handleRunBioscript = async () => {
		if (!pickedFile) {
			return
		}

		if (Platform.OS === 'web') {
			if (!pickedFile.contents) {
				setRunError('No web file contents are available for this document.')
				return
			}

			try {
				setIsRunning(true)
				setRunError(null)
				setRunOutput(null)

				const result = await runFile({
					scriptPath: 'apol1.py',
					scriptContents: APOL1_SCRIPT,
					inputFile: pickedFile.name,
					inputContents: pickedFile.contents,
					outputFile: 'apol1-output.tsv',
					participantId: sanitizeFileName(pickedFile.name),
					inputFormat: 'text',
					maxDurationMs: 60_000,
					maxMemoryBytes: 128 * 1024 * 1024,
					maxAllocations: 1_000_000,
					maxRecursionDepth: 512,
				})

				setRunOutput(result.outputText ?? result.outputFiles?.['apol1-output.tsv'] ?? null)
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Bioscript run failed.'
				console.error('Failed to run bioscript:', error)
				setRunError(message)
			} finally {
				setIsRunning(false)
			}

			return
		}

		const bioscriptRoot = commonPathPrefix([
			toNativePath(Paths.document.uri),
			toNativePath(Paths.cache.uri),
		])
		const bioscriptDirectory = new Directory(Paths.document, 'bioscript-test')
		if (!bioscriptDirectory.exists) {
			bioscriptDirectory.create({ idempotent: true, intermediates: true })
		}
		const cacheDirectory = new Directory(bioscriptDirectory, '.bioscript-cache')
		if (!cacheDirectory.exists) {
			cacheDirectory.create({ idempotent: true, intermediates: true })
		}

		const scriptFile = new File(bioscriptDirectory, 'apol1.py')
		const outputFile = new File(bioscriptDirectory, 'apol1-output.tsv')

		try {
			setIsRunning(true)
			setRunError(null)
			setRunOutput(null)

			await writeAsStringAsync(scriptFile.uri, APOL1_SCRIPT)
			await deleteAsync(outputFile.uri, { idempotent: true })

			await runFile({
				scriptPath: toNativePath(scriptFile.uri),
				root: bioscriptRoot,
				inputFile: toRelativePath(bioscriptRoot, pickedFile.uri),
				outputFile: toRelativePath(bioscriptRoot, outputFile.uri),
				participantId: sanitizeFileName(pickedFile.name),
				autoIndex: true,
				cacheDir: toRelativePath(bioscriptRoot, cacheDirectory.uri),
				maxDurationMs: 60_000,
				maxMemoryBytes: 128 * 1024 * 1024,
				maxAllocations: 1_000_000,
				maxRecursionDepth: 512,
			})

			const output = await readAsStringAsync(outputFile.uri)
			setRunOutput(output)
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Bioscript run failed.'
			console.error('Failed to run bioscript:', error)
			setRunError(message)
		} finally {
			setIsRunning(false)
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

	const parsedApol1Result = runOutput ? parseApol1Result(runOutput) : null

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
						<Pressable
							style={[styles.runButton, isRunning ? styles.runButtonDisabled : null]}
							disabled={isRunning}
							onPress={() => {
								void handleRunBioscript()
							}}
						>
							<Text style={styles.runButtonText}>
								{isRunning ? 'Running Bioscript...' : 'Run APOL1 Bioscript'}
							</Text>
						</Pressable>
						<Pressable style={styles.deleteButton} onPress={handleDeleteDocument}>
							<Text style={styles.deleteButtonText}>Delete imported copy</Text>
						</Pressable>
					</View>
				) : null}

				{parsedApol1Result ? (
					<View style={styles.outputCard}>
						<Text style={styles.resultLabel}>APOL1 result</Text>
						<Text style={styles.resultValue}>{parsedApol1Result.apol1Status}</Text>
						<Text style={styles.resultMeta}>
							Participant: {parsedApol1Result.participantId || 'Unknown'}
						</Text>
					</View>
				) : null}

				{runOutput ? (
					<View style={styles.outputCard}>
						<Text style={styles.resultLabel}>Raw output</Text>
						<Text style={styles.outputText}>{runOutput}</Text>
					</View>
				) : null}

				{runError ? (
					<View style={styles.errorCard}>
						<Text style={styles.resultLabel}>Bioscript error</Text>
						<Text style={styles.errorText}>{runError}</Text>
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
	runButton: {
		marginTop: 18,
		alignSelf: 'flex-start',
		borderRadius: 10,
		paddingHorizontal: 14,
		paddingVertical: 10,
		backgroundColor: '#dcfce7',
	},
	runButtonDisabled: {
		opacity: 0.7,
	},
	runButtonText: {
		color: '#166534',
		fontSize: 14,
		fontWeight: '700',
	},
	outputCard: {
		marginTop: 18,
		padding: 18,
		borderRadius: 16,
		backgroundColor: '#ffffff',
		borderWidth: 1,
		borderColor: '#dbeafe',
	},
	outputText: {
		fontSize: 14,
		lineHeight: 20,
		color: '#0f172a',
	},
	errorCard: {
		marginTop: 18,
		padding: 18,
		borderRadius: 16,
		backgroundColor: '#fff1f2',
		borderWidth: 1,
		borderColor: '#fecdd3',
	},
	errorText: {
		fontSize: 14,
		lineHeight: 20,
		color: '#9f1239',
	},
})
