import { Redirect } from 'expo-router'
import { Storage } from '@/lib/storage'

// ts-prune-ignore-next
export default function Index() {
	const completedOnboarding = Storage.getItemSync('hasCompletedOnboarding')
	const acceptedDisclaimer = Storage.getItemSync('hasAcceptedResearchDisclaimer')
	if (completedOnboarding && acceptedDisclaimer) {
		return <Redirect href={'/(tabs)' as any} />
	}
	return <Redirect href="/onboarding" />
}
