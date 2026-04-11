import { initAnalytics } from '@/lib/analytics'
import { applyGlobalBrandTypography } from '@/lib/brand-typography'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { useFonts } from 'expo-font'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import 'react-native-reanimated'

const analytics = initAnalytics('4', 'https://metrics.syftbox.net/api', 'app.biovault.net')
applyGlobalBrandTypography()

// ts-prune-ignore-next
export default function RootLayout() {
	const [fontsLoaded] = useFonts({
		Inter: require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'),
		Rubik: require('@expo-google-fonts/rubik/400Regular/Rubik_400Regular.ttf'),
	})

	usePushNotifications()

	useEffect(() => {
		analytics.startSession().catch(console.error)
		return () => {
			analytics.endSession().catch(console.error)
		}
	}, [])

	if (!fontsLoaded) {
		return null
	}

	return (
		<KeyboardProvider>
			<Stack screenOptions={{ headerShown: false }}>
				<Stack.Screen name="(tabs)" options={{ animation: 'none' }} />
				<Stack.Screen
					name="onboarding"
					options={{ presentation: 'fullScreenModal', animation: 'none' }}
				/>
				<Stack.Screen name="+not-found" />
				<Stack.Screen name="gene/[geneName]" />
				<Stack.Screen name="tests/[slug]" options={{ presentation: 'card' }} />
				<Stack.Screen name="trait-results" options={{ presentation: 'card' }} />
			</Stack>
			<StatusBar style="auto" />
		</KeyboardProvider>
	)
}
