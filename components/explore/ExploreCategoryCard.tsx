import { OMText } from '@/components/ui/OMText'
import type { ExploreCategoryDefinition } from '@/lib/explore-categories'
import { omColors, omSpacing, omTheme } from '@/styles/brand'
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

function getCompactDescription(category: ExploreCategoryDefinition) {
	switch (category.slug) {
		case 'traits':
			return 'Visible traits and common inherited features'
		case 'ancestry':
			return 'Lineage and population views from your genomic file'
		case 'pgx':
			return 'Medication response analyses linked to known variants'
		case 'health-risk':
			return 'Inherited risk and prevention-oriented screening'
	}
}

export function ExploreCategoryCard({ assayCount, category }: Props) {
	const assayLabel = `${assayCount} ${assayCount === 1 ? 'assay' : 'assays'}`

	return (
		<Link href={{ pathname: '/explore/[category]', params: { category: category.slug } }} asChild>
			<Pressable style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}>
				<View style={styles.content}>
					<View style={styles.titleRow}>
						<View style={styles.titleMeta}>
							<View style={styles.titleWithIcon}>
								<OMText variant="h4" style={styles.title}>
									{category.title}
								</OMText>
								<ExploreIllustration icon={category.icon} size={34} framed={false} />
							</View>
							<OMText variant="caption" style={styles.count}>
								{assayLabel}
							</OMText>
						</View>
						<SvgUri uri={chevronRightUri} width={18} height={18} color={omColors.grayscale400} />
					</View>
					<OMText variant="body" style={styles.description}>
						{getCompactDescription(category)}
					</OMText>
				</View>
			</Pressable>
		</Link>
	)
}

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: omSpacing.m,
		paddingVertical: omSpacing.xxl,
	},
	rowPressed: {
		opacity: 0.82,
	},
	content: {
		flex: 1,
		gap: omSpacing.s,
	},
	titleRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: omSpacing.m,
	},
	titleMeta: {
		flexDirection: 'row',
		alignItems: 'center',
		flex: 1,
		justifyContent: 'space-between',
		gap: omSpacing.m,
	},
	titleWithIcon: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: omSpacing.m,
		flexShrink: 1,
	},
	title: {
		color: omTheme.primaryText,
		flexShrink: 1,
	},
	count: {
		color: omColors.grayscale500,
	},
	description: {
		color: omColors.grayscale400,
		lineHeight: 22,
	},
})
