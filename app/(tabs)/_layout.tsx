import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs'
import { Platform } from 'react-native'

// ts-prune-ignore-next
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
					<Icon
						selectedColor={'white'}
						src={{
							default: require('../../assets/tabbar/dna.svg'),
							selected: require('../../assets/tabbar/dna.svg'),
						}}
					/>
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
						drawable="ic_menu_search"
					/>
				) : (
					<Icon
						selectedColor={'white'}
						src={{
							default: require('../../assets/tabbar/brain.svg'),
							selected: require('../../assets/tabbar/brain.svg'),
						}}
					/>
				)}
			</NativeTabs.Trigger>
			<NativeTabs.Trigger name="feed">
				<Label>Feed</Label>
				{Platform.OS === 'ios' ? (
					<Icon sf={{ default: 'newspaper', selected: 'newspaper.fill' }} />
				) : (
					<Icon
						selectedColor={'white'}
						src={{
							default: require('../../assets/tabbar/newspaper.svg'),
							selected: require('../../assets/tabbar/newspaper.svg'),
						}}
					/>
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
					<Icon
						selectedColor={'white'}
						src={{
							default: require('../../assets/tabbar/microscope.svg'),
							selected: require('../../assets/tabbar/microscope.svg'),
						}}
					/>
				)}
			</NativeTabs.Trigger>
			<NativeTabs.Trigger name="settings">
				<Label>Settings</Label>
				{Platform.OS === 'ios' ? (
					<Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} />
				) : (
					<Icon
						selectedColor={'white'}
						src={{
							default: require('../../assets/tabbar/settings.svg'),
							selected: require('../../assets/tabbar/settings.svg'),
						}}
					/>
				)}
			</NativeTabs.Trigger>
		</NativeTabs>
	)
}
