import { useAnalytics } from '@/hooks/useAnalytics'
import { StyleSheet, Text, View, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function FeedScreen() {
	useAnalytics({
		trackScreenView: true,
		screenProperties: { screen: 'Feed' },
	})

	return (
		<SafeAreaView style={styles.container}>
			<ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
				<View style={styles.header}>
					<Text style={styles.title}>Feed</Text>
					<Text style={styles.subtitle}>Stay updated with the latest in genomics</Text>
				</View>

				<View style={styles.comingSoonCard}>
					<View style={styles.comingSoonIllustration}>
						<Text style={styles.comingSoonIcon}>📰</Text>
					</View>
					<Text style={styles.comingSoonTitle}>Coming Soon</Text>
					<Text style={styles.comingSoonText}>
						We&apos;re building an amazing feed experience that will bring you:
					</Text>

					<View style={styles.featuresList}>
						<View style={styles.featureItem}>
							<Text style={styles.featureIcon}>🧬</Text>
							<Text style={styles.featureText}>Latest genomics research and breakthroughs</Text>
						</View>
						<View style={styles.featureItem}>
							<Text style={styles.featureIcon}>📊</Text>
							<Text style={styles.featureText}>
								Personalized insights based on your genetic data
							</Text>
						</View>
						<View style={styles.featureItem}>
							<Text style={styles.featureIcon}>🔬</Text>
							<Text style={styles.featureText}>Community discussions and scientific updates</Text>
						</View>
						<View style={styles.featureItem}>
							<Text style={styles.featureIcon}>🎯</Text>
							<Text style={styles.featureText}>
								Curated content relevant to your genetic profile
							</Text>
						</View>
					</View>

					<View style={styles.timelineHint}>
						<Text style={styles.timelineText}>Expected in a future update</Text>
					</View>
				</View>

				<View style={styles.privacyNote}>
					<Text style={styles.privacyNoteTitle}>🔒 Privacy First</Text>
					<Text style={styles.privacyNoteText}>
						When available, your feed will be personalized while keeping your genetic data
						completely private and local to your device.
					</Text>
				</View>
			</ScrollView>
		</SafeAreaView>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#f5f5f5',
	},
	scrollView: {
		flex: 1,
	},
	scrollContent: {
		flexGrow: 1,
		paddingBottom: 100,
	},
	header: {
		padding: 20,
		paddingBottom: 16,
	},
	title: {
		fontSize: 32,
		fontWeight: '800',
		color: '#333',
		marginBottom: 8,
	},
	subtitle: {
		fontSize: 16,
		color: '#666',
		lineHeight: 22,
	},
	comingSoonCard: {
		backgroundColor: 'white',
		marginHorizontal: 20,
		marginVertical: 20,
		padding: 32,
		borderRadius: 20,
		alignItems: 'center',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.1,
		shadowRadius: 12,
		elevation: 6,
	},
	comingSoonIllustration: {
		width: 100,
		height: 100,
		borderRadius: 50,
		backgroundColor: '#e8f5e8',
		justifyContent: 'center',
		alignItems: 'center',
		marginBottom: 24,
		shadowColor: '#059669',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.2,
		shadowRadius: 8,
		elevation: 4,
	},
	comingSoonIcon: {
		fontSize: 48,
	},
	comingSoonTitle: {
		fontSize: 28,
		fontWeight: '700',
		color: '#333',
		marginBottom: 12,
		textAlign: 'center',
	},
	comingSoonText: {
		fontSize: 16,
		color: '#666',
		textAlign: 'center',
		lineHeight: 22,
		marginBottom: 32,
		maxWidth: 280,
	},
	featuresList: {
		width: '100%',
		marginBottom: 32,
	},
	featureItem: {
		flexDirection: 'row',
		alignItems: 'center',
		marginBottom: 16,
		paddingHorizontal: 16,
	},
	featureIcon: {
		fontSize: 24,
		marginRight: 16,
		width: 32,
		textAlign: 'center',
	},
	featureText: {
		fontSize: 14,
		color: '#666',
		flex: 1,
		lineHeight: 20,
	},
	timelineHint: {
		backgroundColor: '#e8f5e8',
		paddingHorizontal: 16,
		paddingVertical: 8,
		borderRadius: 20,
	},
	timelineText: {
		fontSize: 12,
		color: '#059669',
		fontWeight: '600',
	},
	privacyNote: {
		backgroundColor: '#e8f5e8',
		marginHorizontal: 20,
		marginBottom: 20,
		padding: 20,
		borderRadius: 16,
		borderWidth: 1,
		borderColor: '#059669',
	},
	privacyNoteTitle: {
		fontSize: 16,
		fontWeight: '700',
		color: '#059669',
		marginBottom: 8,
	},
	privacyNoteText: {
		fontSize: 14,
		color: '#059669',
		lineHeight: 20,
	},
})
