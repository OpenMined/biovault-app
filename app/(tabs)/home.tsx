import { OMText } from '@/components/ui/OMText'
import { loadHomeImportState, type HomeImportState, type HomeImportedDocument } from '@/lib/home-import'
import { omColors, omRadius, omSpacing, omTheme } from '@/styles/brand'
import { Link, router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

function getFileExtension(name: string) {
	const lowerName = name.toLowerCase()

	if (lowerName.endsWith('.vcf.gz')) {
		return 'VCF.GZ'
	}
	if (lowerName.endsWith('.vcf.bz2')) {
		return 'VCF.BZ2'
	}
	if (lowerName.endsWith('.tsv.bz2')) {
		return 'TSV.BZ2'
	}

	const parts = name.split('.')
	return parts.length > 1 ? parts.at(-1)?.toUpperCase() ?? 'Unknown' : 'Unknown'
}

function formatFileSize(size: number | null) {
	if (!size || size <= 0) {
		return 'Unknown'
	}

	const gb = size / 1_000_000_000
	if (gb >= 1) {
		return `${gb.toFixed(gb >= 10 ? 1 : 2)} GB`
	}

	const mb = size / 1_000_000
	return `${mb.toFixed(mb >= 10 ? 1 : 2)} MB`
}

function ImportedFileRow({ document }: { document: HomeImportedDocument }) {
	return (
		<Link href={{ pathname: '/files/[documentId]', params: { documentId: document.id } }} asChild>
			<Pressable style={({ pressed }) => [styles.fileRow, pressed ? styles.fileRowPressed : null]}>
				<View style={styles.fileRowContent}>
					<OMText variant="headline" style={styles.fileName}>
						{document.name}
					</OMText>
					<OMText variant="caption" style={styles.fileMeta}>
						{getFileExtension(document.originalName)} • {formatFileSize(document.size)}
					</OMText>
				</View>
				<View style={styles.fileRowTrailing}>
					<OMText variant="subtitle" style={styles.fileRowAction}>
						Open
					</OMText>
				</View>
			</Pressable>
		</Link>
	)
}

// ts-prune-ignore-next
export default function HomeScreen() {
	const [importedDocuments, setImportedDocuments] = useState<HomeImportedDocument[]>([])

	const applyState = useCallback((state: HomeImportState) => {
		setImportedDocuments(state.importedDocuments)
	}, [])

	const loadStoredData = useCallback(async () => {
		const state = await loadHomeImportState()
		applyState(state)
	}, [applyState])

	useEffect(() => {
		void loadStoredData()
	}, [loadStoredData])

	useFocusEffect(
		useCallback(() => {
			void loadStoredData()
		}, [loadStoredData])
	)

	const hasImportedDocuments = importedDocuments.length > 0

	return (
		<SafeAreaView style={styles.safeArea} edges={['top']}>
			{!hasImportedDocuments ? (
				<View style={styles.emptyState}>
					<View style={styles.emptyStatePanel}>
						<OMText variant="h4" style={styles.emptyStateTitle}>
							No genomic files yet
						</OMText>
						<OMText variant="body" style={styles.emptyStateBody}>
							Import files from your device to start running BioVault tests locally.
						</OMText>
						<OMText variant="caption" style={styles.emptyStateNote}>
							Your files stay on your device and are never uploaded to our servers.
						</OMText>
						<Pressable
							onPress={() => router.push('/data-source')}
							style={({ pressed }) => [styles.emptyStateCta, pressed ? styles.emptyStateCtaPressed : null]}
						>
							<OMText variant="subtitle" style={styles.emptyStateCtaText}>
								Add Files
							</OMText>
						</Pressable>
					</View>
				</View>
			) : (
				<ScrollView
					style={styles.screen}
					contentContainerStyle={styles.content}
					showsVerticalScrollIndicator={false}
				>
					<View style={styles.hero}>
						<OMText variant="caption" style={styles.eyebrow}>
							DATA
						</OMText>
						<OMText variant="h3" style={styles.pageTitle}>
							Your genomic files.
						</OMText>
						<OMText variant="body" style={styles.pageBody}>
							Open any file to rename it, review its tests, or remove it from this device.
						</OMText>
					</View>

					<View style={styles.headerRow}>
						<OMText variant="headline" style={styles.sectionTitle}>
							Saved files
						</OMText>
						<Pressable onPress={() => router.push('/data-source')} style={styles.addButton}>
							<OMText variant="subtitle" style={styles.addButtonText}>
								Add Files
							</OMText>
						</Pressable>
					</View>

					<View style={styles.listSurface}>
						{importedDocuments.map((document, index) => (
							<View key={document.id} style={index > 0 ? styles.rowDivider : undefined}>
								<ImportedFileRow document={document} />
							</View>
						))}
					</View>
				</ScrollView>
			)}
		</SafeAreaView>
	)
}

const styles = StyleSheet.create({
	safeArea: {
		flex: 1,
		backgroundColor: omColors.grayscale850,
	},
	screen: {
		flex: 1,
		backgroundColor: omColors.grayscale850,
	},
	content: {
		padding: omSpacing.xl,
		paddingBottom: omSpacing.xxxl,
		gap: omSpacing.xl,
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
		backgroundColor: 'rgba(255,255,255,0.08)',
		color: omColors.grayscale400,
		letterSpacing: 1,
	},
	headerRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: omSpacing.l,
	},
	pageTitle: {
		color: omTheme.primaryText,
		maxWidth: 320,
	},
	pageBody: {
		color: omColors.grayscale400,
		maxWidth: 360,
		fontSize: 17,
		lineHeight: 24,
	},
	sectionTitle: {
		color: omTheme.primaryText,
	},
	addButton: {
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.full,
		backgroundColor: 'rgba(83,190,169,0.14)',
		borderWidth: 1,
		borderColor: 'rgba(83,190,169,0.28)',
	},
	addButtonText: {
		color: omTheme.accent,
	},
	listSurface: {
		gap: omSpacing.m,
	},
	rowDivider: {
		marginTop: 0,
	},
	fileRow: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		justifyContent: 'space-between',
		gap: omSpacing.m,
		padding: omSpacing.xl,
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.1)',
		minHeight: 108,
	},
	fileRowPressed: {
		backgroundColor: 'rgba(255,255,255,0.04)',
	},
	fileRowContent: {
		flex: 1,
		gap: omSpacing.xs,
	},
	fileName: {
		color: omTheme.primaryText,
	},
	fileMeta: {
		marginTop: omSpacing.xs,
		color: omColors.grayscale500,
	},
	fileRowTrailing: {
		paddingTop: omSpacing.xs,
	},
	fileRowAction: {
		color: omTheme.accent,
	},
	emptyState: {
		flex: 1,
		justifyContent: 'center',
		paddingHorizontal: omSpacing.xl,
	},
	emptyStatePanel: {
		paddingVertical: omSpacing.xxxl,
		paddingHorizontal: omSpacing.xxl,
		borderRadius: omRadius.xl,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.1)',
		alignItems: 'center',
	},
	emptyStateTitle: {
		color: omTheme.primaryText,
		textAlign: 'center',
	},
	emptyStateBody: {
		marginTop: omSpacing.m,
		color: omColors.grayscale400,
		fontSize: 16,
		lineHeight: 24,
		textAlign: 'center',
	},
	emptyStateNote: {
		marginTop: omSpacing.l,
		color: omColors.grayscale500,
		textAlign: 'center',
	},
	emptyStateCta: {
		marginTop: omSpacing.xl,
		minHeight: 52,
		width: '100%',
		borderRadius: omRadius.l,
		backgroundColor: omTheme.accent,
		alignItems: 'center',
		justifyContent: 'center',
		paddingHorizontal: omSpacing.xl,
	},
	emptyStateCtaPressed: {
		backgroundColor: omTheme.accentDeep,
	},
	emptyStateCtaText: {
		color: omTheme.primaryText,
	},
})
