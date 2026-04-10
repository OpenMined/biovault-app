import { Stack } from 'expo-router'

export default function SettingsLayout() {
	return (
		<Stack>
			<Stack.Screen name="index" options={{ headerShown: false }} />
			<Stack.Screen
				name="test"
				options={{
					title: 'Test',
					headerTintColor: '#059669',
				}}
			/>
		</Stack>
	)
}
