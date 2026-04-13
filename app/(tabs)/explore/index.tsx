import { ActiveDocumentFloatingPicker } from '@/components/explore/ActiveDocumentFloatingPicker'
import { useActiveDocument } from '@/components/explore/ActiveDocumentContext'
import { ExploreAssayCard } from '@/components/explore/ExploreAssayCard'
import { OMButton } from '@/components/ui/OMButton'
import { OMText } from '@/components/ui/OMText'
import type { AssayManifest } from '@/lib/assay-manifests'
import { assessAssayCompatibility } from '@/lib/assay-compatibility'
import { listAvailableAssayManifests } from '@/lib/assay-registry'
import { getAssayTemplate } from '@/lib/assay-templates'
import { getExploreCategory } from '@/lib/explore-categories'
import { isExploreDemoModeEnabledSync, setExploreDemoModeEnabledSync } from '@/lib/demo-mode'
import { listRecentTestRunsForInputDocument, type RecentTestRunSummary } from '@/lib/test-results'
import { omColors, omRadius, omSpacing, omTheme } from '@/styles/brand'
import { useFocusEffect } from '@react-navigation/native'
import { router } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'

const TARGET_GITHUB_REPO = 'github.com/keelancj/exvitae/'

function getCategoryLabel(category: string) {
	return getExploreCategory(category)?.title ?? category
}

function getBadgeLabel(status: string | undefined, hasActiveDocument: boolean) {
	if (!hasActiveDocument) {
		return 'Select file'
	}
	if (status === 'likely-supported') {
		return 'Compatible'
	}
	if (status === 'unlikely') {
		return 'Use another'
	}
	return 'Review'
}

function formatRecentRunLabel(value: string) {
	return `Ran ${new Date(value).toLocaleDateString()}`
}

function getAssaySourceLabel(assay: AssayManifest) {
	return assay.packageSource.source.toLowerCase().includes(TARGET_GITHUB_REPO) ? 'GitHub' : 'Local'
}

