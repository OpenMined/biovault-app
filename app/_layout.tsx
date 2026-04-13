import { initAnalytics } from '@/lib/analytics'
import { applyGlobalBrandTypography } from '@/lib/brand-typography'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { omColors } from '@/styles/brand'
import { useFonts } from 'expo-font'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { View } from 'react-native'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import 'react-native-reanimated'

// i dont like the expo dev button appearing so just disabling it here
import { requireOptionalNativeModule } from 'expo';
const DevMenuPreferences = requireOptionalNativeModule('DevMenuPreferences');
DevMenuPreferences?.setPreferencesAsync({ showFloatingActionButton: false });


const analytics = initAnalytics('4', 'https://metrics.syftbox.net/api', 'app.biovault.net')
applyGlobalBrandTypography()
SplashScreen.preventAutoHideAsync().catch(() => {})

// ts-prune-ignore-next
export default function RootLayout() {
	const [fontsLoaded, fontError] = useFonts({
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

	useEffect(() => {
		if (fontsLoaded || fontError) {
			SplashScreen.hideAsync().catch(() => {})
		}
	}, [fontsLoaded, fontError])

	if (!fontsLoaded && !fontError) {
		return null
	}

	return (
		<KeyboardProvider>
			<View style={{ flex: 1, backgroundColor: omColors.grayscale850 }}>
				<Stack
					screenOptions={{
						headerShown: false,
						contentStyle: { backgroundColor: omColors.grayscale850 },
					}}
				>
				<Stack.Screen
					name="(tabs)"
				/>
				<Stack.Screen
					name="onboarding"
					options={{ presentation: 'card', animation: 'none' }}
				/>
				<Stack.Screen
					name="data-source"
					options={{ presentation: 'formSheet', animation: 'slide_from_bottom' }}
				/>
				<Stack.Screen
					name="files/[documentId]/rename"
					options={{ presentation: 'formSheet', animation: 'slide_from_bottom' }}
				/>
				<Stack.Screen name="+not-found" />
				<Stack.Screen name="gene/[geneName]" />
				<Stack.Screen name="tests/[slug]" options={{ presentation: 'card' }} />
				</Stack>
			</View>
			<StatusBar style="light" />
		</KeyboardProvider>
	)
}
