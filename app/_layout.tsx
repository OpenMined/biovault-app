import { initAnalytics } from '@/lib/analytics'
import { getAppPreferenceSync } from '@/lib/app-preferences'
import { applyGlobalBrandTypography } from '@/lib/brand-typography'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { omColors } from '@/styles/brand'
import { useFonts } from 'expo-font'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { Platform, View } from 'react-native'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import 'react-native-reanimated'

// i dont like the expo dev button appearing so just disabling it here
import { requireOptionalNativeModule } from 'expo';
const DevMenuPreferences = requireOptionalNativeModule('DevMenuPreferences');
DevMenuPreferences?.setPreferencesAsync({ showFloatingActionButton: false });

const analytics = initAnalytics('4', 'https://metrics.syftbox.net/api', 'app.biovault.net')
applyGlobalBrandTypography()
SplashScreen.preventAutoHideAsync().catch(() => {})

function RootNavigator() {
	const completedOnboarding = getAppPreferenceSync('hasCompletedOnboarding') === 'true'
	const acceptedDisclaimer = getAppPreferenceSync('hasAcceptedResearchDisclaimer') === 'true'
	const canAccessApp = completedOnboarding && acceptedDisclaimer

	return (
		<Stack
			screenOptions={{
				headerShown: false,
				contentStyle: { backgroundColor: omColors.grayscale850 },
			}}
		>
			<Stack.Protected guard={!canAccessApp}>
				<Stack.Screen
					name="onboarding"
					options={{ presentation: 'card', animation: 'none' }}
				/>
			</Stack.Protected>

			<Stack.Protected guard={canAccessApp}>
				<Stack.Screen
					name="index"
					options={{ animation: 'none' }}
				/>
				<Stack.Screen
					name="(tabs)"
					options={{ animation: 'none' }}
				/>
				<Stack.Screen
					name="data-source"
					options={{ presentation: 'formSheet', animation: 'slide_from_bottom' }}
				/>
				<Stack.Screen name="examples" />
				<Stack.Screen
					name="files/[documentId]/rename"
					options={{ presentation: 'formSheet', animation: 'slide_from_bottom' }}
				/>
				<Stack.Screen name="gene/[geneName]" />
				<Stack.Screen name="tests/[slug]" options={{ presentation: 'card' }} />
			</Stack.Protected>

			<Stack.Screen name="+not-found" />
		</Stack>
	)
}

// ts-prune-ignore-next
export default function RootLayout() {
	const [fontsLoaded, fontError] = useFonts({
		Inter: require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'),
		Rubik: require('@expo-google-fonts/rubik/400Regular/Rubik_400Regular.ttf'),
	})
	const fontsReady = Platform.OS === 'web' ? (fontsLoaded || !!fontError) : true

	usePushNotifications()

	useEffect(() => {
		analytics.startSession().catch(console.error)
		return () => {
			analytics.endSession().catch(console.error)
		}
	}, [])

	useEffect(() => {
		if (fontsReady) {
			SplashScreen.hideAsync().catch(() => {})
		}
	}, [fontsReady])

	if (!fontsReady) {
		return null
	}

	return (
		<KeyboardProvider>
			<View style={{ flex: 1, backgroundColor: omColors.grayscale850 }}>
				<RootNavigator />
			</View>
			<StatusBar style="light" />
		</KeyboardProvider>
	)
}
