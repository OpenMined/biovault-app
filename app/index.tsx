import { Redirect } from 'expo-router'
import { getAppPreferenceSync } from '@/lib/app-preferences'

// ts-prune-ignore-next
export default function Index() {
	const completedOnboarding = getAppPreferenceSync('hasCompletedOnboarding')
	const acceptedDisclaimer = getAppPreferenceSync('hasAcceptedResearchDisclaimer')
	if (completedOnboarding && acceptedDisclaimer) {
		return <Redirect href={'/(tabs)' as any} />
	}
	return <Redirect href="/onboarding" />
}
