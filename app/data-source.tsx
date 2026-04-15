import { OMText } from '@/components/ui/OMText'
import {
	getDisplayNameBase,
	loadHomeImportStateSync,
	saveHomeImportState,
	type HomeImportedDocument,
} from '@/lib/home-import'
import { omColors, omRadius, omSpacing, omTheme } from '@/styles/brand'
import { FilePicker, fileRefName, fileRefSize, type FileRef, type PickResult } from '@/widgets/FilePicker'
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

async function refToFileOrNull(ref: FileRef): Promise<File | null> {
	if (Platform.OS !== 'web') return null
	if (ref.kind === 'blob') return ref.file as unknown as File
	if (ref.kind === 'handle') return (await ref.handle.getFile()) as unknown as File
	return null
}

async function persistPickResult(result: PickResult): Promise<void> {
	const { primary } = result
	const originalName = fileRefName(primary)
	const displayName = getDisplayNameBase(originalName) || originalName
	const size = fileRefSize(primary) ?? null
	const state = loadHomeImportStateSync()
	const importedDocuments = [...state.importedDocuments]

	if (Platform.OS === 'web') {
		const file = await refToFileOrNull(primary)
		const contents = file ? await file.text() : null
		importedDocuments.push({
			id: createImportedDocumentId(),
			importedAt: new Date().toISOString(),
			mimeType: file?.type ?? null,
			name: displayName,
			originalName,
			size,
			uri: primary.kind === 'url' ? primary.url : '',
			contents,
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
		} as HomeImportedDocument)
	}

	saveHomeImportState({
		activeImportedDocumentId: importedDocuments[importedDocuments.length - 1]?.id ?? null,
		dataSource: null,
		importedDocuments,
	})
}

// ts-prune-ignore-next
export default function DataSourceScreen() {
	const handleConfirm = async (result: PickResult) => {
		try {
			await persistPickResult(result)
			router.back()
		} catch (error) {
			console.error('Failed to save imported file:', error)
			Alert.alert('Import error', 'Unable to save the imported file.')
		}
	}

	return (
		<SafeAreaView style={styles.safeArea}>
			<ScrollView contentContainerStyle={styles.content}>
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
					<OMText variant="body" style={styles.body}>
						Drop a genomic file anywhere on this page, or pick one below. We inspect it first — you'll see what we detected before saving.
					</OMText>
				</View>

				<FilePicker onConfirm={(result) => void handleConfirm(result)} />

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
