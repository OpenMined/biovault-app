import { Storage } from 'expo-sqlite/kv-store'
import { Redirect } from 'expo-router'

export default function Index() {
	const completedOnboarding = Storage.getItemSync('hasCompletedOnboarding')
	if (completedOnboarding) {
		return <Redirect href="/(tabs)" />
	}
	return <Redirect href="/onboarding" />
}
