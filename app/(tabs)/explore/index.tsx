import { ExploreAssayCard } from '@/components/explore/ExploreAssayCard'
import { useExploreLayoutContext } from '@/components/explore/ExploreLayoutContext'
import { OMText } from '@/components/ui/OMText'
import { assessAssayCompatibility } from '@/lib/assay-compatibility'
import { listAvailableAssayManifestsSync } from '@/lib/assay-registry'
import { getExploreCategory } from '@/lib/explore-categories'
import { listRecentTestRunsForInputDocument, type RecentTestRunSummary } from '@/lib/test-results'
import { omColors, omRadius, omSpacing, omTheme } from '@/styles/brand'
import { useEffect, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'

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

export default function ExploreScreen() {
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

	const assays = useMemo(() => listAvailableAssayManifestsSync(), [])

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

	return (
		<ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
			<View style={styles.hero}>
				<OMText variant="caption" style={styles.eyebrow}>
					EXPLORE
				</OMText>
				<OMText variant="h3" style={styles.title}>
					Explore Assays
				</OMText>
				<OMText variant="body" style={styles.body}>
					Browse local genomic assays and see what works with your current file.
				</OMText>
			</View>

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
						: assay.runMode === 'bioscript'
							? 'Runs locally on device through Bioscript.'
							: 'Preview assay for now.'

					return (
						<ExploreAssayCard
							key={assay.id}
							title={assay.title}
							body={assay.subtitle}
							summary={`${getCategoryLabel(assay.category)} • ${summary}`}
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
		paddingTop: omSpacing.xl,
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
	list: {
		gap: omSpacing.s,
	},
})
