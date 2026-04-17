import { ActiveDocumentProvider, useActiveDocument } from '@/components/explore/ActiveDocumentContext'
import { OMIcon } from '@/components/ui/OMIcon'
import { OMText } from '@/components/ui/OMText'
import { cycleColorSchemePreferenceSync, useColorSchemePreference } from '@/lib/color-theme'
import { Slot } from 'expo-router'
import { NativeTabs } from 'expo-router/unstable-native-tabs'
import { omColors, omRadius, omTheme } from '@/styles/brand'
import { useFocusEffect } from '@react-navigation/native'
import { useCallback } from 'react'
import { Platform, Pressable, StyleSheet, View } from 'react-native'

function TabChrome() {
	const selectedIconColor = Platform.OS === 'android' ? omTheme.primaryText : omTheme.accent
	const { refresh } = useActiveDocument()

	useFocusEffect(
		useCallback(() => {
			void refresh()
		}, [refresh])
	)

	return (
		<View style={styles.container}>
			<NativeTabs
				backgroundColor={omColors.grayscale950}
				tintColor={Platform.OS === 'ios' ? omTheme.accent : omTheme.accent}
				indicatorColor={omTheme.accent}
				rippleColor="transparent"
				iconColor={Platform.OS === 'ios' ? undefined : omColors.grayscale500}
			>
				<NativeTabs.Trigger name="files">
					<NativeTabs.Trigger.Label>Files</NativeTabs.Trigger.Label>
					<NativeTabs.Trigger.Icon
						selectedColor={selectedIconColor}
						sf={{ default: 'folder', selected: 'folder.fill' }}
						md="folder"
					/>
				</NativeTabs.Trigger>
				<NativeTabs.Trigger name="lab">
					<NativeTabs.Trigger.Label>Lab</NativeTabs.Trigger.Label>
					<NativeTabs.Trigger.Icon
						selectedColor={selectedIconColor}
						sf={{ default: 'flask', selected: 'flask.fill' }}
						md="science"
					/>
				</NativeTabs.Trigger>
				<NativeTabs.Trigger name="explore">
					<NativeTabs.Trigger.Label>Explore</NativeTabs.Trigger.Label>
					<NativeTabs.Trigger.Icon
						selectedColor={selectedIconColor}
						sf={{ default: 'safari', selected: 'safari.fill' }}
						md="explore"
					/>
				</NativeTabs.Trigger>
				<NativeTabs.Trigger name="results">
					<NativeTabs.Trigger.Label>Results</NativeTabs.Trigger.Label>
					<NativeTabs.Trigger.Icon
						selectedColor={selectedIconColor}
						sf={{ default: 'list.bullet.rectangle', selected: 'list.bullet.rectangle.fill' }}
						md="assignment"
					/>
				</NativeTabs.Trigger>
				<NativeTabs.Trigger name="feed">
					<NativeTabs.Trigger.Label>Feed</NativeTabs.Trigger.Label>
					<NativeTabs.Trigger.Icon
						selectedColor={selectedIconColor}
						sf={{ default: 'bell', selected: 'bell.fill' }}
						md="notifications"
					/>
				</NativeTabs.Trigger>
				<NativeTabs.Trigger name="settings">
					<NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
					<NativeTabs.Trigger.Icon
						selectedColor={selectedIconColor}
						sf={{ default: 'gearshape', selected: 'gearshape.fill' }}
						drawable="settings"
					/>
				</NativeTabs.Trigger>
			</NativeTabs>
		</View>
	)
}

function WebThemeToggle() {
	const pref = useColorSchemePreference()
	const { icon, label } =
		pref === 'light'
			? { icon: 'sunny-outline' as const, label: 'Light' }
			: pref === 'dark'
				? { icon: 'moon-outline' as const, label: 'Dark' }
				: { icon: 'contrast-outline' as const, label: 'Auto' }
	return (
		<Pressable
			onPress={() => cycleColorSchemePreferenceSync()}
			style={styles.webThemeButton}
			accessibilityLabel={`Color theme: ${label}. Tap to cycle.`}
		>
			<OMIcon name={icon} size={16} tone="accent" />
			<OMText variant="caption" style={styles.webThemeButtonText}>
				{label}
			</OMText>
		</Pressable>
	)
}

export default function TabLayout() {
	return (
		<ActiveDocumentProvider>
			{Platform.OS === 'web' ? (
				<View style={styles.container}>
					<Slot />
					<View style={styles.webTopActions}>
						<WebThemeToggle />
					</View>
				</View>
			) : <TabChrome />}
		</ActiveDocumentProvider>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	webTopActions: {
		position: 'absolute',
		top: 20,
		right: 20,
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		zIndex: 1000,
	},
	webThemeButton: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
		height: 40,
		paddingHorizontal: 14,
		borderRadius: omRadius.full,
		backgroundColor: 'rgba(23,22,29,0.78)',
		borderWidth: 1,
		borderColor: 'rgba(83,190,169,0.24)',
	},
	webThemeButtonText: {
		color: omTheme.primaryText,
	},
})
