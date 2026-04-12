import { ExploreCategoryCard } from '@/components/explore/ExploreCategoryCard'
import { OMText } from '@/components/ui/OMText'
import { exploreCategories, getAssaysForExploreCategory } from '@/lib/explore-categories'
import { omColors, omSpacing, omTheme } from '@/styles/brand'
import { ScrollView, StyleSheet, View } from 'react-native'

export default function ExploreScreen() {
	return (
		<ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
		gap: omSpacing.m,
	},
	stack: {
		gap: omSpacing.m,
	},
})
