import { Stack } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'

// ts-prune-ignore-next
export default function NotFoundScreen() {
	return (
		<>
			<Stack.Screen options={{ title: 'Not Found' }} />
			<View style={styles.container}>
				<Text style={styles.title}>This screen doesn&apos;t exist.</Text>
			</View>
		</>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		padding: 20,
	},
	title: {
		fontSize: 20,
		fontWeight: 'bold',
	},
})