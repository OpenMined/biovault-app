import { OMText } from '@/components/ui/OMText'
import type { ExploreCategoryDefinition } from '@/lib/explore-categories'
import { omColors, omRadius, omSpacing, omTheme } from '@/styles/brand'
import { Asset } from 'expo-asset'
import { Link } from 'expo-router'
import { Pressable, StyleSheet, View } from 'react-native'
import { SvgUri } from 'react-native-svg'
import { ExploreIllustration } from './ExploreIllustration'

const chevronRightUri = Asset.fromModule(require('../../assets/images/chevron-right.svg')).uri

type Props = {
	assayCount: number
	category: ExploreCategoryDefinition
}

export function ExploreCategoryCard({ assayCount, category }: Props) {
	const assayLabel = `${assayCount} ${assayCount === 1 ? 'assay' : 'assays'}`

	return (
		<Link href={{ pathname: '/explore/[category]', params: { category: category.slug } }} asChild>
			<Pressable style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}>
				<View style={styles.rowMain}>
					<ExploreIllustration icon={category.icon} />
					<View style={styles.rowTextBlock}>
						<OMText variant="caption" style={styles.rowSubtitle}>
							{category.subtitle}
						</OMText>
						<View style={styles.rowTitleLine}>
							<OMText variant="h4" style={styles.rowTitle}>
								{category.title}
							</OMText>
						</View>
						<OMText variant="body" style={styles.rowDescription}>
							{category.description}
						</OMText>
						<View style={styles.rowFooter}>
							<View style={styles.countBadge}>
								<OMText variant="caption" style={styles.countBadgeText}>
									{assayLabel}
								</OMText>
							</View>
							<OMText variant="caption" style={styles.rowExample}>
								{category.example}
							</OMText>
						</View>
					</View>
				</View>
				<View style={styles.chevronWrap}>
					<SvgUri uri={chevronRightUri} width={20} height={20} />
				</View>
			</Pressable>
		</Link>
	)
}

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		gap: omSpacing.m,
		paddingHorizontal: omSpacing.l,
		paddingVertical: omSpacing.xl,
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
	},
	rowPressed: {
		backgroundColor: omColors.grayscale700,
		borderColor: 'rgba(255,255,255,0.12)',
	},
	rowMain: {
		flex: 1,
		flexDirection: 'row',
		alignItems: 'flex-start',
		gap: omSpacing.m,
	},
	rowTextBlock: {
		flex: 1,
		gap: omSpacing.s,
		paddingTop: 2,
	},
	rowSubtitle: {
		color: omColors.teal500,
		textTransform: 'uppercase',
		letterSpacing: 0.8,
	},
	rowTitleLine: {
		gap: omSpacing.xs,
	},
	rowTitle: {
		color: omTheme.primaryText,
		flexShrink: 1,
	},
	rowDescription: {
		color: omColors.grayscale400,
		lineHeight: 22,
	},
	rowFooter: {
		flexDirection: 'row',
		alignItems: 'center',
		flexWrap: 'wrap',
		gap: omSpacing.s,
	},
	rowExample: {
		color: omColors.grayscale500,
	},
	countBadge: {
		paddingHorizontal: omSpacing.s,
		paddingVertical: 4,
		borderRadius: omRadius.s,
		backgroundColor: omColors.grayscale850,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
	},
	countBadgeText: {
		color: omColors.grayscale400,
	},
	chevronWrap: {
		alignItems: 'center',
		justifyContent: 'center',
		paddingTop: omSpacing.s,
		opacity: 0.7,
	},
})
