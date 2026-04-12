import { Stack } from 'expo-router'

export default function SettingsLayout() {
	return (
		<Stack>
			<Stack.Screen name="index" options={{ headerShown: false }} />
			<Stack.Screen name="local-data" options={{ headerShown: false }} />
		</Stack>
	)
}
