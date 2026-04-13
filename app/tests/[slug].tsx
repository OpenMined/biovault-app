import { AssayFilePickerModal } from '@/components/assays/AssayFilePickerModal'
import { AssayResultPanel } from '@/components/assays/AssayResultPanel'
import { OMButton } from '@/components/ui/OMButton'
import { OMText } from '@/components/ui/OMText'
import { assessAssayCompatibility } from '@/lib/assay-compatibility'
import { getPreferredDocumentIdForAssaySync, setPreferredDocumentIdForAssaySync } from '@/lib/assay-preferences'
import { describeLatestRun, groupTestResultRows } from '@/lib/assay-result-presentation'
import { getAvailableAssayManifestByIdSync } from '@/lib/assay-registry'
import { loadHomeImportState, type HomeImportedDocument } from '@/lib/home-import'
import { scheduleTestFinishedNotification } from '@/lib/test-notifications'
import { loadLatestTestRun, saveLatestTestRun } from '@/lib/test-results'
import { runTest } from '@/lib/test-runner'
import { omColors, omRadius, omSpacing, omTheme } from '@/styles/brand'
import { Link, router, useLocalSearchParams } from 'expo-router'
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useEffect, useMemo, useState } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function TestDetailScreen() {
	const params = useLocalSearchParams<{ documentId?: string; sample?: string; showResults?: string; slug?: string }>()
	const assay = params.slug ? getAvailableAssayManifestByIdSync(params.slug) : null

	const [importedDocuments, setImportedDocuments] = useState<HomeImportedDocument[]>([])
	const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(params.documentId ?? null)
	const [latestRun, setLatestRun] = useState<Awaited<ReturnType<typeof loadLatestTestRun>>>(null)
	const [isRunning, setIsRunning] = useState(false)
	const [isFilePickerOpen, setIsFilePickerOpen] = useState(false)
	const [showMoreDetails, setShowMoreDetails] = useState(false)
	const [useSampleInput, setUseSampleInput] = useState(params.sample === 'true')

	const selectedDocument = useMemo(
		() => importedDocuments.find((document) => document.id === selectedDocumentId) ?? null,
		[importedDocuments, selectedDocumentId]
	)

	useEffect(() => {
		setUseSampleInput(params.sample === 'true')
	}, [params.sample])

	useEffect(() => {
		if (!assay) {
			setImportedDocuments([])
			setSelectedDocumentId(null)
			return
		}

		void loadHomeImportState()
			.then((state) => {
				setImportedDocuments(state.importedDocuments)

				const preferredDocumentId = getPreferredDocumentIdForAssaySync(assay.id)
				const nextSelectedDocumentId =
					(params.documentId &&
						state.importedDocuments.some((document) => document.id === params.documentId) &&
						params.documentId) ||
					(preferredDocumentId &&
						state.importedDocuments.some((document) => document.id === preferredDocumentId) &&
						preferredDocumentId) ||
					(state.activeImportedDocumentId &&
						state.importedDocuments.some((document) => document.id === state.activeImportedDocumentId) &&
						state.activeImportedDocumentId) ||
					state.importedDocuments[0]?.id ||
					null

				setSelectedDocumentId(nextSelectedDocumentId)
			})
			.catch((error) => {
				console.error('Failed to load home import state:', error)
				setImportedDocuments([])
				setSelectedDocumentId(null)
			})
	}, [assay, params.documentId])

	useEffect(() => {
		if (!params.slug) {
			return
		}

		if (useSampleInput) {
			void loadLatestTestRun(params.slug, null)
				.then(setLatestRun)
				.catch((error) => {
					console.error('Failed to load latest sample run:', error)
					setLatestRun(null)
				})
			return
		}

		if (!selectedDocumentId) {
			setLatestRun(null)
			return
		}

		void loadLatestTestRun(params.slug, selectedDocumentId)
			.then(setLatestRun)
			.catch((error) => {
				console.error('Failed to load latest run for selected file:', error)
				setLatestRun(null)
			})
	}, [params.slug, selectedDocumentId, useSampleInput])

	const compatibility = useMemo(() => {
		if (!assay) {
			return null
		}

		return assessAssayCompatibility(assay, useSampleInput ? null : selectedDocument)
	}, [assay, selectedDocument, useSampleInput])

	const groupedRows = useMemo(() => groupTestResultRows(latestRun), [latestRun])
	const latestRunSummary = useMemo(
		() => (assay ? describeLatestRun(assay, latestRun) : null),
		[assay, latestRun]
	)
	const canRun = useSampleInput || !!selectedDocument
	const runButtonLabel = isRunning ? 'Running...' : canRun ? (latestRun ? 'Run again' : 'Run assay') : 'Select a file to run'
	const shouldPrioritizeResults = params.showResults === 'true' && !!latestRun

	const handleRun = () => {
		if (!assay) {
			return
		}

		void (async () => {
			try {
				setIsRunning(true)
				const run = await runTest(assay.id, useSampleInput ? null : selectedDocument)

				if (!useSampleInput && selectedDocument) {
					setPreferredDocumentIdForAssaySync(assay.id, selectedDocument.id)
				}

				await saveLatestTestRun(run)
				const savedRun = await loadLatestTestRun(assay.id, useSampleInput ? null : selectedDocument?.id ?? null)
				setLatestRun(savedRun)
				await scheduleTestFinishedNotification(assay.title, assay.id)

				if (run.isPreview) {
					Alert.alert(
						'Preview assay run saved',
						'This assay still uses bundled preview rows. Its legacy classifier needs to be ported into the current expo-bioscript runtime.'
					)
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Unable to run assay.'
				Alert.alert('Assay run failed', message)
			} finally {
				setIsRunning(false)
			}
		})()
	}

	if (!assay) {
		return (
			<SafeAreaView style={styles.safeArea}>
				<View style={styles.emptyState}>
					<OMText variant="h4" style={styles.emptyTitle}>
						Assay not found
					</OMText>
					<OMText variant="body" style={styles.emptyBody}>
						This assay route does not exist yet.
					</OMText>
					<Link href="/" asChild>
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
			<ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
				<View style={styles.topBar}>
					<Pressable onPress={() => router.back()} style={styles.backButton}>
						<OMText variant="subtitle" style={styles.backButtonText}>
							Back
						</OMText>
					</Pressable>
					<Pressable
						onPress={handleRun}
						disabled={isRunning || !canRun}
						style={({ pressed }) => [
							styles.quickRunButton,
							isRunning || !canRun ? styles.quickRunButtonDisabled : null,
							pressed ? styles.quickRunButtonPressed : null,
						]}
					>
						<OMText variant="subtitle" style={styles.quickRunButtonText}>
							{isRunning ? 'Running...' : canRun ? 'Run now' : 'Pick file'}
						</OMText>
					</Pressable>
				</View>

				<View style={styles.hero}>
					<OMText variant="caption" style={styles.eyebrow}>
						{assay.category.toUpperCase()}
					</OMText>
					<OMText variant="h3" style={styles.title}>
						{assay.title}
					</OMText>
					<OMText variant="body" style={styles.subtitle}>
						{assay.subtitle}
					</OMText>
				</View>

				{shouldPrioritizeResults && latestRun ? (
					<AssayResultPanel
						groupedRows={groupedRows}
						latestRun={latestRun}
						latestRunSummary={latestRunSummary}
					/>
				) : null}

				<View style={styles.panel}>
					<OMText variant="headline" style={styles.panelTitle}>
						What you&apos;ll learn
					</OMText>
					<OMText variant="body" style={styles.panelBody}>
						{assay.description}
					</OMText>
				</View>

				<View style={styles.panel}>
					<OMText variant="headline" style={styles.panelTitle}>
						Choose file
					</OMText>

					{useSampleInput ? (
						<OMText variant="body" style={styles.panelBody}>
							Using bundled sample data for this run.
						</OMText>
					) : selectedDocument ? (
						<View style={styles.selectedFileCard}>
							<View style={styles.selectedFileText}>
								<OMText variant="subtitle" style={styles.selectedFileTitle}>
									{selectedDocument.name}
								</OMText>
								<OMText variant="caption" style={styles.selectedFileMeta}>
									{selectedDocument.originalName}
									{selectedDocument.mimeType ? ` • ${selectedDocument.mimeType}` : ''} • Added{' '}
									{new Date(selectedDocument.importedAt).toLocaleDateString()}
								</OMText>
							</View>
							<Pressable
								onPress={() => setIsFilePickerOpen(true)}
								style={({ pressed }) => [
									styles.changeFileButton,
									pressed ? styles.changeFileButtonPressed : null,
								]}
							>
								<OMText variant="subtitle" style={styles.changeFileButtonText}>
									Change file
								</OMText>
							</Pressable>
						</View>
					) : importedDocuments.length ? (
						<View style={styles.fileSelectionStack}>
							<OMText variant="body" style={styles.panelBody}>
								Choose which imported file this assay should run on.
							</OMText>
							<Pressable
								onPress={() => setIsFilePickerOpen(true)}
								style={({ pressed }) => [styles.addFileButton, pressed ? styles.addFileButtonPressed : null]}
							>
								<OMText variant="subtitle" style={styles.addFileButtonText}>
									Choose file
								</OMText>
							</Pressable>
						</View>
					) : (
						<View style={styles.fileSelectionStack}>
							<OMText variant="body" style={styles.panelBody}>
								Import a genome file before running this assay.
							</OMText>
							<Pressable
								onPress={() => router.push('/data-source')}
								style={({ pressed }) => [styles.addFileButton, pressed ? styles.addFileButtonPressed : null]}
							>
								<OMText variant="subtitle" style={styles.addFileButtonText}>
									Add file
								</OMText>
							</Pressable>
						</View>
					)}

					{latestRun ? (
						<OMText variant="caption" style={styles.runMeta}>
							Last run: {new Date(latestRun.ranAt).toLocaleString()} • {latestRun.inputLabel}
							{latestRun.isPreview ? ' • Preview mode' : ''}
						</OMText>
					) : null}

					<OMText variant="caption" style={styles.runMeta}>
						Execution mode: {assay.runMode === 'package' ? 'Live assay package run' : 'Preview only'}
					</OMText>
				</View>

				<AssayFilePickerModal
					importedDocuments={importedDocuments}
					onClose={() => setIsFilePickerOpen(false)}
					onSelectDocument={(document) => {
						setSelectedDocumentId(document.id)
						setUseSampleInput(false)
						setPreferredDocumentIdForAssaySync(assay.id, document.id)
						setIsFilePickerOpen(false)
					}}
					onUseSample={() => {
						setUseSampleInput(true)
						setIsFilePickerOpen(false)
					}}
					selectedDocumentId={selectedDocumentId}
					useSampleInput={useSampleInput}
					visible={isFilePickerOpen}
				/>

				{compatibility ? (
					<View style={styles.panel}>
						<OMText variant="headline" style={styles.panelTitle}>
							Before you run
						</OMText>
						<OMText variant="body" style={styles.panelBody}>
							{compatibility.summary}
						</OMText>

						<View style={styles.confidenceRow}>
							<View style={styles.confidencePill}>
								<OMText variant="caption" style={styles.confidencePillText}>
									{compatibility.status === 'likely-supported'
										? 'Good fit for this file'
										: compatibility.status === 'unlikely'
											? 'May need another file'
											: 'Needs review'}
								</OMText>
							</View>
							<View style={styles.confidencePill}>
								<OMText variant="caption" style={styles.confidencePillText}>
									Runs locally
								</OMText>
							</View>
							<View style={styles.confidencePill}>
								<OMText variant="caption" style={styles.confidencePillText}>
									No uploads
								</OMText>
							</View>
						</View>

						<OMText variant="caption" style={styles.runMeta}>
							Input: {compatibility.profile.displayLabel}
							{compatibility.profile.extension ? ` • ${compatibility.profile.extension}` : ''}
							{compatibility.profile.source !== 'unknown' ? ` • ${compatibility.profile.source}` : ''}
						</OMText>
						<OMText variant="caption" style={styles.runMeta}>
							Status:{' '}
							{compatibility.status === 'likely-supported'
								? 'Likely supported'
								: compatibility.status === 'unlikely'
									? 'Likely unsupported'
									: 'Needs review'}
						</OMText>

						<View style={styles.labelGroup}>
							<OMText variant="subtitle" style={styles.labelTitle}>
								Supported file types
							</OMText>
							<OMText variant="body" style={styles.labelItem}>
								{assay.compatibility.supportedExtensions.join(', ')}
							</OMText>
						</View>

						<View style={styles.labelGroup}>
							<OMText variant="subtitle" style={styles.labelTitle}>
								Notes
							</OMText>
							{assay.compatibility.notes.map((item) => (
								<OMText key={item} variant="body" style={styles.labelItem}>
									{item}
								</OMText>
							))}
						</View>
					</View>
				) : null}

				<Pressable
					onPress={() => setShowMoreDetails((current) => !current)}
					style={({ pressed }) => [styles.detailsToggle, pressed ? styles.detailsTogglePressed : null]}
				>
					<View style={styles.detailsToggleText}>
						<OMText variant="headline" style={styles.panelTitle}>
							More details
						</OMText>
						<OMText variant="body" style={styles.panelBody}>
							Privacy label, source files, and result model.
						</OMText>
					</View>
					<OMText variant="subtitle" style={styles.detailsToggleAction}>
						{showMoreDetails ? 'Hide' : 'Show'}
					</OMText>
				</Pressable>

				{showMoreDetails ? (
					<>
						<View style={styles.panel}>
							<OMText variant="headline" style={styles.panelTitle}>
								Privacy label
							</OMText>

							<View style={styles.labelGroup}>
								<OMText variant="subtitle" style={styles.labelTitle}>
									Runs
								</OMText>
								{assay.privacy.runs.map((item) => (
									<OMText key={item} variant="body" style={styles.labelItem}>
										{item}
									</OMText>
								))}
							</View>

							<View style={styles.labelGroup}>
								<OMText variant="subtitle" style={styles.labelTitle}>
									Reads
								</OMText>
								{assay.privacy.reads.map((item) => (
									<OMText key={item} variant="body" style={styles.labelItem}>
										{item}
									</OMText>
								))}
							</View>

							<View style={styles.labelGroup}>
								<OMText variant="subtitle" style={styles.labelTitle}>
									Bundled files
								</OMText>
								{assay.privacy.usesBundledFiles.map((item) => (
									<OMText key={item} variant="body" style={styles.labelItem}>
										{item}
									</OMText>
								))}
							</View>

							<View style={styles.labelGroup}>
								<OMText variant="subtitle" style={styles.labelTitle}>
									External URLs
								</OMText>
								{assay.privacy.externalUrls.length ? (
									assay.privacy.externalUrls.map((item) => (
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
									{assay.privacy.storesResults}
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
								{assay.files.map((item) => (
									<OMText key={item} variant="body" style={styles.labelItem}>
										{item}
									</OMText>
								))}
							</View>

							<View style={styles.labelGroup}>
								<OMText variant="subtitle" style={styles.labelTitle}>
									Sources
								</OMText>
								{assay.sources.map((item) => (
									<OMText key={item} variant="body" style={styles.labelItem}>
										{item}
									</OMText>
								))}
							</View>
						</View>

						<View style={styles.panel}>
							<OMText variant="headline" style={styles.panelTitle}>
								Result model
							</OMText>
							<OMText variant="body" style={styles.panelBody}>
								After a run, results can be grouped into these buckets:
							</OMText>

							<View style={styles.bucketRow}>
								{assay.resultBuckets.map((bucket) => (
									<View key={bucket} style={styles.bucketPill}>
										<OMText variant="caption" style={styles.bucketText}>
											{bucket}
										</OMText>
									</View>
								))}
							</View>

							{assay.variantExamples.map((group) => (
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
											{item.kind === 'INDEL' && (item.ref || item.alts?.length) ? (
												<View style={styles.variantDetailBlock}>
													{item.ref ? (
														<OMText variant="caption" style={styles.variantDetailText}>
															Ref: {item.ref}
														</OMText>
													) : null}
													{item.alts?.length ? (
														<OMText variant="caption" style={styles.variantDetailText}>
															Alts: {item.alts.join(', ')}
														</OMText>
													) : null}
												</View>
											) : null}
											<OMText variant="body" style={styles.variantNote}>
												{item.note}
											</OMText>
										</View>
									))}
								</View>
							))}
						</View>
					</>
				) : null}

				{latestRun && !shouldPrioritizeResults ? (
					<AssayResultPanel
						groupedRows={groupedRows}
						latestRun={latestRun}
						latestRunSummary={latestRunSummary}
					/>
				) : null}

				<OMButton label={runButtonLabel} onPress={handleRun} disabled={isRunning || !canRun} style={styles.runButton} />
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
	topBar: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: omSpacing.m,
	},
	backButton: {
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.full,
		backgroundColor: 'rgba(255,255,255,0.08)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.12)',
	},
	backButtonText: {
		color: omColors.grayscale300,
	},
	quickRunButton: {
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.full,
		backgroundColor: 'rgba(82,168,197,0.14)',
		borderWidth: 1,
		borderColor: 'rgba(82,168,197,0.26)',
	},
	quickRunButtonPressed: {
		opacity: 0.9,
	},
	quickRunButtonDisabled: {
		backgroundColor: 'rgba(255,255,255,0.06)',
		borderColor: 'rgba(255,255,255,0.08)',
	},
	quickRunButtonText: {
		color: omColors.teal500,
	},
	hero: {
		gap: omSpacing.m,
		paddingTop: omSpacing.m,
		paddingBottom: omSpacing.s,
	},
	eyebrow: {
		alignSelf: 'flex-start',
		paddingHorizontal: omSpacing.s,
		paddingVertical: omSpacing.xs,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(82,168,197,0.14)',
		borderWidth: 1,
		borderColor: 'rgba(82,168,197,0.24)',
		color: omColors.teal500,
		letterSpacing: 0.8,
	},
	title: {
		color: omTheme.primaryText,
		maxWidth: 340,
	},
	subtitle: {
		color: omColors.grayscale400,
		maxWidth: 360,
		fontSize: 17,
		lineHeight: 24,
	},
	panel: {
		padding: omSpacing.xl,
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
		gap: omSpacing.m,
	},
	panelTitle: {
		color: omTheme.primaryText,
	},
	panelBody: {
		color: omColors.grayscale400,
	},
	runMeta: {
		color: omColors.grayscale500,
	},
	confidenceRow: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: omSpacing.s,
	},
	confidencePill: {
		paddingHorizontal: omSpacing.s,
		paddingVertical: omSpacing.xs,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(255,255,255,0.08)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
	},
	confidencePillText: {
		color: omColors.grayscale300,
	},
	labelGroup: {
		gap: omSpacing.xs,
	},
	labelTitle: {
		color: omColors.grayscale500,
		letterSpacing: 0.5,
		textTransform: 'uppercase',
	},
	labelItem: {
		color: omColors.grayscale300,
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
		backgroundColor: 'rgba(82,168,197,0.12)',
		borderWidth: 1,
		borderColor: 'rgba(82,168,197,0.18)',
	},
	bucketText: {
		color: omColors.teal500,
	},
	geneGroup: {
		marginTop: omSpacing.s,
		gap: omSpacing.s,
	},
	geneTitle: {
		color: omTheme.primaryText,
	},
	variantRow: {
		padding: omSpacing.m,
		borderRadius: omRadius.m,
		backgroundColor: omColors.grayscale850,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
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
		color: omTheme.primaryText,
	},
	statusPill: {
		paddingHorizontal: omSpacing.s,
		paddingVertical: omSpacing.xs,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(255,255,255,0.08)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
	},
	statusText: {
		color: omColors.grayscale300,
		textTransform: 'capitalize',
	},
	variantMeta: {
		color: omColors.grayscale500,
	},
	variantDetailBlock: {
		padding: omSpacing.s,
		borderRadius: omRadius.s,
		backgroundColor: 'rgba(255,255,255,0.04)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.06)',
		gap: 2,
	},
	variantDetailText: {
		color: omColors.grayscale300,
	},
	variantNote: {
		color: omColors.grayscale400,
	},
	fileSelectionStack: {
		gap: omSpacing.s,
	},
	selectedFileCard: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: omSpacing.m,
		padding: omSpacing.m,
		borderRadius: omRadius.m,
		backgroundColor: omColors.grayscale850,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
	},
	selectedFileText: {
		flex: 1,
		gap: omSpacing.xs,
	},
	selectedFileTitle: {
		color: omTheme.primaryText,
	},
	selectedFileMeta: {
		color: omColors.grayscale500,
	},
	changeFileButton: {
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(82,168,197,0.12)',
		borderWidth: 1,
		borderColor: 'rgba(82,168,197,0.2)',
	},
	changeFileButtonPressed: {
		opacity: 0.9,
	},
	changeFileButtonText: {
		color: omColors.teal500,
	},
	addFileButton: {
		alignSelf: 'flex-start',
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(255,255,255,0.08)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
	},
	addFileButtonPressed: {
		opacity: 0.9,
	},
	addFileButtonText: {
		color: omTheme.primaryText,
	},
	detailsToggle: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: omSpacing.m,
		paddingHorizontal: omSpacing.xl,
		paddingVertical: omSpacing.l,
		borderRadius: omRadius.l,
		backgroundColor: 'rgba(255,255,255,0.04)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
	},
	detailsTogglePressed: {
		backgroundColor: 'rgba(255,255,255,0.06)',
	},
	detailsToggleText: {
		flex: 1,
		gap: omSpacing.xs,
	},
	detailsToggleAction: {
		color: omColors.teal500,
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
		backgroundColor: omColors.grayscale850,
	},
	emptyTitle: {
		color: omTheme.primaryText,
	},
	emptyBody: {
		color: omColors.grayscale400,
	},
	backLink: {
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(255,255,255,0.08)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
	},
	backLinkText: {
		color: omTheme.primaryText,
	},
})
