import { OMButton } from '@/components/ui/OMButton'
import {
	loadHomeImportState,
	type HomeImportedDocument,
} from '@/lib/home-import'
import { scheduleTestFinishedNotification } from '@/lib/test-notifications'
import { OMText } from '@/components/ui/OMText'
import { getTestBySlug } from '@/lib/test-catalog'
import { loadLatestTestRun, saveLatestTestRun, type TestResultStatus } from '@/lib/test-results'
import { runTest } from '@/lib/test-runner'
import { omRadius, omSpacing, omTheme } from '@/styles/brand'
import { Link, useLocalSearchParams } from 'expo-router'
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useEffect, useMemo, useState } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function TestDetailScreen() {
	const params = useLocalSearchParams<{ documentId?: string; sample?: string; slug?: string }>()
	const test = params.slug ? getTestBySlug(params.slug) : null
	const [storedImport, setStoredImport] = useState<HomeImportedDocument | null>(null)
	const [latestRun, setLatestRun] = useState<Awaited<ReturnType<typeof loadLatestTestRun>>>(null)
	const [isRunning, setIsRunning] = useState(false)

	useEffect(() => {
		if (!params.slug) {
			return
		}

		void loadHomeImportState()
			.then((state) => {
				if (params.sample === 'true') {
					setStoredImport(null)
					return loadLatestTestRun(params.slug!, null).then(setLatestRun)
				}

				if (!params.documentId) {
					setStoredImport(null)
					return loadLatestTestRun(params.slug!).then(setLatestRun)
				}

				const document =
					state.importedDocuments.find((document) => document.id === params.documentId) ?? null
				setStoredImport(document)
				return loadLatestTestRun(params.slug!, params.documentId).then(setLatestRun)
			})
			.catch((error) => {
				console.error('Failed to load home import state:', error)
				setStoredImport(null)
				void loadLatestTestRun(params.slug!).then(setLatestRun).catch(console.error)
			})
	}, [params.documentId, params.sample, params.slug])

	const groupedRows = useMemo(() => {
		if (!latestRun) {
			return []
		}

		return ['matched', 'normal', 'missing'].map((status) => ({
			status: status as TestResultStatus,
			rows: latestRun.rows.filter((row) => row.status === status),
		}))
	}, [latestRun])

	if (!test) {
		return (
			<SafeAreaView style={styles.safeArea}>
				<View style={styles.emptyState}>
					<OMText variant="h4" style={styles.emptyTitle}>
						Test not found
					</OMText>
					<OMText variant="body" style={styles.emptyBody}>
						This test route does not exist yet.
					</OMText>
					<Link href="/(tabs)/home" asChild>
						<Pressable style={styles.backLink}>
							<OMText variant="subtitle" style={styles.backLinkText}>
								Back to Home
							</OMText>
						</Pressable>
					</Link>
				</View>
			</SafeAreaView>
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
						{test.category.toUpperCase()}
					</OMText>
					<OMText variant="h3" style={styles.title}>
						{test.title}
					</OMText>
					<OMText variant="body" style={styles.subtitle}>
						{test.subtitle}
					</OMText>
				</View>

				<View style={styles.panel}>
					<OMText variant="headline" style={styles.panelTitle}>
						What this test does
					</OMText>
					<OMText variant="body" style={styles.panelBody}>
						{test.description}
					</OMText>
				</View>

				<View style={styles.panel}>
					<OMText variant="headline" style={styles.panelTitle}>
						Run input
					</OMText>
					<OMText variant="body" style={styles.panelBody}>
						{storedImport
							? `Using imported file: ${storedImport.name}`
							: 'Using bundled sample data for this run.'}
					</OMText>
					{latestRun ? (
						<OMText variant="caption" style={styles.runMeta}>
							Last run: {new Date(latestRun.ranAt).toLocaleString()} • {latestRun.inputLabel}
							{latestRun.isPreview ? ' • Preview mode' : ''}
						</OMText>
					) : null}
					<OMText variant="caption" style={styles.runMeta}>
						Execution mode: {test.runMode === 'bioscript' ? 'Live Bioscript run' : 'Preview only'}
					</OMText>
				</View>

				<View style={styles.panel}>
					<OMText variant="headline" style={styles.panelTitle}>
						Privacy label
					</OMText>

					<View style={styles.labelGroup}>
						<OMText variant="subtitle" style={styles.labelTitle}>
							Runs
						</OMText>
						{test.privacy.runs.map((item) => (
							<OMText key={item} variant="body" style={styles.labelItem}>
								{item}
							</OMText>
						))}
					</View>

					<View style={styles.labelGroup}>
						<OMText variant="subtitle" style={styles.labelTitle}>
							Reads
						</OMText>
						{test.privacy.reads.map((item) => (
							<OMText key={item} variant="body" style={styles.labelItem}>
								{item}
							</OMText>
						))}
					</View>

					<View style={styles.labelGroup}>
						<OMText variant="subtitle" style={styles.labelTitle}>
							Bundled files
						</OMText>
						{test.privacy.usesBundledFiles.map((item) => (
							<OMText key={item} variant="body" style={styles.labelItem}>
								{item}
							</OMText>
						))}
					</View>

					<View style={styles.labelGroup}>
						<OMText variant="subtitle" style={styles.labelTitle}>
							External URLs
						</OMText>
						{test.privacy.externalUrls.length ? (
							test.privacy.externalUrls.map((item) => (
								<OMText key={item} variant="body" style={styles.labelItem}>
									{item}
								</OMText>
							))
						) : (
							<OMText variant="body" style={styles.labelItem}>
								None
							</OMText>
						)}
					</View>

					<View style={styles.labelGroup}>
						<OMText variant="subtitle" style={styles.labelTitle}>
							Stores results
						</OMText>
						<OMText variant="body" style={styles.labelItem}>
							{test.privacy.storesResults}
						</OMText>
					</View>
				</View>

				<View style={styles.panel}>
					<OMText variant="headline" style={styles.panelTitle}>
						Files and sources
					</OMText>

					<View style={styles.labelGroup}>
						<OMText variant="subtitle" style={styles.labelTitle}>
							Files used
						</OMText>
						{test.files.map((item) => (
							<OMText key={item} variant="body" style={styles.labelItem}>
								{item}
							</OMText>
						))}
					</View>

					<View style={styles.labelGroup}>
						<OMText variant="subtitle" style={styles.labelTitle}>
							Sources
						</OMText>
						{test.sources.map((item) => (
							<OMText key={item} variant="body" style={styles.labelItem}>
								{item}
							</OMText>
						))}
					</View>
				</View>

				{latestRun ? (
					<View style={styles.panel}>
						<OMText variant="headline" style={styles.panelTitle}>
							Latest results
						</OMText>
						<OMText variant="body" style={styles.panelBody}>
							Rows are grouped into matched, normal, and missing so it is clear what was found and
							what was absent from the current file.
						</OMText>

						{groupedRows.map((group) =>
							group.rows.length ? (
								<View key={group.status} style={styles.geneGroup}>
									<OMText variant="subtitle" style={styles.labelTitle}>
										{group.status}
									</OMText>
									{group.rows.map((item) => (
										<View key={`${group.status}-${item.gene}-${item.label}`} style={styles.variantRow}>
											<View style={styles.variantHeader}>
												<OMText variant="body" style={styles.variantName}>
													{item.label}
												</OMText>
												<View style={styles.statusPill}>
													<OMText variant="caption" style={styles.statusText}>
														{item.status}
													</OMText>
												</View>
											</View>
											<OMText variant="caption" style={styles.variantMeta}>
												{item.gene} • {item.location} • {item.kind}
											</OMText>
											<OMText variant="body" style={styles.variantNote}>
												{item.note}
											</OMText>
										</View>
									))}
								</View>
							) : null
						)}
					</View>
				) : null}

				<View style={styles.panel}>
					<OMText variant="headline" style={styles.panelTitle}>
						Result model
					</OMText>
					<OMText variant="body" style={styles.panelBody}>
						After a run, results can be grouped into these buckets:
					</OMText>

					<View style={styles.bucketRow}>
						{test.resultBuckets.map((bucket) => (
							<View key={bucket} style={styles.bucketPill}>
								<OMText variant="caption" style={styles.bucketText}>
									{bucket}
								</OMText>
							</View>
						))}
					</View>

					{test.variantExamples.map((group) => (
						<View key={group.gene} style={styles.geneGroup}>
							<OMText variant="subtitle" style={styles.geneTitle}>
								{group.gene}
							</OMText>

							{group.items.map((item) => (
								<View key={item.id} style={styles.variantRow}>
									<View style={styles.variantHeader}>
										<OMText variant="body" style={styles.variantName}>
											{item.rsid ?? item.kind}
										</OMText>
										<View style={styles.statusPill}>
											<OMText variant="caption" style={styles.statusText}>
												{item.status}
											</OMText>
										</View>
									</View>
									<OMText variant="caption" style={styles.variantMeta}>
										{item.location} • {item.kind}
									</OMText>
									<OMText variant="body" style={styles.variantNote}>
										{item.note}
									</OMText>
								</View>
							))}
						</View>
					))}
				</View>

				<OMButton
					label={isRunning ? 'Running...' : 'Run test'}
					onPress={() => {
						void (async () => {
							try {
								setIsRunning(true)
								const run = await runTest(test.slug, storedImport)
								await saveLatestTestRun(run)
								const savedRun = await loadLatestTestRun(test.slug)
								setLatestRun(savedRun)
								await scheduleTestFinishedNotification(test.title, test.slug)
								if (run.isPreview) {
									Alert.alert(
										'Preview run saved',
										'This test still uses bundled preview rows. Its legacy classifier needs to be ported into the current expo-bioscript runtime.'
									)
								}
							} catch (error) {
								const message = error instanceof Error ? error.message : 'Unable to run test.'
								Alert.alert('Run failed', message)
							} finally {
								setIsRunning(false)
							}
						})()
					}}
					disabled={isRunning}
					style={styles.runButton}
				/>
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
		backgroundColor: 'rgba(60,159,139,0.12)',
		color: omTheme.accentDeep,
		letterSpacing: 0.8,
	},
	title: {
		color: omTheme.textHeadline,
		maxWidth: 320,
	},
	subtitle: {
		color: omTheme.textBody,
		maxWidth: 340,
		fontSize: 17,
		lineHeight: 24,
	},
	panel: {
		padding: omSpacing.xl,
		borderRadius: omRadius.l,
		backgroundColor: 'rgba(252,252,253,0.82)',
		borderWidth: 1,
		borderColor: 'rgba(39,37,50,0.06)',
		gap: omSpacing.m,
	},
	panelTitle: {
		color: omTheme.textHeadline,
	},
	panelBody: {
		color: omTheme.textBody,
	},
	runMeta: {
		color: omTheme.textMuted,
	},
	labelGroup: {
		gap: omSpacing.xs,
	},
	labelTitle: {
		color: omTheme.textMuted,
		letterSpacing: 0.5,
		textTransform: 'uppercase',
	},
	labelItem: {
		color: omTheme.textBody,
	},
	bucketRow: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: omSpacing.s,
	},
	bucketPill: {
		paddingHorizontal: omSpacing.s,
		paddingVertical: omSpacing.xs,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(60,159,139,0.12)',
	},
	bucketText: {
		color: omTheme.accentDeep,
	},
	geneGroup: {
		marginTop: omSpacing.s,
		gap: omSpacing.s,
	},
	geneTitle: {
		color: omTheme.textHeadline,
	},
	variantRow: {
		padding: omSpacing.m,
		borderRadius: omRadius.m,
		backgroundColor: omTheme.surface,
		borderWidth: 1,
		borderColor: 'rgba(39,37,50,0.06)',
		gap: omSpacing.xs,
	},
	variantHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: omSpacing.m,
	},
	variantName: {
		flex: 1,
		color: omTheme.textHeadline,
	},
	statusPill: {
		paddingHorizontal: omSpacing.s,
		paddingVertical: omSpacing.xs,
		borderRadius: omRadius.m,
		backgroundColor: omTheme.surfaceDim,
	},
	statusText: {
		color: omTheme.textMuted,
		textTransform: 'capitalize',
	},
	variantMeta: {
		color: omTheme.textMuted,
	},
	variantNote: {
		color: omTheme.textBody,
	},
	runButton: {
		minHeight: 54,
		borderRadius: omRadius.l,
	},
	emptyState: {
		flex: 1,
		padding: omSpacing.xl,
		alignItems: 'flex-start',
		justifyContent: 'center',
		gap: omSpacing.m,
		backgroundColor: omTheme.background,
	},
	emptyTitle: {
		color: omTheme.textHeadline,
	},
	emptyBody: {
		color: omTheme.textBody,
	},
	backLink: {
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.m,
		backgroundColor: omTheme.surfaceDim,
	},
	backLinkText: {
		color: omTheme.textHeadline,
	},
})
