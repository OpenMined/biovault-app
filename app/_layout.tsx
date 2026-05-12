import { initBioVaultAnalytics } from '@/lib/analytics'
import { installGlobalErrorHandler } from '@/lib/install-global-error-handler'
import { getAppPreferenceSync, subscribeToAppPreference } from '@/lib/app-preferences'
import { applyGlobalBrandTypography } from '@/lib/brand-typography'
import { deferLaunchUrlSync, getDeferredLaunchUrlSync } from '@/lib/deferred-launch-url'
import { identifyBioVaultWebUser } from '@/lib/rybbit-identify.web'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { warmupBioscriptRuntime } from '@/modules/expo-bioscript'
import { omColors } from '@/styles/brand'
import { useFonts } from 'expo-font'
import { Stack, usePathname, useRouter } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { Platform, View } from 'react-native'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import 'react-native-reanimated'

// i dont like the expo dev button appearing so just disabling it here
import { requireOptionalNativeModule } from 'expo';
const DevMenuPreferences = requireOptionalNativeModule('DevMenuPreferences');
DevMenuPreferences?.setPreferencesAsync({ showFloatingActionButton: false });

const analytics = initBioVaultAnalytics()
installGlobalErrorHandler()
applyGlobalBrandTypography()
SplashScreen.preventAutoHideAsync().catch(() => {})

/** TEMP: skip onboarding + disclaimer gate on web (remove when flow is web-ready). */
const WEB_SKIPS_ONBOARDING = Platform.OS === 'web'

function RootNavigator() {
	const pathname = usePathname()
	const router = useRouter()
	const [completedOnboarding, setCompletedOnboarding] = useState(
		() => WEB_SKIPS_ONBOARDING || getAppPreferenceSync('hasCompletedOnboarding') === 'true'
	)
	const [acceptedDisclaimer, setAcceptedDisclaimer] = useState(
		() => WEB_SKIPS_ONBOARDING || getAppPreferenceSync('hasAcceptedResearchDisclaimer') === 'true'
	)
	const canAccessApp = completedOnboarding && acceptedDisclaimer

	useEffect(() => {
		const unsubscribeCompleted = subscribeToAppPreference('hasCompletedOnboarding', (value) => {
			setCompletedOnboarding(WEB_SKIPS_ONBOARDING || value === 'true')
		})
		const unsubscribeDisclaimer = subscribeToAppPreference('hasAcceptedResearchDisclaimer', (value) => {
			setAcceptedDisclaimer(WEB_SKIPS_ONBOARDING || value === 'true')
		})

		return () => {
			unsubscribeCompleted()
			unsubscribeDisclaimer()
		}
	}, [])

	useEffect(() => {
		if (!canAccessApp && pathname !== '/onboarding') {
			if (Platform.OS === 'web' && typeof window !== 'undefined') {
				deferLaunchUrlSync(window.location.href)
			}
			router.replace('/onboarding')
			return
		}

		if (canAccessApp && Platform.OS === 'web' && typeof window !== 'undefined') {
			const deferredLaunchUrl = getDeferredLaunchUrlSync()
			if (deferredLaunchUrl) {
				window.location.replace(deferredLaunchUrl)
				return
			}
		}

		if (canAccessApp && (pathname === '/' || pathname === '/onboarding')) {
			router.replace('/(tabs)')
		}
	}, [canAccessApp, pathname, router])

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
					name="web/index"
					options={{ animation: 'none' }}
				/>
				<Stack.Screen
					name="data-source"
					options={{ presentation: 'formSheet', animation: 'slide_from_bottom' }}
				/>
				<Stack.Screen
					name="test/bioscript"
					options={{ presentation: 'card', animation: 'none' }}
				/>
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

	useEffect(() => {
		if (Platform.OS !== 'web') return
		identifyBioVaultWebUser()

		void warmupBioscriptRuntime().catch((error) => {
			console.warn('[bioscript] web runtime warmup failed', error)
		})
	}, [])

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
