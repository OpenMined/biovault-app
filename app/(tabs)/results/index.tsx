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
						<OMText variant="body" style={styles.cardBody}>
							{run.inputLabel}
						</OMText>
					</View>
				</View>

				<OMText variant="caption" style={styles.metaText}>
					{formatRunTimestamp(run.ranAt)}
				</OMText>
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
				<View style={styles.hero}>
					<OMText variant="caption" style={styles.eyebrow}>
						RESULTS
					</OMText>
					<OMText variant="h3" style={styles.title}>
						Assay Results
					</OMText>
					<OMText variant="body" style={styles.body}>
						Open any saved run to review the latest matched, normal, and missing rows for that assay.
					</OMText>
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
	stack: {
		gap: omSpacing.m,
	},
	card: {
		padding: omSpacing.xl,
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.1)',
		gap: omSpacing.m,
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
		gap: omSpacing.xs,
	},
	cardTitle: {
		color: omTheme.primaryText,
	},
	cardBody: {
		color: omColors.grayscale400,
	},
	metaText: {
		color: omColors.grayscale500,
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
