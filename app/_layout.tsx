import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native'
import { useFonts } from 'expo-font'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import 'react-native-reanimated'
import { SQLiteProvider } from 'expo-sqlite'
import { useColorScheme } from '@/hooks/useColorScheme'
import { KeyboardProvider } from 'react-native-keyboard-controller'

export default function RootLayout() {
	const colorScheme = useColorScheme()
	const [loaded] = useFonts({
		SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
	})

	if (!loaded) {
		// Async font loading only occurs in development.
		return null
	}

	return (
		<KeyboardProvider>
			<SQLiteProvider
				databaseName="clinvar_23andme.sqlite"
				assetSource={{
					assetId: require('../assets/clinvar_23andme.sqlite'),
					forceOverwrite: true,
				}}
			>
				<ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
					<Stack>
						<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
						<Stack.Screen name="+not-found" />
					</Stack>
					<StatusBar style="auto" />
				</ThemeProvider>
			</SQLiteProvider>
		</KeyboardProvider>
	)
}
