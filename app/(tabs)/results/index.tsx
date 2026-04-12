import { ActiveDocumentPickerDropdown } from '@/components/explore/ActiveDocumentPickerDropdown'
import { ExploreActiveFileBar } from '@/components/explore/ExploreActiveFileBar'
import { OMButton } from '@/components/ui/OMButton'
import { OMText } from '@/components/ui/OMText'
import {
	getActiveImportedDocument,
	loadHomeImportState,
	setActiveImportedDocumentId,
	type HomeImportedDocument,
} from '@/lib/home-import'
import { listRecentTestRuns, type RecentTestRunSummary } from '@/lib/test-results'
import { omColors, omRadius, omSpacing, omTheme } from '@/styles/brand'
import { useFocusEffect } from '@react-navigation/native'
import { Link, router } from 'expo-router'
import { useCallback, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

const RESULTS_PAGE_SIZE = 10

function formatRunTimestamp(value: string) {
	return new Date(value).toLocaleString()
}

function ResultsCard({ run }: { run: RecentTestRunSummary }) {
	return (
		<Link
			href={{
				pathname: '/tests/[slug]',
				params: {
					slug: run.slug,
					showResults: 'true',
					...(run.inputDocumentId ? { documentId: run.inputDocumentId } : { sample: 'true' }),
				},
			}}
			asChild
		>
			<Pressable style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}>
				<View style={styles.cardTopRow}>
					<OMText numberOfLines={1} variant="headline" style={styles.cardTitle}>
						{run.testTitle}
					</OMText>
					<OMText numberOfLines={1} variant="caption" style={styles.metaText}>
						{formatRunTimestamp(run.ranAt)}
					</OMText>
				</View>
				<View style={styles.cardBottomRow}>
					<OMText numberOfLines={1} variant="caption" style={styles.cardBody}>
						{run.inputLabel}
					</OMText>
					<OMText variant="subtitle" style={styles.cardAction}>
						View Result
					</OMText>
				</View>
			</Pressable>
		</Link>
	)
}

