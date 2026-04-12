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
			<NativeTabs.Trigger name="explore">
				<NativeTabs.Trigger.Label>Explore</NativeTabs.Trigger.Label>
				<NativeTabs.Trigger.Icon
					selectedColor={selectedIconColor}
					sf={{ default: 'safari', selected: 'safari.fill' }}
					// src={require("../../assets/images/house.svg")}
					drawable="ic_menu_compass"
				/>
			</NativeTabs.Trigger>
			<NativeTabs.Trigger name="home">
				<NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
				<NativeTabs.Trigger.Icon
					selectedColor={selectedIconColor}
					sf={{ default: 'house', selected: 'house.fill' }}
					drawable="ic_menu_home"
					// src={require("../../assets/images/house.svg")}
				/>
			</NativeTabs.Trigger>
			<NativeTabs.Trigger name="results">
				<NativeTabs.Trigger.Label>Results</NativeTabs.Trigger.Label>
				<NativeTabs.Trigger.Icon
					selectedColor={selectedIconColor}
					sf={{ default: 'list.bullet.rectangle', selected: 'list.bullet.rectangle.fill' }}
					drawable="ic_menu_sort_by_size"
				/>
			</NativeTabs.Trigger>
			<NativeTabs.Trigger hidden name="insights">
				<NativeTabs.Trigger.Label>Insights</NativeTabs.Trigger.Label>
				<NativeTabs.Trigger.Icon
					selectedColor={selectedIconColor}
					sf={{
						default: 'brain.head.profile',
						selected: 'brain.filled.head.profile',
					}}
					drawable="ic_menu_search"
				/>
			</NativeTabs.Trigger>
			<NativeTabs.Trigger name="feed">
				<NativeTabs.Trigger.Label>Notifications</NativeTabs.Trigger.Label>
				<NativeTabs.Trigger.Icon
					selectedColor={selectedIconColor}
					sf={{ default: 'bell', selected: 'bell.fill' }}
					drawable="ic_menu_agenda"
				/>
			</NativeTabs.Trigger>
			<NativeTabs.Trigger hidden name="research">
				<NativeTabs.Trigger.Label>Research</NativeTabs.Trigger.Label>
				<NativeTabs.Trigger.Icon
					selectedColor={selectedIconColor}
					sf={{
						default: 'person.line.dotted.person',
						selected: 'person.line.dotted.person.fill',
					}}
					drawable="ic_menu_share"
				/>
			</NativeTabs.Trigger>
			<NativeTabs.Trigger name="settings">
				<NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
				<NativeTabs.Trigger.Icon
					selectedColor={selectedIconColor}
					sf={{ default: 'gearshape', selected: 'gearshape.fill' }}
					drawable="ic_menu_preferences"
				/>
			</NativeTabs.Trigger>
		</NativeTabs>
	)
}
