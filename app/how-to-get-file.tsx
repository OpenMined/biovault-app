import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Linking } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useAnalytics } from '@/hooks/useAnalytics'
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated'

const dataProviders = [
	{
		key: '23andme',
		name: '23andMe',
		icon: '🧬',
		description: 'Direct-to-consumer genetic testing',
		available: true,
	},
	{
		key: 'ancestrydna',
		name: 'AncestryDNA',
		icon: '🌳',
		description: 'Genealogy and ancestry testing',
		available: false,
	},
	{
		key: 'myheritage',
		name: 'MyHeritage DNA',
		icon: '👥',
		description: 'Family history and DNA testing',
		available: false,
	},
	{
		key: 'ftdna',
		name: 'FamilyTreeDNA',
		icon: '🌲',
		description: 'Comprehensive DNA testing',
		available: false,
	},
	{
		key: 'livingdna',
		name: 'LivingDNA',
		icon: '🗺️',
		description: 'Ancestry and wellbeing insights',
		available: false,
	},
	{
		key: 'sequencing',
		name: 'Sequencing.com',
		icon: '🔬',
		description: 'Advanced genomic analysis',
		available: false,
	},
	{
		key: 'nebula',
		name: 'Nebula Genomics',
		icon: '🌌',
		description: 'Whole genome sequencing',
		available: false,
	},
	{
		key: 'carigenetics',
		name: 'CariGenetics',
		icon: '🏝️',
		description: 'Caribbean genetic heritage',
		available: false,
	},
]