export default function ExploreScreen() {
	const { activeDocument, closePicker, importedDocuments, isPickerOpen, selectDocument, togglePicker } =
		useActiveDocument()
	const [isDemoActive, setIsDemoActive] = useState(false)
	const [assays, setAssays] = useState<AssayManifest[]>([])
	const [recentRunsBySlug, setRecentRunsBySlug] = useState<Record<string, RecentTestRunSummary>>({})

	const refreshAssays = useCallback(() => {
		return listAvailableAssayManifests()
			.then(setAssays)
			.catch((error) => {
				console.error('Failed to load assays:', error)
				setAssays([])
			})
	}, [])

	useEffect(() => {
		void refreshAssays()
	}, [refreshAssays])

	useEffect(() => {
		if (!activeDocument) {
			setRecentRunsBySlug({})
			return
		}

		void listRecentTestRunsForInputDocument(activeDocument.id)
			.then((runs) => {
				setRecentRunsBySlug(Object.fromEntries(runs.map((run) => [run.slug, run] as const)))
			})
			.catch((error) => {
				console.error('Failed to load recent assay runs for active file:', error)
				setRecentRunsBySlug({})
			})
	}, [activeDocument])

	const orderedAssays = useMemo(() => {
		const rankCompatibility = (status: string | undefined) =>
			status === 'likely-supported' ? 0 : status === 'unknown' ? 1 : 2

		return [...assays].sort((left, right) => {
			const leftCompatibility = activeDocument ? assessAssayCompatibility(left, activeDocument) : null
			const rightCompatibility = activeDocument ? assessAssayCompatibility(right, activeDocument) : null
			const leftRun = recentRunsBySlug[left.id] ? 0 : 1
			const rightRun = recentRunsBySlug[right.id] ? 0 : 1

			return (
				rankCompatibility(leftCompatibility?.status) - rankCompatibility(rightCompatibility?.status) ||
				leftRun - rightRun ||
				left.title.localeCompare(right.title)
			)
		})
	}, [activeDocument, assays, recentRunsBySlug])

	useFocusEffect(
		useCallback(() => {
			setIsDemoActive(isExploreDemoModeEnabledSync())
			void refreshAssays()
		}, [refreshAssays])
	)

	return (
		<View style={styles.screen}>
			<ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
				<View style={styles.hero}>
					<OMText variant="h3" style={styles.title}>
						Explore Assays
					</OMText>
					<OMText variant="body" style={styles.body}>
						Browse local genomic assays and see what works with your current file.
					</OMText>
					<View style={styles.pickerRow}>
						<ActiveDocumentFloatingPicker
							documents={importedDocuments}
							activeDocumentId={activeDocument?.id ?? null}
							fileName={activeDocument ? activeDocument.name : 'No active file selected'}
							emptyBody="Import a file first to get file-aware assay recommendations."
							isHighlighted={isDemoActive}
							isOpen={isPickerOpen}
							onAddFile={() => {
								closePicker()
								router.push('/data-source')
							}}
							onManageDocument={(document) => {
								closePicker()
								router.push({ pathname: '/files/[documentId]', params: { documentId: document.id } })
							}}
							onSelectDocument={(document) => {
								void selectDocument(document).catch((error) => {
									console.error('Failed to update active file:', error)
								})
							}}
							onToggle={togglePicker}
						/>
					</View>
					{isDemoActive ? (
						<View style={styles.demoCoachmark}>
							<OMText variant="headline" style={styles.demoTitle}>
								Choose the active file
							</OMText>
							<OMText variant="body" style={styles.demoBody}>
								Use this file picker to switch which genome Explore uses for assay compatibility
								and previous-run context.
							</OMText>
							<OMButton
								label="Next"
								onPress={() => {
									setExploreDemoModeEnabledSync(false)
									setIsDemoActive(false)
								}}
								style={styles.demoNextButton}
							/>
						</View>
					) : null}
				</View>

				<View style={styles.listWrap}>
					{isPickerOpen ? <Pressable style={styles.listDismissOverlay} onPress={closePicker} /> : null}
					<View style={styles.list}>
						{orderedAssays.map((assay) => {
							const compatibility = activeDocument ? assessAssayCompatibility(assay, activeDocument) : null
							const recentRun = recentRunsBySlug[assay.id]
							const hasRun = !!recentRun
							const badgeLabel = getBadgeLabel(compatibility?.status, Boolean(activeDocument))
							const badgeTone = compatibility
								? compatibility.status === 'likely-supported'
									? 'good'
									: compatibility.status === 'unlikely'
										? 'weak'
										: 'neutral'
								: 'neutral'
							const summary = compatibility
								? compatibility.summary
								: getAssayTemplate(assay).runSummary
							const sourceLabel = getAssaySourceLabel(assay)

							return (
								<ExploreAssayCard
									key={assay.id}
									title={assay.title}
									body={assay.subtitle}
									summary={`${sourceLabel} • ${getCategoryLabel(assay.category)} • ${summary}`}
									badgeLabel={badgeLabel}
									badgeTone={badgeTone}
									isPreviouslyRun={hasRun}
									recentRunLabel={recentRun ? formatRecentRunLabel(recentRun.ranAt) : null}
									href={{
										pathname: '/tests/[slug]',
										params: {
											slug: assay.id,
											...(activeDocument ? { documentId: activeDocument.id } : {}),
											...(hasRun ? { showResults: 'true' } : {}),
										},
									}}
								/>
							)
						})}
					</View>
				</View>
			</ScrollView>
		</View>
	)
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
		backgroundColor: omColors.grayscale850,
	},
	content: {
		paddingHorizontal: omSpacing.xl,
		paddingTop: omSpacing.xl,
		paddingBottom: omSpacing.xxxl,
		gap: omSpacing.xl,
	},
	hero: {
		gap: 0,
	},
	title: {
		color: omTheme.primaryText,
		maxWidth: 340,
	},
	body: {
		marginTop: omSpacing.s,
		color: omColors.grayscale400,
		maxWidth: 360,
		fontSize: 17,
		lineHeight: 24,
	},
	pickerRow: {
		marginTop: omSpacing.s,
	},
	demoCoachmark: {
		marginTop: omSpacing.m,
		padding: omSpacing.l,
		borderRadius: omRadius.l,
		backgroundColor: 'rgba(9,15,28,0.96)',
		borderWidth: 1,
		borderColor: 'rgba(82,168,197,0.45)',
	},
	demoTitle: {
		color: omColors.grayscale00,
		marginBottom: omSpacing.s,
	},
	demoBody: {
		color: omColors.grayscale150,
		lineHeight: 22,
	},
	demoNextButton: {
		marginTop: omSpacing.l,
	},
	listWrap: {
		position: 'relative',
	},
	list: {
		gap: omSpacing.s,
	},
	listDismissOverlay: {
		...StyleSheet.absoluteFillObject,
		zIndex: 10,
	},
})
