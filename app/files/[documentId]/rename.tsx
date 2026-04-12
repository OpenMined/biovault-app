import { OMText } from '@/components/ui/OMText'
import { getDisplayNameBase, loadHomeImportState, saveHomeImportState } from '@/lib/home-import'
import { omColors, omRadius, omSpacing, omTheme } from '@/styles/brand'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import {
	Alert,
	Keyboard,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	StyleSheet,
	TextInput,
	View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function RenameFileScreen() {
	const params = useLocalSearchParams<{ documentId?: string }>()
	const [draftName, setDraftName] = useState('')
	const [originalName, setOriginalName] = useState('')

	useEffect(() => {
		if (!params.documentId) {
			return
		}

		void loadHomeImportState()
			.then((state) => {
				const document = state.importedDocuments.find((item) => item.id === params.documentId)
				if (!document) {
					return
				}

				setDraftName(document.name)
				setOriginalName(getDisplayNameBase(document.originalName))
			})
			.catch((error) => {
				console.error('Failed to load document for rename:', error)
			})
	}, [params.documentId])

	const handleSave = () => {
		if (!params.documentId) {
			return
		}

		const nextName = draftName.trim() || originalName

		void loadHomeImportState()
			.then((state) => {
				const nextDocuments = state.importedDocuments.map((item) =>
					item.id === params.documentId ? { ...item, name: nextName } : item
				)

				saveHomeImportState({
					activeImportedDocumentId: state.activeImportedDocumentId,
					dataSource: state.dataSource,
					importedDocuments: nextDocuments,
				})
				router.back()
			})
			.catch((error) => {
				console.error('Failed to rename document:', error)
				Alert.alert('Rename failed', 'Unable to save the display name right now.')
			})
	}

	return (
		<SafeAreaView style={styles.safeArea}>
			<KeyboardAvoidingView
				behavior={Platform.OS === 'ios' ? 'padding' : undefined}
				style={styles.keyboardRoot}
			>
				<Pressable style={styles.backdrop} onPress={Keyboard.dismiss}>
					<View style={styles.sheet}>
						<View style={styles.topBar}>
							<Pressable onPress={() => router.back()} style={styles.closeButton}>
								<OMText variant="subtitle" style={styles.closeButtonText}>
									Close
								</OMText>
							</Pressable>
						</View>

						<OMText variant="h4" style={styles.title}>
							Rename file
						</OMText>
						<TextInput
							value={draftName}
							onChangeText={setDraftName}
							onSubmitEditing={handleSave}
							placeholder={originalName}
							placeholderTextColor={omColors.grayscale500}
							autoCorrect={false}
							autoCapitalize="none"
							autoFocus
							blurOnSubmit
							returnKeyType="done"
							style={styles.nameInput}
						/>

						<View style={styles.actions}>
							<Pressable onPress={() => setDraftName(originalName)} style={styles.secondaryButton}>
								<OMText variant="subtitle" style={styles.secondaryButtonText}>
									Reset
								</OMText>
							</Pressable>
							<Pressable onPress={handleSave} style={styles.primaryButton}>
								<OMText variant="subtitle" style={styles.primaryButtonText}>
									Save Name
								</OMText>
							</Pressable>
						</View>
					</View>
				</Pressable>
			</KeyboardAvoidingView>
		</SafeAreaView>
	)
}

const styles = StyleSheet.create({
	safeArea: {
		flex: 1,
		backgroundColor: omColors.grayscale850,
	},
	keyboardRoot: {
		flex: 1,
	},
	backdrop: {
		flex: 1,
		backgroundColor: 'rgba(23,22,29,0.72)',
		padding: omSpacing.xl,
		justifyContent: 'center',
	},
	sheet: {
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.1)',
		padding: omSpacing.xl,
		gap: omSpacing.xl,
	},
	topBar: {
		alignItems: 'flex-start',
	},
	closeButton: {
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.full,
		backgroundColor: 'rgba(255,255,255,0.08)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.12)',
	},
	closeButtonText: {
		color: omColors.grayscale300,
	},
	title: {
		color: omTheme.primaryText,
	},
	nameInput: {
		paddingHorizontal: omSpacing.l,
		paddingVertical: omSpacing.m,
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale850,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.1)',
		color: omTheme.primaryText,
		fontSize: 16,
		lineHeight: 24,
	},
	actions: {
		flexDirection: 'row',
		justifyContent: 'flex-end',
		gap: omSpacing.s,
	},
	secondaryButton: {
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.full,
		backgroundColor: 'rgba(255,255,255,0.08)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.12)',
	},
	secondaryButtonText: {
		color: omColors.grayscale300,
	},
	primaryButton: {
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.full,
		backgroundColor: omTheme.accent,
	},
	primaryButtonText: {
		color: omTheme.primaryText,
	},
})
