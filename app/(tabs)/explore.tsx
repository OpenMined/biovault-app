import { OMText } from '@/components/ui/OMText'
import {
	exploreCategories,
	getAssaysForExploreCategory,
	type ExploreCategoryDefinition,
} from '@/lib/explore-categories'
import { omColors, omRadius, omSpacing, omTheme } from '@/styles/brand'
import { Asset } from 'expo-asset'
import { Link } from 'expo-router'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Circle, Path, SvgUri } from 'react-native-svg'

const chevronRightUri = Asset.fromModule(require('../../assets/images/chevron-right.svg')).uri

function ExploreIllustration({ icon }: { icon: ExploreCategoryDefinition['icon'] }) {
	const stroke = omTheme.accent

	return (
		<View style={styles.iconPanel}>
			<Svg width={36} height={36} viewBox="0 0 24 24" fill="none">
				{icon === 'eye' ? (
					<>
						<Path
							d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"
							stroke={stroke}
							strokeWidth={2}
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
						<Circle cx="12" cy="12" r="3" stroke={stroke} strokeWidth={2} />
					</>
				) : null}
				{icon === 'person-standing' ? (
					<>
						<Circle cx="12" cy="5" r="1" stroke={stroke} strokeWidth={2} />
						<Path d="m9 20 3-6 3 6" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
						<Path d="m6 8 6 2 6-2" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
						<Path d="M12 10v4" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
					</>
				) : null}
				{icon === 'pill' ? (
					<>
						<Path
							d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"
							stroke={stroke}
							strokeWidth={2}
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
						<Path d="m8.5 8.5 7 7" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
					</>
				) : null}
				{icon === 'heart-pulse' ? (
					<>
						<Path
							d="M19.5 13.572 12 21l-7.5-7.428a5 5 0 1 1 7.5-6.566 5 5 0 1 1 7.5 6.572"
							stroke={stroke}
							strokeWidth={2}
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
						<Path d="M3.5 12h4l2-3 3 6 2-3h6" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
					</>
				) : null}
			</Svg>
		</View>
	)
}

function CategoryCard({ category }: { category: ExploreCategoryDefinition }) {
	const assayCount = getAssaysForExploreCategory(category.slug).length
	const assayLabel = `${assayCount} ${assayCount === 1 ? 'assay' : 'assays'}`

	return (
		<Link href={{ pathname: '/explore/[category]', params: { category: category.slug } }} asChild>
			<Pressable style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}>
				<View style={styles.rowMain}>
					<ExploreIllustration icon={category.icon} />

					<View style={styles.rowTextBlock}>
						<View style={styles.rowTitleLine}>
							<OMText variant="headline" style={styles.rowTitle}>
								{category.title}
							</OMText>
							<View style={styles.countBadge}>
								<OMText variant="caption" style={styles.countBadgeText}>
									{assayLabel}
								</OMText>
							</View>
						</View>
						<OMText variant="body" style={styles.rowDescription}>
							{category.description}
						</OMText>
						<OMText variant="caption" style={styles.rowExample}>
							{category.example}
						</OMText>
					</View>
				</View>
				<View style={styles.chevronWrap}>
					<SvgUri uri={chevronRightUri} width={20} height={20} />
				</View>
			</Pressable>
		</Link>
	)
}

export default function ExploreScreen() {
	return (
		<SafeAreaView style={styles.safeArea}>
			<ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
				<View style={styles.hero}>
					<OMText variant="h4" style={styles.pageTitle}>
						Explore
					</OMText>
					<OMText variant="body" style={styles.pageBody}>
						Browse analysis categories and open a category to view its description, example, and available assays.
					</OMText>
				</View>

				<View style={styles.stack}>
					{exploreCategories.map((category) => (
						<CategoryCard key={category.title} category={category} />
					))}
				</View>
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
		gap: omSpacing.xl,
	},
	hero: {
		gap: omSpacing.s,
	},
	pageTitle: {
		color: omTheme.primaryText,
	},
	pageBody: {
		color: omColors.grayscale400,
		lineHeight: 22,
	},
	stack: {
		gap: omSpacing.s,
	},
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: omSpacing.m,
		paddingHorizontal: omSpacing.l,
		paddingVertical: omSpacing.l,
		borderRadius: omRadius.m,
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
	iconPanel: {
		width: 44,
		height: 44,
		borderRadius: omRadius.m,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: omColors.grayscale850,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
	},
	rowTextBlock: {
		flex: 1,
		gap: omSpacing.xs,
	},
	rowTitleLine: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: omSpacing.s,
		paddingTop: 2,
	},
	rowTitle: {
		color: omTheme.primaryText,
		flexShrink: 1,
	},
	rowDescription: {
		color: omColors.grayscale400,
		lineHeight: 20,
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
		opacity: 0.7,
	},
})
