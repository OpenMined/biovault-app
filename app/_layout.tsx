import { initBioVaultAnalytics } from '@/lib/analytics'
import { installGlobalErrorHandler } from '@/lib/install-global-error-handler'
import { getAppPreferenceSync, setAppPreferenceSync, subscribeToAppPreference } from '@/lib/app-preferences'
import { applyGlobalBrandTypography } from '@/lib/brand-typography'
import { deferLaunchUrlSync, getDeferredLaunchUrlSync } from '@/lib/deferred-launch-url'
import { identifyBioVaultWebUser } from '@/lib/rybbit-identify.web'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { warmupBioscriptRuntime } from '@/modules/expo-bioscript'
import { omColors, omRadius, omSpacing } from '@/styles/brand'
import { useFonts } from 'expo-font'
import { Stack, usePathname, useRouter } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { Modal, Platform, StyleSheet, View } from 'react-native'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import 'react-native-reanimated'
import { OnboardingAgreementCard } from '@/app/onboarding'
import { BuildBadge } from '@/components/BuildBadge'

// i dont like the expo dev button appearing so just disabling it here
import { requireOptionalNativeModule } from 'expo';
const DevMenuPreferences = requireOptionalNativeModule('DevMenuPreferences');
DevMenuPreferences?.setPreferencesAsync({ showFloatingActionButton: false });

const analytics = initBioVaultAnalytics()
installGlobalErrorHandler()
applyGlobalBrandTypography()
SplashScreen.preventAutoHideAsync().catch(() => {})

/** Web uses a first-load agreement overlay instead of the native onboarding route. */
const WEB_USES_FIRST_LOAD_AGREEMENT = Platform.OS === 'web'

function RootNavigator() {
	const pathname = usePathname()
	const router = useRouter()
	const [webAgreementAccepted, setWebAgreementAccepted] = useState(
		() => Platform.OS !== 'web' || getAppPreferenceSync('hasAcceptedResearchDisclaimer') === 'true'
	)
	const [completedOnboarding, setCompletedOnboarding] = useState(
		() => WEB_USES_FIRST_LOAD_AGREEMENT || getAppPreferenceSync('hasCompletedOnboarding') === 'true'
	)
	const [acceptedDisclaimer, setAcceptedDisclaimer] = useState(
		() => WEB_USES_FIRST_LOAD_AGREEMENT || getAppPreferenceSync('hasAcceptedResearchDisclaimer') === 'true'
	)
	const canAccessApp = completedOnboarding && acceptedDisclaimer

	useEffect(() => {
		const unsubscribeCompleted = subscribeToAppPreference('hasCompletedOnboarding', (value) => {
			setCompletedOnboarding(WEB_USES_FIRST_LOAD_AGREEMENT || value === 'true')
		})
		const unsubscribeDisclaimer = subscribeToAppPreference('hasAcceptedResearchDisclaimer', (value) => {
			setAcceptedDisclaimer(WEB_USES_FIRST_LOAD_AGREEMENT || value === 'true')
			if (Platform.OS === 'web') setWebAgreementAccepted(value === 'true')
		})

		return () => {
			unsubscribeCompleted()
			unsubscribeDisclaimer()
		}
	}, [])

	const handleAcceptWebAgreement = () => {
		setAppPreferenceSync('hasAcceptedResearchDisclaimer', 'true')
		setAppPreferenceSync('hasCompletedOnboarding', 'true')
		setWebAgreementAccepted(true)
	}

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
		<>
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
			<WebFirstLoadAgreementModal
				visible={Platform.OS === 'web' && !webAgreementAccepted}
				onAccept={handleAcceptWebAgreement}
			/>
		</>
	)
}

function WebFirstLoadAgreementModal({
	visible,
	onAccept,
}: {
	visible: boolean
	onAccept: () => void
}) {
	const [hasAgreed, setHasAgreed] = useState(false)

	return (
		<Modal visible={visible} animationType="fade" transparent>
			<View style={styles.agreementBackdrop}>
				<View
					accessibilityViewIsModal
					accessible
					style={styles.agreementFrame}
				>
					<OnboardingAgreementCard
						hasAgreed={hasAgreed}
						onContinue={onAccept}
						onToggleAgreed={() => setHasAgreed((value) => !value)}
					/>
				</View>
			</View>
		</Modal>
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
				<BuildBadge />
			</View>
			<StatusBar style="light" />
		</KeyboardProvider>
	)
}

const styles = StyleSheet.create({
	agreementBackdrop: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		padding: omSpacing.l,
		backgroundColor: 'rgba(23,22,29,0.84)',
	},
	agreementFrame: {
		width: '100%',
		maxWidth: 560,
		maxHeight: 'calc(100vh - 32px)' as any,
		borderRadius: omRadius.l,
		overflow: 'hidden',
		backgroundColor: omColors.grayscale50,
		...(Platform.OS === 'web'
			? ({ boxShadow: '0 28px 80px rgba(0,0,0,0.36)' } as object)
			: {}),
	},
})