export default function ResultsScreen() {
	const [runs, setRuns] = useState<RecentTestRunSummary[]>([])
	const [importedDocuments, setImportedDocuments] = useState<HomeImportedDocument[]>([])
	const [activeDocument, setActiveDocument] = useState<HomeImportedDocument | null>(null)
	const [isPickerOpen, setIsPickerOpen] = useState(false)
	const [visibleCount, setVisibleCount] = useState(RESULTS_PAGE_SIZE)
	const insets = useSafeAreaInsets()

	const refresh = useCallback(() => {
		return Promise.all([loadHomeImportState(), listRecentTestRuns(30)])
			.then(([homeState, nextRuns]) => {
				setImportedDocuments(homeState.importedDocuments)
				setActiveDocument(getActiveImportedDocument(homeState))
				setRuns(nextRuns)
				setVisibleCount(RESULTS_PAGE_SIZE)
			})
			.catch(console.error)
	}, [])

	useFocusEffect(
		useCallback(() => {
			void refresh()
		}, [refresh])
	)

	const filteredRuns = activeDocument
		? runs.filter((run) => run.inputDocumentId === activeDocument.id)
		: runs
	const visibleRuns = filteredRuns.slice(0, visibleCount)
	const hasMoreRuns = filteredRuns.length > visibleCount

	const handleAddFile = useCallback(() => {
		setIsPickerOpen(false)
		router.push('/data-source')
	}, [])

	const handleSelectDocument = useCallback(
		(document: HomeImportedDocument) => {
			void setActiveImportedDocumentId(document.id)
				.then(async () => {
					await refresh()
					setIsPickerOpen(false)
				})
				.catch((error) => {
					console.error('Failed to update active file:', error)
				})
		},
		[refresh]
	)

	return (
		<SafeAreaView style={styles.safeArea} edges={['top']}>
			<ScrollView
				style={styles.screen}
				contentContainerStyle={[
					styles.content,
					{ paddingBottom: omSpacing.xxxl + insets.bottom + 72 },
				]}
				showsVerticalScrollIndicator={false}
			>
				<View style={styles.hero}>
					<OMText variant="caption" style={styles.eyebrow}>
						RESULTS
					</OMText>
					<OMText variant="h3" style={styles.title}>
						Assay Results
					</OMText>
					<OMText variant="body" style={styles.body}>
						Open any saved run and review it.
					</OMText>
				</View>

				<View style={styles.pickerSection}>
					<ExploreActiveFileBar
						fileName={activeDocument ? activeDocument.name : 'No active file selected'}
						onPress={() => setIsPickerOpen((current) => !current)}
					/>
					{isPickerOpen ? (
						<ActiveDocumentPickerDropdown
							documents={importedDocuments}
							activeDocumentId={activeDocument?.id ?? null}
							emptyBody="Import a file first to filter assay results by genomic file."
							onAddFile={handleAddFile}
							onSelectDocument={handleSelectDocument}
						/>
					) : null}
				</View>

				{filteredRuns.length ? (
					<>
						<View style={styles.stack}>
							{visibleRuns.map((run, index) => (
								<View key={run.id} style={index > 0 ? styles.cardSeparator : undefined}>
									<ResultsCard run={run} />
								</View>
							))}
						</View>

						{hasMoreRuns ? (
							<View style={styles.paginationActions}>
								<OMButton
									label={`Show ${Math.min(RESULTS_PAGE_SIZE, filteredRuns.length - visibleCount)} More`}
									variant="secondary"
									onPress={() => {
										setVisibleCount((current) => Math.min(current + RESULTS_PAGE_SIZE, filteredRuns.length))
									}}
									style={styles.paginationButton}
								/>
							</View>
						) : filteredRuns.length > RESULTS_PAGE_SIZE ? (
							<View style={styles.paginationActions}>
								<OMButton
									label="Show Less"
									variant="secondary"
									onPress={() => {
										setVisibleCount(RESULTS_PAGE_SIZE)
									}}
									style={styles.paginationButton}
								/>
							</View>
						) : null}
					</>
				) : (
					<View style={styles.emptyCard}>
						<OMText variant="headline" style={styles.emptyTitle}>
							No results yet
						</OMText>
						<OMText variant="body" style={styles.emptyBody}>
							{activeDocument
								? 'No saved assay results match the selected file yet.'
								: 'Run a test from Explore, Files, or a test detail screen and it will appear here.'}
						</OMText>
					</View>
				)}
			</ScrollView>
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
	title: {
		color: omTheme.primaryText,
		maxWidth: 340,
	},
	body: {
		color: omColors.grayscale400,
		maxWidth: 360,
		fontSize: 17,
		lineHeight: 24,
	},
	pickerSection: {
		gap: omSpacing.s,
	},
	stack: {
		gap: omSpacing.xs,
	},
	paginationActions: {
		alignItems: 'center',
	},
	paginationButton: {
		minWidth: 160,
	},
	cardSeparator: {
		paddingTop: omSpacing.s,
		borderTopWidth: 1,
		borderTopColor: 'rgba(255,255,255,0.08)',
	},
	card: {
		paddingHorizontal: omSpacing.l,
		paddingVertical: omSpacing.m,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(255,255,255,0.04)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
		gap: omSpacing.s,
	},
	cardPressed: {
		backgroundColor: 'rgba(255,255,255,0.06)',
		borderColor: 'rgba(255,255,255,0.14)',
	},
	cardTopRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: omSpacing.m,
	},
	cardBottomRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: omSpacing.m,
	},
	cardTitle: {
		flex: 1,
		color: omTheme.primaryText,
	},
	cardBody: {
		flex: 1,
		color: omColors.grayscale500,
	},
	metaText: {
		color: omColors.grayscale500,
		flexShrink: 0,
	},
	cardAction: {
		color: omTheme.accent,
	},
	emptyCard: {
		padding: omSpacing.xl,
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.1)',
		gap: omSpacing.s,
	},
	emptyTitle: {
		color: omTheme.primaryText,
	},
	emptyBody: {
		color: omColors.grayscale400,
	},
})