// ts-prune-ignore-next
export default function HowToGetFile() {
	useAnalytics({
		trackScreenView: true,
		screenProperties: { screen: 'HowToGetFile' },
	})

	const handleProviderPress = (provider: (typeof dataProviders)[0]) => {
		if (provider.available) {
			router.push(`/wizard/${provider.key}` as any)
		}
	}

	return (
		<View style={styles.container}>
			<SafeAreaView style={styles.safeArea}>
				<ScrollView
					style={styles.scrollView}
					contentContainerStyle={styles.scrollContent}
					showsVerticalScrollIndicator={false}
				>
					{/* Header with Back Button */}
					<Animated.View entering={FadeInDown.duration(300)} style={styles.headerContainer}>
						<TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
							<Text style={styles.backButtonText}>‹</Text>
						</TouchableOpacity>
						<View style={styles.header}>
							<View style={styles.headerIcon}>
								<Text style={styles.headerIconText}>📁</Text>
							</View>
							<Text style={styles.title}>Get Your DNA File</Text>
							<Text style={styles.subtitle}>
								Choose your genetic testing provider to learn how to download your data
							</Text>
						</View>
					</Animated.View>

					{/* Available Provider */}
					<Animated.View entering={FadeInUp.duration(300).delay(100)} style={styles.section}>
						<Text style={styles.sectionLabel}>AVAILABLE NOW</Text>
						{dataProviders
							.filter((p) => p.available)
							.map((provider, index) => (
								<Animated.View
									key={provider.key}
									entering={FadeInUp.duration(250).delay(150 + index * 50)}
								>
									<TouchableOpacity
										style={styles.providerCard}
										onPress={() => handleProviderPress(provider)}
									>
										<View style={styles.providerIcon}>
											<Text style={styles.providerIconText}>{provider.icon}</Text>
										</View>
										<View style={styles.providerInfo}>
											<Text style={styles.providerName}>{provider.name}</Text>
											<Text style={styles.providerDescription}>{provider.description}</Text>
										</View>
										<Text style={styles.providerArrow}>→</Text>
									</TouchableOpacity>
								</Animated.View>
							))}
					</Animated.View>

					{/* Coming Soon Providers */}
					<Animated.View entering={FadeInUp.duration(300).delay(150)} style={styles.section}>
						<Text style={styles.sectionLabel}>COMING SOON</Text>
						{dataProviders
							.filter((p) => !p.available)
							.map((provider, index) => (
								<Animated.View
									key={provider.key}
									entering={FadeInUp.duration(250).delay(200 + index * 25)}
								>
									<View style={styles.providerCardDisabled}>
										<View style={styles.providerIconDisabled}>
											<Text style={styles.providerIconText}>{provider.icon}</Text>
										</View>
										<View style={styles.providerInfo}>
											<Text style={styles.providerNameDisabled}>{provider.name}</Text>
											<Text style={styles.providerDescriptionDisabled}>{provider.description}</Text>
										</View>
									</View>
								</Animated.View>
							))}
					</Animated.View>

					{/* Info Card */}
					<Animated.View entering={FadeInUp.duration(300).delay(200)} style={styles.infoCard}>
						<Text style={styles.infoIcon}>💡</Text>
						<Text style={styles.infoTitle}>Don&apos;t have genetic data yet?</Text>
						<Text style={styles.infoText}>
							You&apos;ll need to order a DNA test from one of these providers first. Most tests
							cost between $50-200 and take 6-8 weeks to process.
						</Text>
					</Animated.View>

					{/* Community Links */}
					<Animated.View entering={FadeInUp.duration(300).delay(250)} style={styles.linksSection}>
						<Text style={styles.linksTitle}>Join the Community</Text>
						<View style={styles.linksRow}>
							<TouchableOpacity
								style={styles.linkCard}
								onPress={() => Linking.openURL('https://biovault.net')}
							>
								<Text style={styles.linkIcon}>🌐</Text>
								<Text style={styles.linkText}>Website</Text>
							</TouchableOpacity>
							<TouchableOpacity
								style={styles.linkCard}
								onPress={() => Linking.openURL('https://github.com/OpenMined/biovault-app')}
							>
								<Text style={styles.linkIcon}>💻</Text>
								<Text style={styles.linkText}>GitHub</Text>
							</TouchableOpacity>
							<TouchableOpacity
								style={styles.linkCard}
								onPress={() => Linking.openURL('https://slack.openmined.org')}
							>
								<Text style={styles.linkIcon}>💬</Text>
								<Text style={styles.linkText}>Slack</Text>
							</TouchableOpacity>
						</View>
					</Animated.View>
				</ScrollView>
			</SafeAreaView>
		</View>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#e0f2e7',
	},
	safeArea: {
		flex: 1,
	},
	headerContainer: {
		paddingHorizontal: 28,
		paddingTop: 20,
		paddingBottom: 28,
		position: 'relative',
	},
	backButton: {
		position: 'absolute',
		left: 28,
		top: 20,
		width: 44,
		height: 44,
		borderRadius: 22,
		backgroundColor: 'rgba(255, 255, 255, 0.95)',
		justifyContent: 'center',
		alignItems: 'center',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 8,
		elevation: 4,
		zIndex: 10,
	},
	backButtonText: {
		fontSize: 32,
		color: '#059669',
		fontWeight: '600',
		marginTop: -2,
		marginLeft: -2,
	},
	scrollView: {
		flex: 1,
	},
	scrollContent: {
		paddingBottom: 100,
	},
	header: {
		alignItems: 'center',
	},
	headerIcon: {
		width: 80,
		height: 80,
		borderRadius: 40,
		backgroundColor: '#d1fae5',
		justifyContent: 'center',
		alignItems: 'center',
		marginBottom: 20,
		shadowColor: '#059669',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.15,
		shadowRadius: 12,
		elevation: 4,
	},
	headerIconText: {
		fontSize: 40,
	},
	title: {
		fontSize: 32,
		fontWeight: '900',
		color: '#059669',
		marginBottom: 8,
		letterSpacing: -0.8,
		textAlign: 'center',
	},
	subtitle: {
		fontSize: 16,
		color: '#475569',
		lineHeight: 24,
		fontWeight: '500',
		textAlign: 'center',
		opacity: 0.8,
		maxWidth: 340,
	},
	section: {
		paddingHorizontal: 28,
		marginBottom: 32,
	},
	sectionLabel: {
		fontSize: 12,
		fontWeight: '800',
		color: '#059669',
		letterSpacing: 1,
		marginBottom: 14,
	},
	providerCard: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: 'rgba(255,255,255,0.95)',
		padding: 18,
		borderRadius: 20,
		marginBottom: 12,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.08,
		shadowRadius: 12,
		elevation: 6,
	},
	providerCardDisabled: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: 'rgba(255,255,255,0.6)',
		padding: 18,
		borderRadius: 20,
		marginBottom: 12,
		opacity: 0.7,
	},
	providerIcon: {
		width: 56,
		height: 56,
		borderRadius: 18,
		backgroundColor: '#d1fae5',
		justifyContent: 'center',
		alignItems: 'center',
		marginRight: 14,
	},
	providerIconDisabled: {
		width: 56,
		height: 56,
		borderRadius: 18,
		backgroundColor: '#f1f5f9',
		justifyContent: 'center',
		alignItems: 'center',
		marginRight: 14,
	},
	providerIconText: {
		fontSize: 28,
	},
	providerInfo: {
		flex: 1,
	},
	providerName: {
		fontSize: 17,
		fontWeight: '800',
		color: '#0f172a',
		marginBottom: 4,
		letterSpacing: -0.3,
	},
	providerNameDisabled: {
		fontSize: 17,
		fontWeight: '800',
		color: '#94a3b8',
		marginBottom: 4,
		letterSpacing: -0.3,
	},
	providerDescription: {
		fontSize: 14,
		color: '#64748b',
		fontWeight: '500',
	},
	providerDescriptionDisabled: {
		fontSize: 14,
		color: '#cbd5e1',
		fontWeight: '500',
	},
	providerArrow: {
		fontSize: 24,
		color: '#059669',
		fontWeight: '700',
		marginLeft: 8,
	},
	infoCard: {
		backgroundColor: 'rgba(254, 252, 232, 0.9)',
		marginHorizontal: 28,
		padding: 24,
		borderRadius: 24,
		alignItems: 'center',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.08,
		shadowRadius: 12,
		elevation: 6,
		marginBottom: 20,
	},
	infoIcon: {
		fontSize: 48,
		marginBottom: 16,
	},
	infoTitle: {
		fontSize: 18,
		fontWeight: '800',
		color: '#78350f',
		marginBottom: 12,
		textAlign: 'center',
		letterSpacing: -0.3,
	},
	infoText: {
		fontSize: 15,
		color: '#92400e',
		lineHeight: 22,
		fontWeight: '600',
		textAlign: 'center',
	},
	linksSection: {
		paddingHorizontal: 28,
		marginTop: 12,
		marginBottom: 20,
	},
	linksTitle: {
		fontSize: 18,
		fontWeight: '800',
		color: '#0f172a',
		textAlign: 'center',
		marginBottom: 16,
		letterSpacing: -0.3,
	},
	linksRow: {
		flexDirection: 'row',
		gap: 12,
		justifyContent: 'center',
	},
	linkCard: {
		flex: 1,
		backgroundColor: 'rgba(255,255,255,0.95)',
		paddingVertical: 20,
		paddingHorizontal: 12,
		borderRadius: 20,
		alignItems: 'center',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.08,
		shadowRadius: 12,
		elevation: 6,
		gap: 8,
	},
	linkIcon: {
		fontSize: 32,
	},
	linkText: {
		fontSize: 12,
		fontWeight: '800',
		color: '#059669',
		letterSpacing: 0.3,
		textTransform: 'uppercase',
	},
})
