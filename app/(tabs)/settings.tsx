import { TouchableOpacity, Text, StyleSheet, Alert, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Storage } from 'expo-sqlite/kv-store'

// ts-prune-ignore-next
export default function SettingsScreen() {
	const handleResetOnboarding = () => {
		Alert.alert(
			'Reset Onboarding',
			'This will reset the onboarding flow and show it again on next app launch. Continue?',
			[
				{
					text: 'Cancel',
					style: 'cancel',
				},
				{
					text: 'Reset',
					style: 'destructive',
					onPress: () => {
						Storage.removeItemSync('hasCompletedOnboarding')
						Alert.alert('Success', 'Onboarding has been reset.', [
							{
								text: 'Go to Onboarding',
								onPress: () => router.replace('/onboarding'),
							},
							{
								text: 'OK',
								style: 'cancel',
							},
						])
					},
				},
			]
		)
	}

	return (
		<SafeAreaView style={styles.container}>
			<View style={styles.content}>
				<Text style={styles.title}>Settings</Text>

				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Developer Options</Text>
					<TouchableOpacity style={styles.resetButton} onPress={handleResetOnboarding}>
						<Text style={styles.resetButtonText}>🔄 Reset Onboarding</Text>
					</TouchableOpacity>
				</View>
			</View>
		</SafeAreaView>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#ffffff',
	},
	content: {
		flex: 1,
		padding: 20,
	},
	title: {
		fontSize: 32,
		fontWeight: 'bold',
		color: '#059669',
		marginBottom: 30,
	},
	section: {
		marginBottom: 30,
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: '600',
		color: '#374151',
		marginBottom: 15,
	},
	resetButton: {
		backgroundColor: '#ef4444',
		padding: 12,
		borderRadius: 8,
		alignItems: 'center',
	},
	resetButtonText: {
		color: 'white',
		fontSize: 14,
		fontWeight: '500',
	},
})
