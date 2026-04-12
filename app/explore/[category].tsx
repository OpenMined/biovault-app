import { OMText } from '@/components/ui/OMText'
import {
	getAssaysForExploreCategory,
	getExploreCategory,
	type ExploreCategorySlug,
} from '@/lib/explore-categories'
import { omColors, omRadius, omSpacing, omTheme } from '@/styles/brand'
import { Link, router, useLocalSearchParams } from 'expo-router'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function ExploreCategoryScreen() {
	const params = useLocalSearchParams<{ category?: string }>()
	const category = params.category ? getExploreCategory(params.category) : null
	const assays = category ? getAssaysForExploreCategory(category.slug as ExploreCategorySlug) : []

	if (!category) {
		return (
			<SafeAreaView style={styles.safeArea}>
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
			</SafeAreaView>
		)
	}

	return (
		<SafeAreaView style={styles.safeArea} edges={['top']}>
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

				{assays.length ? (
					<View style={styles.stack}>
						{assays.map((assay) => (
							<Link key={assay.id} href={{ pathname: '/tests/[slug]', params: { slug: assay.id } }} asChild>
								<Pressable style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}>
									<OMText variant="headline" style={styles.cardTitle}>
										{assay.title}
									</OMText>
									<OMText variant="body" style={styles.cardBody}>
										{assay.subtitle}
									</OMText>
									<OMText variant="caption" style={styles.cardMeta}>
										{assay.runMode === 'bioscript' ? 'Local Bioscript run' : 'Preview rows'}
									</OMText>
								</Pressable>
							</Link>
						))}
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
		paddingTop: omSpacing.m,
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
	card: {
		padding: omSpacing.xl,
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.1)',
	},
	cardPressed: {
		backgroundColor: 'rgba(255,255,255,0.04)',
	},
	cardTitle: {
		color: omTheme.primaryText,
	},
	cardBody: {
		marginTop: omSpacing.s,
		color: omColors.grayscale400,
	},
	cardMeta: {
		marginTop: omSpacing.m,
		color: omColors.grayscale500,
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
	},
	emptyTitle: {
		color: omTheme.primaryText,
	},
})
