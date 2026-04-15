import { OMIcon } from '@/components/ui/OMIcon'
import { OMText } from '@/components/ui/OMText'
import {
	loadHomeImportState,
	saveHomeImportState,
	type HomeImportedDocument,
	type ImportInspectionRecord,
} from '@/lib/home-import'
import {
	checkPermission,
	deleteHandles,
	ensurePermission,
	getHandles,
	type HandleBundle,
	type HandlePermission,
} from '@/lib/file-handle-store'
import type { Inspection } from '@/widgets/FilePicker'
import { listRecentTestRunsForInputDocument, type RecentTestRunSummary } from '@/lib/test-results'
import { omColors, omRadius, omSpacing, omTheme } from '@/styles/brand'
import { Link, router, useLocalSearchParams } from 'expo-router'
import { deleteAsync } from 'expo-file-system/legacy'
import { useEffect, useState } from 'react'
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function ImportedFileScreen() {
	const params = useLocalSearchParams<{ documentId?: string }>()
	const [document, setDocument] = useState<HomeImportedDocument | null>(null)
	const [recentRuns, setRecentRuns] = useState<RecentTestRunSummary[]>([])

	useEffect(() => {
		if (!params.documentId) {
			setDocument(null)
			setRecentRuns([])
			return
		}

		void loadHomeImportState()
			.then((state) => {
				const nextDocument =
					state.importedDocuments.find((item) => item.id === params.documentId) ?? null
				setDocument(nextDocument)
			})
			.catch((error) => {
				console.error('Failed to load imported file:', error)
				setDocument(null)
			})

		void listRecentTestRunsForInputDocument(params.documentId)
			.then(setRecentRuns)
			.catch((error) => {
				console.error('Failed to load recent runs for file:', error)
				setRecentRuns([])
			})
	}, [params.documentId])

	const handleDelete = () => {
		if (!document) {
			return
		}

		const doDelete = async () => {
			try {
				if (Platform.OS !== 'web' && document.uri && !document.uri.startsWith('biovault://')) {
					await deleteAsync(document.uri, { idempotent: true })
				}
			} catch (error) {
				console.error('Failed to delete stored document:', error)
			}
			const state = await loadHomeImportState()
			const nextDocuments = state.importedDocuments.filter((item) => item.id !== document.id)
			saveHomeImportState({
				activeImportedDocumentId: nextDocuments[0]?.id ?? null,
				dataSource: null,
				importedDocuments: nextDocuments,
			})
			if (Platform.OS === 'web') {
				void deleteHandles(document.id)
			}
			router.replace('/(tabs)/home')
		}

		if (Platform.OS === 'web') {
			// Alert.alert on react-native-web drops the action buttons, so the
			// destructive callback never fires. Fall back to a native window.confirm.
			if (typeof window !== 'undefined' && window.confirm(`Remove "${document.name}" from local storage?`)) {
				void doDelete()
			}
			return
		}

		Alert.alert('Delete imported file', `Remove "${document.name}" from local storage?`, [
			{ text: 'Cancel', style: 'cancel' },
			{
				text: 'Delete',
				style: 'destructive',
				onPress: () => {
					void doDelete()
				},
			},
		])
	}

	if (!document) {
		return (
			<SafeAreaView style={styles.safeArea}>
				<View style={styles.missingState}>
					<OMText variant="h4" style={styles.missingTitle}>
						File not found
					</OMText>
					<Pressable onPress={() => router.replace('/(tabs)/home')} style={styles.backButton}>
						<OMText variant="subtitle" style={styles.backButtonText}>
							Back to files
						</OMText>
					</Pressable>
				</View>
			</SafeAreaView>
		)
	}

	return (
		<SafeAreaView style={styles.safeArea} edges={['top']}>
			<ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
					<View style={styles.topBar}>
						<Pressable onPress={() => router.back()} style={styles.backButton}>
							<OMText variant="subtitle" style={styles.backButtonText}>
								Back
							</OMText>
						</Pressable>
					</View>

					<View style={styles.hero}>
						<OMText variant="caption" style={styles.eyebrow}>
							FILE
						</OMText>
						<View style={styles.titleRow}>
							<OMText variant="h3" style={styles.title}>
								{document.name}
							</OMText>
							<Pressable
								onPress={() =>
									router.push({
										pathname: '/files/[documentId]/rename',
										params: { documentId: document.id },
									})
								}
								style={styles.renameButton}
							>
								<OMIcon name="pencil" size={18} tone="inverse" />
							</Pressable>
						</View>
						<OMText variant="body" style={styles.body}>
							Review recent assay results for this file here. To run an assay, browse assays from Explore and
							select this file there.
						</OMText>
					</View>

					<HeuristicsSection document={document} />

					{Platform.OS === 'web' ? <LinkedFileSection documentId={document.id} /> : null}

					<View style={styles.group}>
						<OMText variant="caption" style={styles.groupLabel}>
							RECENT RESULTS
						</OMText>
						{recentRuns.length ? (
							<View style={styles.listSurface}>
								{recentRuns.map((run, index) => (
									<View key={run.id} style={index > 0 ? styles.rowDivider : undefined}>
										<Link
											href={{
												pathname: '/tests/[slug]',
												params: { slug: run.slug, documentId: document.id },
											}}
											asChild
										>
											<Pressable style={({ pressed }) => [styles.testRow, pressed ? styles.testRowPressed : null]}>
												<View style={styles.testRowText}>
													<OMText variant="headline" style={styles.testTitle}>
														{run.testTitle}
													</OMText>
													<OMText variant="caption" style={styles.resultMeta}>
														{new Date(run.ranAt).toLocaleString()} • {run.rowCount} rows
													</OMText>
												</View>
												<OMText variant="subtitle" style={styles.openText}>
													Open
												</OMText>
											</Pressable>
										</Link>
									</View>
								))}
							</View>
						) : (
							<View style={styles.emptyResultsCard}>
								<OMText variant="body" style={styles.emptyResultsBody}>
									No results for this file yet.
								</OMText>
							</View>
						)}
					</View>

					<View style={styles.bottomActionRow}>
						<Pressable onPress={handleDelete} style={styles.deleteButton}>
							<OMText variant="subtitle" style={styles.deleteButtonText}>
								Delete File
							</OMText>
						</Pressable>
					</View>
			</ScrollView>
		</SafeAreaView>
	)
}

