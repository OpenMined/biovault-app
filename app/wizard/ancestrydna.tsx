import { View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { lightTheme } from '@/styles/colors'
import { useAnalytics } from '@/hooks/useAnalytics'

// ts-prune-ignore-next
export default function AncestryDNAWizard() {
	const theme = lightTheme
	const { trackEvent } = useAnalytics({
		trackScreenView: true,
		screenProperties: {
			screen: 'AncestryDNA_Support',
			provider: 'AncestryDNA',
			type: 'dna_file_support',
		},
	})

	const handleRequestSupport = () => {
		trackEvent('request_dna_format_support', {
			provider: 'AncestryDNA',
			timestamp: new Date().toISOString(),
		})
		Alert.alert('Support Requested', 'We will start working on it ASAP!', [
			{ text: 'OK', onPress: () => router.back() },
		])
	}

	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
			<ScrollView
				style={{ flex: 1 }}
				contentContainerStyle={{
					padding: 20,
					alignItems: 'center',
					paddingTop: 60,
				}}
				showsVerticalScrollIndicator={false}
			>
				<View
					style={{
						backgroundColor: theme.surface,
						borderRadius: 20,
						padding: 30,
						width: '100%',
						maxWidth: 400,
						alignItems: 'center',
					}}
				>
					<View
						style={{
							width: 80,
							height: 80,
							borderRadius: 40,
							backgroundColor: theme.primaryLight,
							justifyContent: 'center',
							alignItems: 'center',
							marginBottom: 20,
						}}
					>
						<Text style={{ fontSize: 40 }}>🌳</Text>
					</View>

					<Text
						style={{
							fontSize: 24,
							fontWeight: '700',
							color: theme.textPrimary,
							marginBottom: 12,
							textAlign: 'center',
						}}
					>
						AncestryDNA
					</Text>

					<Text
						style={{
							fontSize: 18,
							fontWeight: '600',
							color: theme.primary,
							marginBottom: 16,
							textAlign: 'center',
						}}
					>
						Coming Soon
					</Text>

					<Text
						style={{
							fontSize: 16,
							color: theme.textSecondary,
							textAlign: 'center',
							lineHeight: 22,
							marginBottom: 30,
						}}
					>
						Support for AncestryDNA files is in development. Tap the button below to be notified
						when it&apos;s ready!
					</Text>

					<TouchableOpacity
						style={{
							backgroundColor: theme.primary,
							paddingVertical: 14,
							paddingHorizontal: 32,
							borderRadius: 12,
							marginBottom: 16,
						}}
						onPress={handleRequestSupport}
					>
						<Text
							style={{
								color: theme.textInverse,
								fontSize: 16,
								fontWeight: '600',
							}}
						>
							Request Support
						</Text>
					</TouchableOpacity>

					<TouchableOpacity
						style={{
							paddingVertical: 12,
						}}
						onPress={() => router.back()}
					>
						<Text
							style={{
								color: theme.textSecondary,
								fontSize: 14,
							}}
						>
							Go Back
						</Text>
					</TouchableOpacity>
				</View>
			</ScrollView>
		</SafeAreaView>
	)
}
