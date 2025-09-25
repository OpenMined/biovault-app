import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs'
import { Platform } from 'react-native'

export default function TabLayout() {
	return (
		<NativeTabs
			tintColor={Platform.OS === 'ios' ? '#059669' : undefined}
			indicatorColor={'#059669'}
			iconColor={Platform.OS === 'ios' ? undefined : '#059669'}
		>
			<NativeTabs.Trigger name="index">
				<Label>My DNA</Label>
				{Platform.OS === 'ios' ? (
					<Icon sf={{ default: 'testtube.2', selected: 'testtube.2' }} />
				) : (
					<Icon selectedColor={'white'} drawable="ic_menu_compass" />
				)}
			</NativeTabs.Trigger>
			<NativeTabs.Trigger name="insights">
				<Label>Insights</Label>
				{Platform.OS === 'ios' ? (
					<Icon
						sf={{
							default: 'brain.head.profile',
							selected: 'brain.filled.head.profile',
						}}
					/>
				) : (
					<Icon selectedColor={'white'} drawable="ic_menu_search" />
				)}
			</NativeTabs.Trigger>
			<NativeTabs.Trigger name="feed">
				<Label>Feed</Label>
				{Platform.OS === 'ios' ? (
					<Icon sf={{ default: 'newspaper', selected: 'newspaper.fill' }} />
				) : (
					<Icon selectedColor={'white'} drawable="ic_menu_agenda" />
				)}
			</NativeTabs.Trigger>
			<NativeTabs.Trigger name="research">
				<Label>Research</Label>
				{Platform.OS === 'ios' ? (
					<Icon
						sf={{
							default: 'person.line.dotted.person',
							selected: 'person.line.dotted.person.fill',
						}}
						drawable="ic_menu_share"
					/>
				) : (
					<Icon selectedColor={'white'} drawable="ic_menu_share" />
				)}
			</NativeTabs.Trigger>
			<NativeTabs.Trigger name="settings">
				<Label>Settings</Label>
				{Platform.OS === 'ios' ? (
					<Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} />
				) : (
					<Icon selectedColor={'white'} drawable="ic_menu_preferences" />
				)}
			</NativeTabs.Trigger>
		</NativeTabs>
	)
}
