import { ExploreAssayCard } from '@/components/explore/ExploreAssayCard'
import { useExploreLayoutContext } from '@/components/explore/ExploreLayoutContext'
import { assessAssayCompatibility } from '@/lib/assay-compatibility'
import { listAvailableAssayManifestsSync } from '@/lib/assay-registry'
import { getExploreCategory } from '@/lib/explore-categories'
import { listRecentTestRunsForInputDocument, type RecentTestRunSummary } from '@/lib/test-results'
import { omColors, omSpacing } from '@/styles/brand'
import { useEffect, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'

function getCategoryLabel(category: string) {
	return getExploreCategory(category)?.title ?? category
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
			<View style={styles.list}>
				{orderedAssays.map((assay) => {
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
							summary={`${getCategoryLabel(assay.category)} • ${summary}`}
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
		paddingTop: omSpacing.xs,
		paddingBottom: omSpacing.xxxl,
	},
	list: {
		gap: omSpacing.s,
	},
})
