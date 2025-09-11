import { withLayoutContext } from 'expo-router'
import {
	createNativeBottomTabNavigator,
	NativeBottomTabNavigationOptions,
	NativeBottomTabNavigationEventMap,
} from '@bottom-tabs/react-navigation'
import { ParamListBase, TabNavigationState } from '@react-navigation/native'

const BottomTabNavigator = createNativeBottomTabNavigator().Navigator

const Tabs = withLayoutContext<
	NativeBottomTabNavigationOptions,
	typeof BottomTabNavigator,
	TabNavigationState<ParamListBase>,
	NativeBottomTabNavigationEventMap
>(BottomTabNavigator)

export default function TabLayout() {
	return (
		<Tabs tabBarActiveTintColor={'#059669'}>
			<Tabs.Screen
				name="index"
				options={{
					title: 'My DNA',
					tabBarIcon: () => ({ sfSymbol: 'testtube.2' }),
				}}
			/>
			<Tabs.Screen
				name="analyze"
				options={{
					title: 'Analyze',
					tabBarIcon: () => ({ sfSymbol: 'rectangle.and.text.magnifyingglass' }),
				}}
			/>

			<Tabs.Screen
				name="references"
				options={{
					title: 'References',
					tabBarIcon: () => ({ sfSymbol: 'server.rack' }),
				}}
			/>
			<Tabs.Screen
				name="network"
				options={{
					title: 'Network',
					tabBarIcon: () => ({ sfSymbol: 'person.line.dotted.person' }),
				}}
			/>
			<Tabs.Screen
				name="guides"
				options={{
					title: 'Guides',
					tabBarIcon: () => ({ sfSymbol: 'book' }),
				}}
			/>
		</Tabs>
	)
}
