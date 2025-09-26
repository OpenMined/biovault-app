import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme } from '@/contexts/ThemeContext'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useFocusEffect } from '@react-navigation/native'

// ts-prune-ignore-next
export default function FeedScreen() {
	const { theme } = useTheme()
	const [favoriteGenes, setFavoriteGenes] = useState<string[]>([])

	const loadFavorites = async () => {
		try {
			const saved = await AsyncStorage.getItem('favoriteGenes')
			if (saved) {
				setFavoriteGenes(JSON.parse(saved))
			}
		} catch (error) {
			console.error('Failed to load favorite genes:', error)
		}
	}

	const removeFavorite = async (gene: string) => {
		try {
			const newFavorites = favoriteGenes.filter(g => g !== gene)
			setFavoriteGenes(newFavorites)
			await AsyncStorage.setItem('favoriteGenes', JSON.stringify(newFavorites))
		} catch (error) {
			console.error('Failed to remove favorite:', error)
		}
	}

	useFocusEffect(
		React.useCallback(() => {
			loadFavorites()
		}, [])
	)

	return (
		<SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
			<ScrollView style={styles.content}>
				<Text style={[styles.title, { color: theme.textPrimary }]}>Feed</Text>

				{favoriteGenes.length > 0 ? (
					<View>
						<Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
							Your Favorite Genes
						</Text>
						{favoriteGenes.map((gene, index) => (
							<View key={index} style={[styles.geneCard, { backgroundColor: theme.surface }]}>
								<View style={styles.geneHeader}>
									<Text style={[styles.geneName, { color: theme.textPrimary }]}>
										{gene}
									</Text>
									<TouchableOpacity
										style={styles.removeButton}
										onPress={() => {
											Alert.alert(
												'Remove Favorite',
												`Are you sure you want to unfavorite ${gene}?`,
												[
													{ text: 'Cancel', style: 'cancel' },
													{ text: 'Remove', onPress: () => removeFavorite(gene), style: 'destructive' }
												]
											)
										}}
									>
										<Text style={[styles.removeIcon, { color: '#fbbf24' }]}>★</Text>
									</TouchableOpacity>
								</View>
								<TouchableOpacity
									style={[styles.learnButton, { borderColor: theme.primary }]}
									onPress={() => Linking.openURL(`https://biovault.net/genes/${gene.toLowerCase()}`)}
								>
									<Text style={[styles.learnButtonText, { color: theme.primary }]}>
										Learn More
									</Text>
								</TouchableOpacity>
							</View>
						))}
					</View>
				) : (
					<View style={[styles.comingSoonContainer, { backgroundColor: theme.surface }]}>
						<Text style={[styles.comingSoonEmoji]}>⭐</Text>
						<Text style={[styles.comingSoonTitle, { color: theme.textPrimary }]}>
							No Favorite Genes Yet
						</Text>
						<Text style={[styles.comingSoonText, { color: theme.textSecondary }]}>
							Star genes in the Insights tab to see them here. Stay tuned for updates and research breakthroughs related to your genes of interest.
						</Text>
					</View>
				)}
			</ScrollView>
		</SafeAreaView>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	content: {
		flex: 1,
		padding: 20,
	},
	title: {
		fontSize: 32,
		fontWeight: '800',
		marginBottom: 20,
	},
	comingSoonContainer: {
		borderRadius: 20,
		padding: 30,
		alignItems: 'center',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.1,
		shadowRadius: 12,
		elevation: 6,
	},
	comingSoonEmoji: {
		fontSize: 60,
		marginBottom: 20,
	},
	comingSoonTitle: {
		fontSize: 24,
		fontWeight: '700',
		marginBottom: 12,
	},
	comingSoonText: {
		fontSize: 16,
		textAlign: 'center',
		lineHeight: 24,
	},
	sectionTitle: {
		fontSize: 20,
		fontWeight: '700',
		marginBottom: 16,
	},
	geneCard: {
		borderRadius: 12,
		padding: 16,
		marginBottom: 12,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	geneHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 12,
	},
	geneName: {
		fontSize: 18,
		fontWeight: '600',
	},
	removeButton: {
		padding: 4,
	},
	removeIcon: {
		fontSize: 24,
	},
	learnButton: {
		borderWidth: 1,
		borderRadius: 8,
		paddingVertical: 8,
		paddingHorizontal: 12,
		alignSelf: 'flex-start',
	},
	learnButtonText: {
		fontSize: 14,
		fontWeight: '500',
	},
})
