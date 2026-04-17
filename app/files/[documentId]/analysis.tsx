import { OMText } from '@/components/ui/OMText'
import { exploreCategories } from '@/lib/explore-categories'
import { loadHomeImportState, type HomeImportedDocument } from '@/lib/home-import'
import { omColors, omRadius, omSpacing, omTheme } from '@/styles/brand'
import { Link, router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function FileAnalysisScreen() {
	const params = useLocalSearchParams<{ documentId?: string }>()
	const [document, setDocument] = useState<HomeImportedDocument | null>(null)

	useEffect(() => {
		if (!params.documentId) {
			setDocument(null)
			return
		}

		void loadHomeImportState()
			.then((state) => {
				setDocument(state.importedDocuments.find((item) => item.id === params.documentId) ?? null)
			})
			.catch((error) => {
				console.error('Failed to load file for analysis:', error)
				setDocument(null)
			})
	}, [params.documentId])

	if (!document) {
		return (
			<SafeAreaView style={styles.safeArea}>
				<View style={styles.emptyState}>
					<OMText variant="h4" style={styles.emptyTitle}>
						File not found
					</OMText>
					<Pressable onPress={() => router.replace('/(tabs)/files')} style={styles.backButton}>
						<OMText variant="subtitle" style={styles.backButtonText}>
							Back to files
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
						ANALYSIS
					</OMText>
					<OMText variant="h3" style={styles.title}>
						Run analysis for {document.name}
					</OMText>
					<OMText variant="body" style={styles.body}>
						Choose a category first, then open one of the tests nested inside it.
					</OMText>
				</View>

				<View style={styles.listSurface}>
					{exploreCategories.map((category, index) => (
						<View key={category.slug} style={index > 0 ? styles.rowDivider : undefined}>
							<Link
								href={{
									pathname: '/files/[documentId]/analysis/[category]',
									params: { documentId: document.id, category: category.slug },
								}}
								asChild
							>
								<Pressable style={({ pressed }) => [styles.testRow, pressed ? styles.testRowPressed : null]}>
									<View style={styles.testRowText}>
										<OMText variant="headline" style={styles.testTitle}>
											{category.title}
										</OMText>
										<OMText variant="body" style={styles.testSubtitle}>
											{category.example}
										</OMText>
									</View>
									<OMText variant="subtitle" style={styles.openText}>
										Open
									</OMText>
								</Pressable>
							</Link>
						</View>
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
		maxWidth: 320,
	},
	body: {
		color: omColors.grayscale400,
		maxWidth: 360,
		fontSize: 17,
		lineHeight: 24,
	},
	listSurface: {
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.1)',
		overflow: 'hidden',
	},
	rowDivider: {
		borderTopWidth: 1,
		borderTopColor: 'rgba(255,255,255,0.08)',
	},
	testRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: omSpacing.l,
		paddingHorizontal: omSpacing.l,
		paddingVertical: omSpacing.l,
	},
	testRowPressed: {
		backgroundColor: 'rgba(255,255,255,0.04)',
	},
	testRowText: {
		flex: 1,
		gap: omSpacing.xs,
	},
	testTitle: {
		color: omTheme.primaryText,
	},
	testSubtitle: {
		color: omColors.grayscale400,
	},
	openText: {
		color: omTheme.accent,
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
