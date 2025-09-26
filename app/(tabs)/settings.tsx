import { TouchableOpacity, Text, Alert, View, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Storage } from 'expo-sqlite/kv-store'
import { layout, typography, buttons } from '@/styles'
import { useTheme } from '@/contexts/ThemeContext'

// ts-prune-ignore-next
export default function SettingsScreen() {
	const { theme, themeMode, setThemeMode } = useTheme()

	const handleThemeToggle = () => {
		const modes: ('system' | 'light' | 'dark')[] = ['system', 'light', 'dark']
		const currentIndex = modes.indexOf(themeMode)
		const nextIndex = (currentIndex + 1) % modes.length
		const nextMode = modes[nextIndex]
		if (nextMode) {
			setThemeMode(nextMode)
		}
	}

	const getThemeDisplayName = () => {
		switch (themeMode) {
			case 'light': return '☀️ Light'
			case 'dark': return '🌙 Dark'
			case 'system': return '📱 System'
		}
	}

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
		<SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
			<View style={styles.content}>
				<Text style={[styles.title, { color: theme.primaryAlt }]}>Settings</Text>

				<View style={styles.section}>
					<Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Appearance</Text>
					<TouchableOpacity style={[styles.themeButton, { backgroundColor: theme.surface }]} onPress={handleThemeToggle}>
						<Text style={[styles.themeButtonText, { color: theme.textPrimary }]}>
							{getThemeDisplayName()}
						</Text>
					</TouchableOpacity>
				</View>

				<View style={styles.section}>
					<Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Developer Options</Text>
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
		...layout.screenContainer,
	},
	content: layout.contentContainer,
	title: {
		...typography.largeTitle,
		marginBottom: 30,
	},
	section: {
		marginBottom: 30,
	},
	sectionTitle: {
		...typography.cardTitle,
		marginBottom: 15,
	},
	resetButton: buttons.destructive,
	resetButtonText: typography.buttonTextSmall,
	themeButton: {
		...buttons.secondary,
		marginBottom: 8,
	},
	themeButtonText: typography.buttonTextSmall,
})
