import { ActiveDocumentPickerDropdown } from '@/components/explore/ActiveDocumentPickerDropdown'
import { ExploreActiveFileBar } from '@/components/explore/ExploreActiveFileBar'
import { ExploreLayoutContextProvider } from '@/components/explore/ExploreLayoutContext'
import {
	getActiveImportedDocument,
	loadHomeImportState,
	setActiveImportedDocumentId,
	type HomeImportedDocument,
} from '@/lib/home-import'
import { isExploreDemoModeEnabledSync, setExploreDemoModeEnabledSync } from '@/lib/demo-mode'
import { omColors, omSpacing } from '@/styles/brand'
import { Stack } from 'expo-router'
import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Animated, Easing, Pressable, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { OMText } from '@/components/ui/OMText'
import { OMButton } from '@/components/ui/OMButton'

export default function ExploreLayout() {
	const [activeDocument, setActiveDocument] = useState<HomeImportedDocument | null>(null)
	const [importedDocuments, setImportedDocuments] = useState<HomeImportedDocument[]>([])
	const [isPickerOpen, setIsPickerOpen] = useState(false)
	const [isDemoActive, setIsDemoActive] = useState(false)
	const demoOpacity = useRef(new Animated.Value(0)).current
	const demoCardTranslateY = useRef(new Animated.Value(16)).current

	const refresh = useCallback(async () => {
		try {
			const state = await loadHomeImportState()
			setImportedDocuments(state.importedDocuments)
			setActiveDocument(getActiveImportedDocument(state))
			setIsDemoActive(isExploreDemoModeEnabledSync())
		} catch (error) {
			console.error('Failed to load Explore layout file context:', error)
			setImportedDocuments([])
			setActiveDocument(null)
			setIsDemoActive(false)
		}
	}, [])

	useFocusEffect(
		useCallback(() => {
			void refresh()
		}, [refresh])
	)

	useEffect(() => {
		if (!isDemoActive) {
			return
		}

		setIsPickerOpen(false)
		demoOpacity.setValue(0)
		demoCardTranslateY.setValue(16)

		Animated.parallel([
			Animated.timing(demoOpacity, {
				toValue: 1,
				duration: 320,
				easing: Easing.out(Easing.cubic),
				useNativeDriver: true,
			}),
			Animated.timing(demoCardTranslateY, {
				toValue: 0,
				duration: 320,
				easing: Easing.out(Easing.cubic),
				useNativeDriver: true,
			}),
		]).start()
	}, [demoCardTranslateY, demoOpacity, isDemoActive])

	const finishDemo = useCallback(() => {
		Animated.parallel([
			Animated.timing(demoOpacity, {
				toValue: 0,
				duration: 220,
				easing: Easing.in(Easing.quad),
				useNativeDriver: true,
			}),
			Animated.timing(demoCardTranslateY, {
				toValue: 12,
				duration: 220,
				easing: Easing.in(Easing.quad),
				useNativeDriver: true,
			}),
		]).start(({ finished }) => {
			if (!finished) {
				return
			}

			setExploreDemoModeEnabledSync(false)
			setIsDemoActive(false)
		})
	}, [demoCardTranslateY, demoOpacity])

	const dismissDemo = useCallback(() => {
		Alert.alert('Rest of demo is WIP', undefined, [
			{
				text: 'OK',
				onPress: finishDemo,
			},
		])
	}, [finishDemo])

	return (
		<ExploreLayoutContextProvider
			value={{
				activeDocument,
				importedDocuments,
				openPicker: () => {
					if (!isDemoActive) {
						setIsPickerOpen(true)
					}
				},
				refresh,
			}}
		>
			<SafeAreaView style={styles.safeArea}>
				<View style={styles.container}>
					{isPickerOpen ? <Pressable style={styles.dismissOverlay} onPress={() => setIsPickerOpen(false)} /> : null}

					<View style={styles.stickyChrome}>
						<View style={styles.stickyBar}>
							<ExploreActiveFileBar
								fileName={activeDocument ? activeDocument.name : 'No active file selected'}
								isHighlighted={isDemoActive}
								onPress={() => {
									if (!isDemoActive) {
										setIsPickerOpen((current) => !current)
									}
								}}
							/>
						</View>
						{isPickerOpen ? (
							<View style={styles.dropdownLayer}>
								<ActiveDocumentPickerDropdown
									documents={importedDocuments}
									activeDocumentId={activeDocument?.id ?? null}
									emptyBody="Import a file first to get file-aware assay recommendations."
									onSelectDocument={(document) => {
										void setActiveImportedDocumentId(document.id)
											.then(async () => {
												await refresh()
												setIsPickerOpen(false)
											})
											.catch((error) => {
												console.error('Failed to update active file:', error)
											})
									}}
								/>
							</View>
						) : null}
					</View>

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

					{isDemoActive ? (
						<Animated.View style={[styles.demoOverlay, { opacity: demoOpacity }]}>
							<View style={styles.demoStickyBar} pointerEvents="none">
								<ExploreActiveFileBar
									fileName={activeDocument ? activeDocument.name : 'No active file selected'}
									isHighlighted
									onPress={() => {}}
								/>
							</View>
							<Animated.View
								style={[
									styles.demoCoachmark,
									{
										transform: [{ translateY: demoCardTranslateY }],
									},
								]}
							>
								<OMText variant="headline" style={styles.demoTitle}>
									Select your genomic file
								</OMText>
								<OMText variant="body" style={styles.demoBody}>
									This is where you select the genomic file BioVault uses when showing file-aware
									tests and recommendations.
								</OMText>
								<OMButton label="Next" onPress={dismissDemo} style={styles.demoNextButton} />
							</Animated.View>
						</Animated.View>
					) : null}
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
	container: {
		flex: 1,
		backgroundColor: omColors.grayscale850,
	},
	dismissOverlay: {
		...StyleSheet.absoluteFillObject,
		zIndex: 1,
	},
	stickyChrome: {
		position: 'relative',
		zIndex: 2,
	},
	stickyBar: {
		paddingHorizontal: omSpacing.xl,
		paddingTop: omSpacing.m,
		paddingBottom: omSpacing.s,
	},
	dropdownLayer: {
		position: 'absolute',
		left: omSpacing.xl,
		right: omSpacing.xl,
		top: '100%',
	},
	content: {
		flex: 1,
	},
	demoOverlay: {
		position: 'absolute',
		...StyleSheet.absoluteFillObject,
		zIndex: 5,
		backgroundColor: 'rgba(3,8,18,0.82)',
	},
	demoStickyBar: {
		paddingHorizontal: omSpacing.xl,
		paddingTop: omSpacing.m,
		paddingBottom: omSpacing.s,
	},
	demoCoachmark: {
		alignSelf: 'stretch',
		marginHorizontal: omSpacing.xl,
		marginTop: omSpacing.s,
		padding: omSpacing.l,
		borderRadius: 20,
		backgroundColor: 'rgba(9,15,28,0.96)',
		borderWidth: 1,
		borderColor: 'rgba(82,168,197,0.45)',
	},
	demoTitle: {
		color: omColors.grayscale00,
		marginBottom: omSpacing.s,
	},
	demoBody: {
		color: omColors.grayscale150,
		lineHeight: 22,
	},
	demoNextButton: {
		marginTop: omSpacing.l,
	},
})
