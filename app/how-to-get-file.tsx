import { View, Text, TouchableOpacity, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useTheme } from '@/contexts/ThemeContext'
import { sharedStyles, cards } from '@/styles/shared'
import { useAnalytics } from '@/hooks/useAnalytics'

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
	const { theme } = useTheme()
	useAnalytics({
		trackScreenView: true,
		screenProperties: { screen: 'HowToGetFile' },
	})

	const handleProviderPress = (provider: typeof dataProviders[0]) => {
		router.push(`/wizard/${provider.key}` as any)
	}

	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
			<ScrollView
				style={{ flex: 1 }}
				contentContainerStyle={{ paddingVertical: 20 }}
				showsVerticalScrollIndicator={false}
			>
				<View style={{ paddingHorizontal: 20 }}>
					{/* Header */}
					<View style={sharedStyles.headerSection}>
						<TouchableOpacity
							style={[sharedStyles.backButton, { borderColor: theme.border }]}
							onPress={() => router.back()}
						>
							<Text style={[sharedStyles.backButtonText, { color: theme.primary }]}>← Back</Text>
						</TouchableOpacity>

						<Text style={[sharedStyles.largeTitle, { color: theme.textPrimary, marginTop: 20 }]}>
							Get Your DNA File
						</Text>
						<Text style={[sharedStyles.subtitle, { color: theme.textSecondary }]}>
							Choose your genetic testing provider to get started
						</Text>
					</View>

					{/* All Providers */}
					<View style={{ marginBottom: 32 }}>
						{dataProviders.map(provider => (
							<TouchableOpacity
								key={provider.key}
								style={{
									flexDirection: 'row',
									alignItems: 'center',
									padding: 16,
									marginBottom: 12,
								}}
								onPress={() => handleProviderPress(provider)}
							>
								<View style={{
									width: 56,
									height: 56,
									borderRadius: 28,
									backgroundColor: provider.available ? theme.primaryLight : theme.inactive + '20',
									justifyContent: 'center',
									alignItems: 'center',
									marginRight: 16,
								}}>
									<Text style={{ fontSize: 28 }}>{provider.icon}</Text>
								</View>

								<View style={{ flex: 1 }}>
									<Text style={{
										fontSize: 18,
										fontWeight: '600',
										color: theme.textPrimary,
									}}>
										{provider.name}
									</Text>
									<Text style={{
										fontSize: 14,
										color: theme.textSecondary,
										marginTop: 4,
									}}>
										{provider.description}
									</Text>
								</View>

								<Text style={{ fontSize: 20, color: theme.textSecondary }}>→</Text>
							</TouchableOpacity>
						))}
					</View>

					{/* Info Card */}
					<View style={[
						cards.standard,
						{
							backgroundColor: theme.infoBg,
							borderColor: theme.info + '30',
							borderWidth: 1,
							marginTop: 32,
						}
					]}>
						<View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
							<Text style={{ fontSize: 24, marginRight: 12 }}>💡</Text>
							<View style={{ flex: 1 }}>
								<Text style={[sharedStyles.cardTitle, { color: theme.textPrimary }]}>
									Don&apos;t have genetic data yet?
								</Text>
								<Text style={[sharedStyles.subtitle, { color: theme.textSecondary, marginTop: 8 }]}>
									You&apos;ll need to order a DNA test from one of these providers first. Most tests cost between $50-200 and take 6-8 weeks to process.
								</Text>
							</View>
						</View>
					</View>
				</View>
			</ScrollView>
		</SafeAreaView>
	)
}