import { Stack } from 'expo-router'

export default function AnalyzeLayout() {
	return (
		<Stack>
			<Stack.Screen name="index" options={{ headerShown: false }} />
			<Stack.Screen name="results" options={{ headerShown: false }} />
		</Stack>
	)
}
