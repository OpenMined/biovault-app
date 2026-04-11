import { NativeTabs } from 'expo-router/unstable-native-tabs'
import { Platform } from 'react-native'

export default function TabLayout() {
	return (
		<NativeTabs
			tintColor={Platform.OS === 'ios' ? '#059669' : undefined}
			indicatorColor={'#059669'}
			iconColor={Platform.OS === 'ios' ? undefined : '#059669'}
		>
			<NativeTabs.Trigger name="index">
				<NativeTabs.Trigger.Label>Vault</NativeTabs.Trigger.Label>
				<NativeTabs.Trigger.Icon
					selectedColor={'white'}
					sf={{ default: 'lock.app.dashed', selected: 'lock.app.dashed' }}
					drawable="ic_menu_compass"
				/>
			</NativeTabs.Trigger>
			<NativeTabs.Trigger name="home">
				<NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
				<NativeTabs.Trigger.Icon
					selectedColor={'white'}
					sf={{ default: 'house', selected: 'house.fill' }}
					drawable="ic_menu_view"
				/>
			</NativeTabs.Trigger>
			<NativeTabs.Trigger hidden name="insights">
				<NativeTabs.Trigger.Label>Insights</NativeTabs.Trigger.Label>
				<NativeTabs.Trigger.Icon
					selectedColor={'white'}
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
					selectedColor={'white'}
					sf={{ default: 'bell', selected: 'bell.fill' }}
					drawable="ic_menu_agenda"
				/>
			</NativeTabs.Trigger>
			<NativeTabs.Trigger hidden name="research">
				<NativeTabs.Trigger.Label>Research</NativeTabs.Trigger.Label>
				<NativeTabs.Trigger.Icon
					selectedColor={'white'}
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
					selectedColor={'white'}
					sf={{ default: 'gearshape', selected: 'gearshape.fill' }}
					drawable="ic_menu_preferences"
				/>
			</NativeTabs.Trigger>
		</NativeTabs>
	)
}