function LinkedFileSection({ documentId }: { documentId: string }) {
	const [bundle, setBundle] = useState<HandleBundle | null>(null)
	const [permission, setPermission] = useState<HandlePermission>('unsupported')
	const [verified, setVerified] = useState<{ size: number; lastModified: number } | null>(null)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		void (async () => {
			const b = await getHandles(documentId)
			setBundle(b)
			if (b?.primary) {
				setPermission(await checkPermission(b.primary))
			}
		})()
	}, [documentId])

	if (!bundle?.primary) return null

	const verify = async () => {
		setError(null)
		try {
			const state = await ensurePermission(bundle.primary)
			setPermission(state)
			if (state !== 'granted') {
				setError(`Permission state: ${state}`)
				return
			}
			const f = await bundle.primary!.getFile()
			setVerified({ size: f.size, lastModified: f.lastModified })
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err))
		}
	}

	const unlink = async () => {
		await deleteHandles(documentId)
		setBundle(null)
	}

	return (
		<View style={styles.group}>
			<OMText variant="caption" style={styles.groupLabel}>
				LINKED FILE (NO COPY)
			</OMText>
			<View style={styles.inspectionCard}>
				<InspectionRow label="Primary" value={bundle.primary.name} />
				{bundle.reference ? (
					<InspectionRow label="Reference" value={bundle.reference.name} />
				) : null}
				<InspectionRow label="Permission" value={permission} />
				{verified ? (
					<>
						<InspectionRow label="Verified size" value={`${verified.size.toLocaleString()} bytes`} />
						<InspectionRow
							label="Last modified"
							value={new Date(verified.lastModified).toLocaleString()}
						/>
					</>
				) : null}
				{error ? <InspectionRow label="Error" value={error} /> : null}
				<View style={styles.linkedActions}>
					<Pressable onPress={() => void verify()} style={styles.linkedPrimary}>
						<OMText variant="subtitle" style={styles.linkedPrimaryText}>
							Verify access
						</OMText>
					</Pressable>
					<Pressable onPress={() => void unlink()} style={styles.linkedSecondary}>
						<OMText variant="subtitle" style={styles.linkedSecondaryText}>
							Unlink
						</OMText>
					</Pressable>
				</View>
			</View>
		</View>
	)
}

function parseInspectionRecord(json: string | null | undefined): ImportInspectionRecord | null {
	if (!json) return null
	try {
		return JSON.parse(json) as ImportInspectionRecord
	} catch {
		return null
	}
}

