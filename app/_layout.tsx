import { useColorScheme } from '@/hooks/useColorScheme'
import { initAnalytics } from '@/lib/analytics'
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native'
import { useFonts } from 'expo-font'
import { Stack } from 'expo-router'
import { SQLiteProvider } from 'expo-sqlite'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import 'react-native-reanimated'

// Initialize analytics immediately when the module loads
const analytics = initAnalytics(
	'4', // BioVault site ID
	'https://metrics.syftbox.net/api',
	'app.biovault.net'
)

// ts-prune-ignore-next
export default function RootLayout() {
	const colorScheme = useColorScheme()
	const [loaded] = useFonts({
		SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
	})

	useEffect(() => {
		// Start a new session when app launches
		analytics.startSession()

		return () => {
			// End session when app closes (though this might not always trigger)
			analytics.endSession()
		}
	}, [])

	if (!loaded) {
		// Async font loading only occurs in development.
		return null
	}

	return (
		<KeyboardProvider>
			<SQLiteProvider
				databaseName="clinvar_23andme.sqlite"
				assetSource={{
					// eslint-disable-next-line @typescript-eslint/no-require-imports
					assetId: require('../assets/clinvar_23andme.sqlite'),
					forceOverwrite: true,
				}}
			>
				<ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
					<Stack>
						<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
						<Stack.Screen name="+not-found" />
						<Stack.Screen name="gene/[geneName]" options={{ headerShown: false }} />
					</Stack>
					<StatusBar style="auto" />
				</ThemeProvider>
			</SQLiteProvider>
		</KeyboardProvider>
	)
}
