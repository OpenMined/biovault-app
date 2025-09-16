import { Badge, Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs'
import { Platform } from 'react-native'

export default function TabLayout() {
	return (
		<NativeTabs
			tintColor={Platform.OS === 'web' ? 'white' : Platform.OS === 'ios' ? '#059669' : undefined}
			backgroundColor={Platform.OS === 'web' ? 'white' : undefined}
			indicatorColor={'#059669'}
			badgeBackgroundColor={Platform.OS === 'web' ? '#059669' : undefined}
			labelStyle={Platform.OS === 'web' ? { color: 'black' } : {}}
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
			{Platform.OS === 'web' && (
				<NativeTabs.Trigger name="(web)/network">
					<Label>Network</Label>
					<Icon
						sf={{
							default: 'network',
							selected: 'network',
						}}
						drawable="ic_menu_network"
					/>
				</NativeTabs.Trigger>
			)}
			{Platform.OS === 'web' && (
				<NativeTabs.Trigger name="(web)/biobanks">
					<Label>Biobanks</Label>
					<Icon
						sf={{
							default: 'building.2.fill',
							selected: 'building.2.fill',
						}}
						drawable="ic_menu_biobanks"
					/>
				</NativeTabs.Trigger>
			)}
			{Platform.OS === 'web' && (
				<NativeTabs.Trigger name="(web)/inbox">
					<Badge selectedBackgroundColor={'#059669'}>2</Badge>
					<Label>Inbox</Label>
					<Icon
						sf={{
							default: 'tray.fill',
							selected: 'tray.fill',
						}}
						drawable="ic_menu_inbox"
					/>
				</NativeTabs.Trigger>
			)}
			{Platform.OS === 'web' && (
				<NativeTabs.Trigger name="(web)/pipelines">
					<Label>Pipelines</Label>
					<Icon
						sf={{
							default: 'flowchart.fill',
							selected: 'flowchart.fill',
						}}
						drawable="ic_menu_pipelines"
					/>
				</NativeTabs.Trigger>
			)}
			{Platform.OS === 'web' && (
				<NativeTabs.Trigger name="(web)/profile">
					<Label>Profile</Label>
					<Icon
						sf={{
							default: 'person.circle.fill',
							selected: 'person.circle.fill',
						}}
						drawable="ic_menu_profile"
					/>
				</NativeTabs.Trigger>
			)}
		</NativeTabs>
	)
}
