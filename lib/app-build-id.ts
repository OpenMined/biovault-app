import Constants from 'expo-constants'

// Baked at web build time by `scripts/build-id.mjs` via EXPO_PUBLIC_BUILD_ID
// (see package.json deploy-web-prod). Falls back to the app version in dev.
export const APP_BUILD_ID =
	process.env.EXPO_PUBLIC_BUILD_ID ||
	`${Constants.expoConfig?.version ?? '0.0.0'}+dev`
