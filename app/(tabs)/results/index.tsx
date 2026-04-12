import { OMText } from '@/components/ui/OMText'
import { listRecentTestRuns, type RecentTestRunSummary } from '@/lib/test-results'
import { omColors, omRadius, omSpacing, omTheme } from '@/styles/brand'
import { useFocusEffect } from '@react-navigation/native'
import { Link } from 'expo-router'
import { useCallback, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

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
					<View style={styles.cardTitleWrap}>
						<OMText variant="headline" style={styles.cardTitle}>
							{run.testTitle}
						</OMText>
						<OMText variant="body" style={styles.cardBody} numberOfLines={1}>
							{run.inputLabel}
						</OMText>
					</View>
					{run.isPreview ? (
						<View style={styles.previewPill}>
							<OMText variant="caption" style={styles.previewText}>
								Preview
							</OMText>
						</View>
					) : (
						<View style={styles.livePill}>
							<OMText variant="caption" style={styles.liveText}>
								Live
							</OMText>
						</View>
					)}
				</View>

				<View style={styles.cardBottomRow}>
					<View style={styles.metaRow}>
						<View style={styles.metaPill}>
							<OMText variant="caption" style={styles.metaPillText}>
								{run.rowCount} result row{run.rowCount === 1 ? '' : 's'}
							</OMText>
						</View>
						<View style={styles.metaPill}>
							<OMText variant="caption" style={styles.metaPillText}>
								{run.inputDocumentId ? 'Imported file' : 'Sample input'}
							</OMText>
						</View>
					</View>

					<OMText variant="caption" style={styles.metaText}>
						{formatRunTimestamp(run.ranAt)}
					</OMText>
				</View>
			</Pressable>
		</Link>
	)
}

export default function ResultsScreen() {
	const [runs, setRuns] = useState<RecentTestRunSummary[]>([])

	const loadRuns = useCallback(() => {
		void listRecentTestRuns(30).then(setRuns).catch(console.error)
	}, [])

	useFocusEffect(
		useCallback(() => {
			loadRuns()
		}, [loadRuns])
	)

	return (
		<SafeAreaView style={styles.safeArea} edges={['top']}>
			<ScrollView
				style={styles.screen}
				contentContainerStyle={styles.content}
				showsVerticalScrollIndicator={false}
			>
				<View style={styles.headerRow}>
					<OMText variant="h4" style={styles.title}>
						Results
					</OMText>
					{runs.length ? (
						<OMText variant="caption" style={styles.countText}>
							{runs.length} saved
						</OMText>
					) : null}
				</View>

				{runs.length ? (
					<View style={styles.stack}>
						{runs.map((run) => (
							<ResultsCard key={run.id} run={run} />
						))}
					</View>
				) : (
					<View style={styles.emptyCard}>
						<OMText variant="headline" style={styles.emptyTitle}>
							No results yet
						</OMText>
						<OMText variant="body" style={styles.emptyBody}>
							Run a test from Explore, Files, or a test detail screen and it will appear here.
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
		gap: omSpacing.l,
	},
	headerRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: omSpacing.m,
		paddingTop: omSpacing.s,
	},
	title: {
		color: omTheme.primaryText,
	},
	countText: {
		color: omColors.grayscale500,
	},
	stack: {
		gap: omSpacing.s,
	},
	card: {
		paddingHorizontal: omSpacing.l,
		paddingVertical: omSpacing.m,
		borderRadius: omRadius.m,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
		gap: omSpacing.s,
	},
	cardPressed: {
		backgroundColor: 'rgba(255,255,255,0.04)',
	},
	cardTopRow: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		justifyContent: 'space-between',
		gap: omSpacing.m,
	},
	cardTitleWrap: {
		flex: 1,
		gap: 2,
	},
	cardTitle: {
		color: omTheme.primaryText,
		fontSize: 18,
		lineHeight: 22,
	},
	cardBody: {
		color: omColors.grayscale400,
		fontSize: 14,
		lineHeight: 18,
	},
	previewPill: {
		paddingHorizontal: omSpacing.s,
		paddingVertical: 4,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(224,163,176,0.12)',
		borderWidth: 1,
		borderColor: 'rgba(224,163,176,0.24)',
	},
	previewText: {
		color: omColors.red300,
	},
	livePill: {
		paddingHorizontal: omSpacing.s,
		paddingVertical: 4,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(83,190,169,0.14)',
		borderWidth: 1,
		borderColor: 'rgba(83,190,169,0.28)',
	},
	liveText: {
		color: omTheme.accent,
	},
	cardBottomRow: {
		flexDirection: 'row',
		alignItems: 'flex-end',
		justifyContent: 'space-between',
		gap: omSpacing.m,
	},
	metaRow: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: omSpacing.s,
	},
	metaPill: {
		paddingHorizontal: omSpacing.s,
		paddingVertical: omSpacing.xs,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(255,255,255,0.08)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
	},
	metaPillText: {
		color: omColors.grayscale300,
	},
	metaText: {
		color: omColors.grayscale500,
		textAlign: 'right',
		flexShrink: 0,
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
