import { getAppPreferenceSync, setAppPreferenceSync } from '@/lib/app-preferences'

const EXPLORE_DEMO_MODE_KEY = 'explore_demo_mode'

export function isExploreDemoModeEnabledSync() {
	return getAppPreferenceSync(EXPLORE_DEMO_MODE_KEY) === 'true'
}

export function setExploreDemoModeEnabledSync(isEnabled: boolean) {
	setAppPreferenceSync(EXPLORE_DEMO_MODE_KEY, isEnabled ? 'true' : null)
}
