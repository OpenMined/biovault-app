import { initAnalytics } from '@/lib/analytics'
import { Stack } from 'expo-router'
import { SQLiteProvider } from 'expo-sqlite'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import 'react-native-reanimated'
import { Platform } from 'react-native'

const analytics = initAnalytics('4', 'https://metrics.syftbox.net/api', 'app.biovault.net')

// ts-prune-ignore-next
export default function RootLayout() {
	useEffect(() => {
		analytics.startSession().catch(console.error)
		return () => {
			analytics.endSession().catch(console.error)
		}
	}, [])

	// Platform-specific database configuration
	const databaseConfig =
		Platform.OS === 'web'
			? {
					// On web, create an empty database (asset loading not supported)
					databaseName: 'clinvar_23andme.sqlite',
			  }
			: {
					// On native, load from bundled asset
					databaseName: 'clinvar_23andme.sqlite',
					assetSource: {
						// eslint-disable-next-line @typescript-eslint/no-require-imports
						assetId: require('../assets/clinvar_23andme.sqlite'),
						forceOverwrite: true,
					},
			  }

	return (
		<KeyboardProvider>
			<SQLiteProvider {...databaseConfig}>
				<Stack screenOptions={{ headerShown: false }}>
					<Stack.Screen name="(tabs)" options={{ animation: 'none' }} />
					<Stack.Screen
						name="onboarding"
						options={{ presentation: 'fullScreenModal', animation: 'none' }}
					/>
					<Stack.Screen name="+not-found" />
					<Stack.Screen name="gene/[geneName]" />
					<Stack.Screen name="trait-results" options={{ presentation: 'card' }} />
				</Stack>
				<StatusBar style="auto" />
			</SQLiteProvider>
		</KeyboardProvider>
	)
}
