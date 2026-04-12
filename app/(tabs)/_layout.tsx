import { NativeTabs } from 'expo-router/unstable-native-tabs'
import { omColors, omTheme } from '@/styles/brand'
import { Platform } from 'react-native'

export default function TabLayout() {
	const selectedIconColor = Platform.OS === 'android' ? omTheme.primaryText : omTheme.accent

	return (
		<NativeTabs
			backgroundColor={omColors.grayscale950}
			tintColor={Platform.OS === 'ios' ? omTheme.accent : omTheme.accent}
			indicatorColor={omTheme.accent}
			rippleColor="transparent"
			iconColor={Platform.OS === 'ios' ? undefined : omColors.grayscale500}
		>
			<NativeTabs.Trigger name="home">
				<NativeTabs.Trigger.Label>Files</NativeTabs.Trigger.Label>
				{/* <NativeTabs.Trigger.Icon
					selectedColor={selectedIconColor}
					sf={{ default: 'house', selected: 'house.fill' }}
					drawable="ic_menu_home"
				/> */}
					<NativeTabs.Trigger.Icon
					selectedColor={selectedIconColor}
					sf={{ default: 'folder', selected: 'folder.fill' }}
					md="folder"
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
	)
}
