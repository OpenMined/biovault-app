import { Tabs } from 'expo-router'
import { Platform, Text } from 'react-native'

// ts-prune-ignore-next
export default function TabLayout() {
	return (
		<Tabs
			screenOptions={{
				tabBarActiveTintColor: 'white',
				tabBarInactiveTintColor: 'gray',
				headerShown: false,
				tabBarStyle: {
					backgroundColor: '#ffffff',
					borderTopWidth: 1,
					borderTopColor: '#e0e0e0',
					height: Platform.OS === 'ios' ? 85 : 70,
					paddingBottom: Platform.OS === 'ios' ? 25 : 8,
					paddingTop: 8,
					paddingHorizontal: 10,
					position: 'absolute',
					bottom: 0,
				},
				tabBarItemStyle: {
					borderRadius: 8,
					marginHorizontal: 3,
					marginVertical: 2,
					height: 46,
				},
				tabBarActiveBackgroundColor: '#059669',
				tabBarInactiveBackgroundColor: 'transparent',
				tabBarShowLabel: true,
				tabBarLabelStyle: {
					fontSize: 10,
					fontWeight: '600',
					marginTop: -2,
				},
			}}
		>
			<Tabs.Screen
				name="index"
				options={{
					title: 'My DNA',
					tabBarIcon: ({ color }) => {
						if (Platform.OS === 'ios') {
							return <TabBarIcon name="testtube.2" color={color} />
						}
						return <TabBarIcon name="dna" color={color} />
					},
				}}
			/>
			<Tabs.Screen
				name="insights"
				options={{
					title: 'Insights',
					tabBarIcon: ({ color }) => {
						if (Platform.OS === 'ios') {
							return <TabBarIcon name="brain.head.profile" color={color} />
						}
						return <TabBarIcon name="brain" color={color} />
					},
				}}
			/>
			<Tabs.Screen
				name="feed"
				options={{
					title: 'Feed',
					tabBarIcon: ({ color }) => {
						if (Platform.OS === 'ios') {
							return <TabBarIcon name="newspaper" color={color} />
						}
						return <TabBarIcon name="newspaper" color={color} />
					},
				}}
			/>
			<Tabs.Screen
				name="research"
				options={{
					title: 'Research',
					tabBarIcon: ({ color }) => {
						if (Platform.OS === 'ios') {
							return <TabBarIcon name="person.line.dotted.person" color={color} />
						}
						return <TabBarIcon name="microscope" color={color} />
					},
				}}
			/>
			<Tabs.Screen
				name="settings"
				options={{
					title: 'Settings',
					tabBarIcon: ({ color }) => {
						if (Platform.OS === 'ios') {
							return <TabBarIcon name="gearshape" color={color} />
						}
						return <TabBarIcon name="settings" color={color} />
					},
				}}
			/>
		</Tabs>
	)
}

// Simple icon component for now - you can replace with actual icons
function TabBarIcon({ name, color }: { name: string; color: string }) {
	// For now, return text emojis based on the name
	// You can replace this with actual icon libraries like @expo/vector-icons
	const iconMap: { [key: string]: string } = {
		'testtube.2': '🧪',
		'dna': '🧬',
		'brain.head.profile': '🧠',
		'brain': '🧠',
		'newspaper': '📰',
		'person.line.dotted.person': '👥',
		'microscope': '🔬',
		'gearshape': '⚙️',
		'settings': '⚙️',
	}

	return (
		<Text style={{ color, fontSize: 24 }}>
			{iconMap[name] || '📱'}
		</Text>
	)
}