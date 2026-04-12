import { useActiveDocument } from '@/components/explore/ActiveDocumentContext'
import { ExploreLayoutContextProvider } from '@/components/explore/ExploreLayoutContext'
import { omColors } from '@/styles/brand'
import { useFocusEffect } from '@react-navigation/native'
import { Stack } from 'expo-router'
import { useCallback } from 'react'
import { StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function ExploreLayout() {
	const { activeDocument, importedDocuments, openPicker, refresh: refreshActiveDocument } = useActiveDocument()

	const refresh = useCallback(async () => {
		await refreshActiveDocument()
	}, [refreshActiveDocument])

	useFocusEffect(
		useCallback(() => {
			void refresh()
		}, [refresh])
	)

	return (
		<ExploreLayoutContextProvider
			value={{
				activeDocument,
				importedDocuments,
				openPicker,
				refresh,
			}}
		>
			<SafeAreaView style={styles.safeArea}>
				<View style={styles.content}>
					<Stack
						screenOptions={{
							headerShown: false,
							contentStyle: { backgroundColor: omColors.grayscale850 },
							animation: 'default',
						}}
					>
						<Stack.Screen name="index" />
						<Stack.Screen name="[category]" />
					</Stack>
				</View>
			</SafeAreaView>
		</ExploreLayoutContextProvider>
	)
}

const styles = StyleSheet.create({
	safeArea: {
		flex: 1,
		backgroundColor: omColors.grayscale850,
	},
	content: {
		flex: 1,
	},
})
