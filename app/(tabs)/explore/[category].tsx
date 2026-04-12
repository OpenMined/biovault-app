import { ExploreAssayCard } from '@/components/explore/ExploreAssayCard'
import { useExploreLayoutContext } from '@/components/explore/ExploreLayoutContext'
import { OMText } from '@/components/ui/OMText'
import { assessAssayCompatibility } from '@/lib/assay-compatibility'
import {
	getAssaysForExploreCategory,
	getExploreCategory,
	type ExploreCategorySlug,
} from '@/lib/explore-categories'
import { listRecentTestRunsForInputDocument, type RecentTestRunSummary } from '@/lib/test-results'
import { omColors, omRadius, omSpacing, omTheme } from '@/styles/brand'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'

export default function ExploreCategoryScreen() {
	const params = useLocalSearchParams<{ category?: string }>()
	const category = params.category ? getExploreCategory(params.category) : null
	const assays = category ? getAssaysForExploreCategory(category.slug as ExploreCategorySlug) : []
	const { activeDocument } = useExploreLayoutContext()
	const [recentRunsBySlug, setRecentRunsBySlug] = useState<Record<string, RecentTestRunSummary>>({})

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
		return [...assays].sort((left, right) => {
			const leftCompatibility = activeDocument ? assessAssayCompatibility(left, activeDocument).status : 'unknown'
			const rightCompatibility = activeDocument ? assessAssayCompatibility(right, activeDocument).status : 'unknown'
			const rank = (status: string) => (status === 'likely-supported' ? 0 : status === 'unknown' ? 1 : 2)
			const leftRun = recentRunsBySlug[left.id] ? 0 : 1
			const rightRun = recentRunsBySlug[right.id] ? 0 : 1

			return rank(leftCompatibility) - rank(rightCompatibility) || leftRun - rightRun || left.title.localeCompare(right.title)
		})
	}, [activeDocument, assays, recentRunsBySlug])

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
					{category.title.toUpperCase()}
				</OMText>
				<OMText variant="h3" style={styles.title}>
					{category.title}
				</OMText>
				<View style={styles.heroCopy}>
					<OMText variant="body" style={styles.body}>
						{category.description}
					</OMText>
					<OMText variant="body" style={styles.example}>
						{category.example}
					</OMText>
				</View>
			</View>

			{sortedAssays.length ? (
				<View style={styles.stack}>
					{sortedAssays.map((assay) => {
						const compatibility = activeDocument ? assessAssayCompatibility(assay, activeDocument) : null
						const recentRun = recentRunsBySlug[assay.id]
						const hasRun = !!recentRun
						const badgeLabel = compatibility
							? compatibility.status === 'likely-supported'
								? 'Works with your file'
								: compatibility.status === 'unlikely'
									? 'Better with another file'
									: 'Needs review'
							: 'Pick a file to check'
						const badgeTone = compatibility
							? compatibility.status === 'likely-supported'
								? 'good'
								: compatibility.status === 'unlikely'
									? 'weak'
									: 'neutral'
							: 'neutral'
						const summary = compatibility
							? compatibility.summary
							: assay.runMode === 'bioscript'
								? 'Runs locally on device through Bioscript.'
								: 'Preview assay for now.'

						return (
							<ExploreAssayCard
								key={assay.id}
								title={assay.title}
								body={assay.subtitle}
								summary={summary}
								badgeLabel={badgeLabel}
								badgeTone={badgeTone}
								isPreviouslyRun={hasRun}
								recentRunLabel={
									recentRun ? `Latest result on this file: ${new Date(recentRun.ranAt).toLocaleDateString()}` : null
								}
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
	},
	heroCopy: {
		gap: omSpacing.s,
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
	},
	body: {
		color: omColors.grayscale400,
		maxWidth: 360,
		fontSize: 17,
		lineHeight: 24,
	},
	example: {
		color: omTheme.primaryText,
		maxWidth: 360,
		fontSize: 17,
		lineHeight: 24,
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