function HeuristicsSection({ document }: { document: HomeImportedDocument }) {
	const record = parseInspectionRecord(document.inspectionJson)
	if (!record?.inspection) return null
	const insp = record.inspection as Inspection
	return (
		<View style={styles.group}>
			<OMText variant="caption" style={styles.groupLabel}>
				DETECTED AT IMPORT
			</OMText>
			<View style={styles.inspectionCard}>
				<InspectionRow label="Type" value={renderKind(insp.detectedKind)} />
				<InspectionRow label="Confidence" value={insp.confidence.replace('_', ' ')} />
				<InspectionRow label="Container" value={insp.container} />
				{insp.selectedEntry ? <InspectionRow label="Zip entry" value={insp.selectedEntry} /> : null}
				{insp.source ? (
					<>
						<InspectionRow
							label="Vendor"
							value={`${insp.source.vendor}${insp.source.platformVersion ? ` ${insp.source.platformVersion}` : ''}`}
						/>
						<InspectionRow
							label="Vendor confidence"
							value={insp.source.confidence.replace('_', ' ')}
						/>
						{insp.source.evidence?.length ? (
							<InspectionRow label="Vendor evidence" value={insp.source.evidence.join(' · ')} />
						) : null}
					</>
				) : null}
				{insp.assembly ? <InspectionRow label="Assembly" value={insp.assembly.toUpperCase()} /> : null}
				{insp.phased !== undefined ? (
					<InspectionRow label="Phased" value={insp.phased ? 'yes' : 'no'} />
				) : null}
				{record.reference ? (
					<>
						<InspectionRow label="Reference" value={record.reference.name} />
						{record.reference.matches !== undefined ? (
							<InspectionRow
								label="Reference matches"
								value={record.reference.matches ? 'yes' : 'no'}
							/>
						) : null}
					</>
				) : null}
				{insp.evidence?.length ? (
					<InspectionRow label="Evidence" value={insp.evidence.join(' · ')} />
				) : null}
				{insp.warnings?.length ? (
					<InspectionRow label="Warnings" value={insp.warnings.join(' · ')} />
				) : null}
			</View>
		</View>
	)
}

function InspectionRow({ label, value }: { label: string; value: string }) {
	return (
		<View style={styles.inspectionRow}>
			<OMText variant="caption" style={styles.inspectionRowLabel}>
				{label}
			</OMText>
			<OMText variant="body" style={styles.inspectionRowValue}>
				{value}
			</OMText>
		</View>
	)
}

function renderKind(kind: Inspection['detectedKind']): string {
	switch (kind) {
		case 'genotype_text':
			return 'Genotype (text)'
		case 'vcf':
			return 'VCF'
		case 'alignment_cram':
			return 'CRAM alignment'
		case 'alignment_bam':
			return 'BAM alignment'
		case 'reference_fasta':
			return 'Reference FASTA'
		default:
			return 'Unknown'
	}
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
	topBar: {
		alignItems: 'flex-start',
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
		maxWidth: 320,
	},
	titleRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: omSpacing.m,
	},
	body: {
		color: omColors.grayscale400,
		maxWidth: 360,
		fontSize: 17,
		lineHeight: 24,
	},
	deleteButton: {
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.full,
		backgroundColor: omTheme.dangerSurface,
		borderWidth: 1,
		borderColor: omTheme.dangerBorder,
	},
	deleteButtonText: {
		color: omTheme.dangerText,
	},
	bottomActionRow: {
		paddingTop: omSpacing.s,
		alignItems: 'flex-start',
	},
	renameButton: {
		width: 36,
		height: 36,
		borderRadius: omRadius.full,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: 'rgba(255,255,255,0.08)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.12)',
	},
	group: {
		gap: omSpacing.s,
	},
	groupLabel: {
		color: omColors.grayscale500,
		letterSpacing: 0.8,
	},
	listSurface: {
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.1)',
		overflow: 'hidden',
	},
	inspectionCard: {
		padding: omSpacing.l,
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.1)',
		gap: omSpacing.s,
	},
	inspectionRow: {
		flexDirection: 'row',
		gap: omSpacing.m,
		alignItems: 'flex-start',
	},
	inspectionRowLabel: {
		color: omColors.grayscale500,
		width: 140,
	},
	inspectionRowValue: {
		color: omTheme.primaryText,
		flex: 1,
	},
	linkedActions: {
		flexDirection: 'row',
		gap: omSpacing.s,
		marginTop: omSpacing.s,
	},
	linkedPrimary: {
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.full,
		backgroundColor: 'rgba(83,190,169,0.14)',
		borderWidth: 1,
		borderColor: 'rgba(83,190,169,0.28)',
	},
	linkedPrimaryText: { color: omTheme.accent },
	linkedSecondary: {
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.full,
		backgroundColor: 'rgba(255,255,255,0.06)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.12)',
	},
	linkedSecondaryText: { color: omColors.grayscale300 },
	rowDivider: {
		borderTopWidth: 1,
		borderTopColor: 'rgba(255,255,255,0.08)',
	},
	testRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: omSpacing.l,
		paddingHorizontal: omSpacing.l,
		paddingVertical: omSpacing.l,
	},
	testRowPressed: {
		backgroundColor: 'rgba(255,255,255,0.04)',
	},
	testRowText: {
		flex: 1,
		gap: omSpacing.xs,
	},
	testTitle: {
		color: omTheme.primaryText,
	},
	testSubtitle: {
		color: omColors.grayscale400,
	},
	resultMeta: {
		color: omColors.grayscale500,
	},
	openText: {
		color: omTheme.accent,
	},
	emptyResultsCard: {
		paddingHorizontal: omSpacing.l,
		paddingVertical: omSpacing.l,
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.1)',
	},
	emptyResultsBody: {
		color: omColors.grayscale400,
	},
	missingState: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		padding: omSpacing.xl,
		gap: omSpacing.l,
	},
	missingTitle: {
		color: omTheme.primaryText,
	},
})
