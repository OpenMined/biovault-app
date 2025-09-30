import { Redirect } from 'expo-router'
import { Storage } from '@/lib/storage'

// ts-prune-ignore-next
export default function Index() {
	const completedOnboarding = Storage.getItemSync('hasCompletedOnboarding')
	if (completedOnboarding) {
		return <Redirect href="/(tabs)" />
	}
	return <Redirect href="/onboarding" />
}
