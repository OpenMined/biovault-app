import { ExploreCategoryCard } from '@/components/explore/ExploreCategoryCard'
import { exploreCategories, getAssaysForExploreCategory } from '@/lib/explore-categories'
import { omColors, omSpacing } from '@/styles/brand'
import { ScrollView, StyleSheet, View } from 'react-native'

export default function ExploreScreen() {
	return (
		<ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
			<View style={styles.list}>
				{exploreCategories.map((category, index) => (
					<View key={category.slug} style={index > 0 ? styles.rowDivider : undefined}>
						<ExploreCategoryCard
							category={category}
							assayCount={getAssaysForExploreCategory(category.slug).length}
						/>
					</View>
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
		paddingTop: omSpacing.m,
	},
	list: {
		borderBottomWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
	},
	rowDivider: {
		borderTopWidth: 1,
		borderTopColor: 'rgba(255,255,255,0.08)',
	},
})
