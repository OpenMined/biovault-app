import { ExploreAssayCard } from '@/components/explore/ExploreAssayCard'
import { useExploreLayoutContext } from '@/components/explore/ExploreLayoutContext'
import { OMText } from '@/components/ui/OMText'
import type { AssayManifest } from '@/lib/assay-manifests'
import { assessAssayCompatibility } from '@/lib/assay-compatibility'
import {
	getAssaysForExploreCategory,
	getExploreCategory,
	type ExploreCategorySlug,
} from '@/lib/explore-categories'
import { listAvailableAssayManifests } from '@/lib/assay-registry'
import { getAssayTemplate } from '@/lib/assay-templates'
import { listRecentTestRunsForInputDocument, type RecentTestRunSummary } from '@/lib/test-results'
import { omColors, omRadius, omSpacing, omTheme } from '@/styles/brand'
import { useFocusEffect } from '@react-navigation/native'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'

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

export default function ExploreCategoryScreen() {
	const params = useLocalSearchParams<{ category?: string }>()
	const category = params.category ? getExploreCategory(params.category) : null
	const { activeDocument } = useExploreLayoutContext()
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

	useFocusEffect(
		useCallback(() => {
			void refreshAssays()
		}, [refreshAssays])
	)

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

	const sortedAssays = useMemo(() => {
		const filteredAssays = category ? getAssaysForExploreCategory(assays, category.slug as ExploreCategorySlug) : []
		return [...filteredAssays].sort((left, right) => {
			const leftCompatibility = activeDocument ? assessAssayCompatibility(left, activeDocument).status : 'unknown'
			const rightCompatibility = activeDocument ? assessAssayCompatibility(right, activeDocument).status : 'unknown'
			const rank = (status: string) => (status === 'likely-supported' ? 0 : status === 'unknown' ? 1 : 2)
			const leftRun = recentRunsBySlug[left.id] ? 0 : 1
			const rightRun = recentRunsBySlug[right.id] ? 0 : 1

			return rank(leftCompatibility) - rank(rightCompatibility) || leftRun - rightRun || left.title.localeCompare(right.title)
		})
	}, [activeDocument, assays, category, recentRunsBySlug])

	if (!category) {
		return (
			<View style={styles.emptyState}>
				<OMText variant="h4" style={styles.emptyTitle}>
					Category not found
				</OMText>
				<Pressable onPress={() => router.back()} style={styles.backButton}>
					<OMText variant="subtitle" style={styles.backButtonText}>
						Back
					</OMText>
				</Pressable>
			</View>
		)
	}

	return (
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
					{category.subtitle.toUpperCase()}
				</OMText>
				<OMText variant="h3" style={styles.title}>
					{category.title}
				</OMText>
				<OMText variant="body" style={styles.body}>
					{category.description}
				</OMText>
			</View>

			<OMText variant="caption" style={styles.sectionLabel}>
				AVAILABLE ASSAYS
			</OMText>

			{sortedAssays.length ? (
				<View style={styles.stack}>
					{sortedAssays.map((assay) => {
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

						return (
							<ExploreAssayCard
								key={assay.id}
								title={assay.title}
								body={assay.subtitle}
								summary={summary}
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
			) : (
				<View style={styles.emptyCard}>
					<OMText variant="headline" style={styles.emptyCardTitle}>
						No analyses yet
					</OMText>
					<OMText variant="body" style={styles.emptyCardBody}>
						This category is in place, but no bundled analyses are assigned to it yet.
					</OMText>
				</View>
			)}
		</ScrollView>
	)
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
		backgroundColor: omColors.grayscale850,
	},
	content: {
		paddingHorizontal: omSpacing.xl,
		paddingBottom: omSpacing.xxxl,
		gap: omSpacing.l,
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
		gap: omSpacing.s,
	},
	eyebrow: {
		alignSelf: 'flex-start',
		color: omColors.teal500,
		letterSpacing: 0.8,
	},
	title: {
		color: omTheme.primaryText,
	},
	body: {
		color: omColors.grayscale400,
		maxWidth: 360,
		lineHeight: 22,
	},
	sectionLabel: {
		color: omColors.grayscale500,
		textTransform: 'uppercase',
		letterSpacing: 0.8,
	},
	stack: {
		gap: omSpacing.m,
	},
	emptyCard: {
		padding: omSpacing.xl,
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.1)',
		gap: omSpacing.s,
	},
	emptyCardTitle: {
		color: omTheme.primaryText,
	},
	emptyCardBody: {
		color: omColors.grayscale400,
	},
	emptyState: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		padding: omSpacing.xl,
		gap: omSpacing.l,
		backgroundColor: omColors.grayscale850,
	},
	emptyTitle: {
		color: omTheme.primaryText,
	},
})
