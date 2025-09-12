import {
	createNativeBottomTabNavigator,
	NativeBottomTabNavigationEventMap,
	NativeBottomTabNavigationOptions,
} from '@bottom-tabs/react-navigation'
import { ParamListBase, TabNavigationState } from '@react-navigation/native'
import { withLayoutContext } from 'expo-router'

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
					tabBarLabel: 'My DNA',
					// tabBarIcon: () => ({ sfSymbol: 'testtube.2' }),
					tabBarIcon: () => ({ uri: require('../../assets/images/home.svg') }),
				}}
			/>
			<Tabs.Screen
				name="analyze"
				options={{
					title: 'Analyze',
					// tabBarIcon: () => ({ sfSymbol: 'rectangle.and.text.magnifyingglass' }),
					tabBarIcon: () => ({ uri: require('../../assets/images/home.svg') }),
				}}
			/>

			<Tabs.Screen
				name="references"
				options={{
					title: 'References',
					// tabBarIcon: () => ({ sfSymbol: 'server.rack' }),
					tabBarIcon: () => ({ uri: require('../../assets/images/home.svg') }),
				}}
			/>
			<Tabs.Screen
				name="network"
				options={{
					title: 'Network',
					// tabBarIcon: () => ({ sfSymbol: 'person.line.dotted.person' }),
					tabBarIcon: () => ({ uri: require('../../assets/images/home.svg') }),
				}}
			/>
			<Tabs.Screen
				name="guides"
				options={{
					title: 'Guides',
					// tabBarIcon: () => ({ sfSymbol: 'book' }),
					tabBarIcon: () => ({ uri: require('../../assets/images/home.svg') }),
				}}
			/>
		</Tabs>
	)
}
