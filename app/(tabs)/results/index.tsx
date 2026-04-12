import { OMText } from '@/components/ui/OMText'
import { listRecentTestRuns, type RecentTestRunSummary } from '@/lib/test-results'
import { omRadius, omSpacing, omTheme } from '@/styles/brand'
import { useFocusEffect } from '@react-navigation/native'
import { Link } from 'expo-router'
import { useCallback, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

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
		<SafeAreaView style={styles.safeArea}>
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
						Recently run tests.
					</OMText>
					<OMText variant="body" style={styles.body}>
						Local runs are stored on device. Open any result to review the latest grouped rows.
					</OMText>
				</View>

				{runs.length ? (
					<View style={styles.stack}>
						{runs.map((run) => (
							<Link
								key={run.id}
								href={{ pathname: '/tests/[slug]', params: { slug: run.slug } }}
								asChild
							>
								<Pressable style={styles.card}>
									<View style={styles.cardHeader}>
										<OMText variant="headline" style={styles.cardTitle}>
											{run.testTitle}
										</OMText>
										{run.isPreview ? (
											<View style={styles.previewPill}>
												<OMText variant="caption" style={styles.previewText}>
													Preview
												</OMText>
											</View>
										) : null}
									</View>
									<OMText variant="body" style={styles.cardBody}>
										{run.inputLabel}
									</OMText>
									<OMText variant="caption" style={styles.meta}>
										{new Date(run.ranAt).toLocaleString()} • {run.rowCount} result rows
									</OMText>
								</Pressable>
							</Link>
						))}
					</View>
				) : (
					<View style={styles.emptyCard}>
						<OMText variant="headline" style={styles.emptyTitle}>
							No results yet
						</OMText>
						<OMText variant="body" style={styles.emptyBody}>
							Run a test from Home and it will appear here.
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
		backgroundColor: omTheme.background,
	},
	screen: {
		flex: 1,
		backgroundColor: omTheme.background,
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
	stack: {
		gap: omSpacing.m,
	},
	card: {
		padding: omSpacing.xl,
		borderRadius: omRadius.l,
		backgroundColor: 'rgba(252,252,253,0.82)',
		borderWidth: 1,
		borderColor: 'rgba(39,37,50,0.06)',
	},
	cardHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: omSpacing.m,
	},
	cardTitle: {
		flex: 1,
		color: omTheme.textHeadline,
	},
	cardBody: {
		marginTop: omSpacing.s,
		color: omTheme.textBody,
	},
	meta: {
		marginTop: omSpacing.m,
		color: omTheme.textMuted,
	},
	previewPill: {
		paddingHorizontal: omSpacing.s,
		paddingVertical: omSpacing.xs,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(60,159,139,0.12)',
	},
	previewText: {
		color: omTheme.accentDeep,
	},
	emptyCard: {
		padding: omSpacing.xl,
		borderRadius: omRadius.l,
		backgroundColor: 'rgba(252,252,253,0.82)',
		borderWidth: 1,
		borderColor: 'rgba(39,37,50,0.06)',
		gap: omSpacing.s,
	},
	emptyTitle: {
		color: omTheme.textHeadline,
	},
	emptyBody: {
		color: omTheme.textBody,
	},
})
