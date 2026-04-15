import { OMText } from '@/components/ui/OMText'
import {
	getDisplayNameBase,
	loadHomeImportStateSync,
	saveHomeImportState,
	type HomeImportedDocument,
} from '@/lib/home-import'
import { omColors, omRadius, omSpacing, omTheme } from '@/styles/brand'
import {
	FilePicker,
	fileRefName,
	fileRefSize,
	type FileRef,
	type Inspection,
	type PickResult,
} from '@/widgets/FilePicker'
import { putHandles } from '@/lib/file-handle-store'
import { router } from 'expo-router'
import { Directory, File, Paths } from 'expo-file-system'
import * as Linking from 'expo-linking'
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

function sanitizeFileName(name: string): string {
	return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function createImportedDocumentId() {
	return `home-import-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function closeSheet() {
	if (router.canGoBack()) {
		router.back()
	} else {
		router.replace('/')
	}
}

async function refToFileOrNull(ref: FileRef): Promise<File | null> {
	if (Platform.OS !== 'web') return null
	if (ref.kind === 'blob') return ref.file as unknown as File
	if (ref.kind === 'handle') return (await ref.handle.getFile()) as unknown as File
	return null
}

// Files bigger than this (e.g. CRAM alignments) are never read into memory as a
// string — we persist metadata only and reopen the handle lazily when needed.
const INLINE_CONTENTS_LIMIT = 8 * 1024 * 1024
const BINARY_EXTENSIONS = ['.cram', '.bam', '.fa', '.fasta']

function isBinaryName(name: string): boolean {
	const lower = name.toLowerCase()
	return BINARY_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

async function persistPickResult(result: PickResult, inspection?: Inspection): Promise<void> {
	const { primary, reference } = result
	const originalName = fileRefName(primary)
	const displayName = getDisplayNameBase(originalName) || originalName
	const size = fileRefSize(primary) ?? null
	const state = loadHomeImportStateSync()
	const importedDocuments = [...state.importedDocuments]

	const inspectionRecord = inspection
		? {
			inspection,
			...(reference
				? {
					reference: {
						name: fileRefName(reference),
						size: fileRefSize(reference) ?? null,
						matches: inspection.referenceMatches,
					},
				}
				: null),
		}
		: null
	const inspectionJson = inspectionRecord ? JSON.stringify(inspectionRecord) : null

	let newDocumentId: string | null = null
	if (Platform.OS === 'web') {
		const file = await refToFileOrNull(primary)
		const canInline =
			!!file &&
			!isBinaryName(originalName) &&
			(size == null || size <= INLINE_CONTENTS_LIMIT)
		const contents = canInline && file ? await file.text() : null
		newDocumentId = createImportedDocumentId()
		importedDocuments.push({
			id: newDocumentId,
			importedAt: new Date().toISOString(),
			mimeType: file?.type ?? null,
			name: displayName,
			originalName,
			size,
			uri: primary.kind === 'url' ? primary.url : '',
			contents,
			inspectionJson,
		} as HomeImportedDocument)
	} else if (primary.kind === 'path') {
		const importsDirectory = new Directory(Paths.cache, 'home-imports')
		if (!importsDirectory.exists) {
			importsDirectory.create({ idempotent: true, intermediates: true })
		}
		const target = new File(importsDirectory, `${Date.now()}-${sanitizeFileName(originalName)}`)
		// Native backend isn't wired up yet (Slice 2); no-op for now.
		importedDocuments.push({
			id: createImportedDocumentId(),
			importedAt: new Date().toISOString(),
			mimeType: null,
			name: displayName,
			originalName,
			size,
			uri: target.uri,
			inspectionJson,
		} as HomeImportedDocument)
	}

	saveHomeImportState({
		activeImportedDocumentId: importedDocuments[importedDocuments.length - 1]?.id ?? null,
		dataSource: null,
		importedDocuments,
	})

	// Persist live FileSystemFileHandle(s) keyed by the doc id so a later reload
	// can re-open the real file from disk — no byte copy kept in the browser.
	if (Platform.OS === 'web' && newDocumentId) {
		const primaryHandle = primary.kind === 'handle' ? primary.handle : undefined
		const referenceHandle = reference && reference.kind === 'handle' ? reference.handle : undefined
		if (primaryHandle || referenceHandle) {
			await putHandles(newDocumentId, {
				primary: primaryHandle,
				reference: referenceHandle,
			})
		}
	}
}

// ts-prune-ignore-next
export default function DataSourceScreen() {
	const handleConfirm = async (result: PickResult, inspection?: Inspection) => {
		try {
			await persistPickResult(result, inspection)
			closeSheet()
		} catch (error) {
			console.error('Failed to save imported file:', error)
			Alert.alert('Import error', 'Unable to save the imported file.')
		}
	}

	return (
		<SafeAreaView style={styles.safeArea}>
			<ScrollView contentContainerStyle={styles.content}>
				<View style={styles.topBar}>
					<Pressable onPress={() => closeSheet()} style={styles.closeButton}>
						<OMText variant="subtitle" style={styles.closeButtonText}>
							Close
						</OMText>
					</Pressable>
				</View>

				<View style={styles.header}>
					<OMText variant="h4" style={styles.title}>
						Add files
					</OMText>
					<OMText variant="body" style={styles.body}>
						Drop a genomic file anywhere on this page, or pick one below. We inspect it first — you&apos;ll see what we detected before saving.
					</OMText>
				</View>

				<FilePicker onConfirm={(result, inspection) => void handleConfirm(result, inspection)} />

				<Pressable
					onPress={() => void Linking.openURL('https://biovault.net')}
					hitSlop={8}
					style={styles.helpLinkButton}
				>
					<OMText variant="subtitle" style={styles.helpLink}>
						Where can I get my genomic data?
					</OMText>
				</Pressable>
			</ScrollView>
		</SafeAreaView>
	)
}

const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: omColors.grayscale850 },
	content: { padding: omSpacing.xl, gap: omSpacing.xl, paddingBottom: omSpacing.xxxl },
	topBar: { alignItems: 'flex-start' },
	closeButton: {
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.full,
		backgroundColor: 'rgba(255,255,255,0.08)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.12)',
	},
	closeButtonText: { color: omColors.grayscale300 },
	header: { gap: omSpacing.s },
	title: { color: omTheme.primaryText },
	body: { color: omColors.grayscale300, maxWidth: 540 },
	helpLinkButton: { alignSelf: 'center', paddingVertical: omSpacing.xs },
	helpLink: { color: omTheme.accent, fontSize: 14, lineHeight: 20 },
})
