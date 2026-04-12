import { ExploreCategoryCard } from '@/components/explore/ExploreCategoryCard'
import { OMText } from '@/components/ui/OMText'
import { exploreCategories, getAssaysForExploreCategory } from '@/lib/explore-categories'
import { omColors, omSpacing, omTheme } from '@/styles/brand'
import { ScrollView, StyleSheet, View } from 'react-native'

export default function ExploreScreen() {
	return (
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
					<ExploreCategoryCard
						key={category.slug}
						category={category}
						assayCount={getAssaysForExploreCategory(category.slug).length}
					/>
				))}
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
})
