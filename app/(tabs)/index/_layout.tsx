import { Stack } from 'expo-router'

export default function VaultLayout() {
	return (
		<Stack>
			<Stack.Screen name="index" options={{ headerShown: false }} />
			<Stack.Screen name="analyze/index" options={{ headerShown: false }} />
		</Stack>
	)
}
