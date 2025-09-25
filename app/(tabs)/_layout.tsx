import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs'
import { Platform } from 'react-native'

export default function TabLayout() {
	return (
		<NativeTabs
			tintColor={Platform.OS === 'ios' ? '#059669' : undefined}
			indicatorColor={'#059669'}
		>
			<NativeTabs.Trigger name="index">
				<Label>My DNA</Label>
				<Icon
					sf={{
						default: 'testtube.2',
						selected: 'testtube.2',
					}}
					drawable="ic_menu_compass"
				/>
			</NativeTabs.Trigger>
			<NativeTabs.Trigger name="insights">
				<Label>Insights</Label>
				<Icon
					sf={{
						default: 'brain.head.profile',
						selected: 'brain.filled.head.profile',
					}}
					drawable="ic_menu_search"
				/>
			</NativeTabs.Trigger>

			<NativeTabs.Trigger name="research">
				<Label>Research</Label>
				<Icon
					sf={{
						default: 'person.line.dotted.person',
						selected: 'person.line.dotted.person.fill',
					}}
					drawable="ic_menu_share"
				/>
			</NativeTabs.Trigger>
		</NativeTabs>
	)
}
