import { ExpoConfig } from 'expo/config'

const APP_VARIANT = process.env.APP_VARIANT ?? 'development'
const IS_DEV = APP_VARIANT === 'development'
const IS_PREVIEW = process.env.APP_VARIANT === 'preview'
const ANDROID_GOOGLE_SERVICES_FILE = IS_DEV
	? './google-services-dev.json'
	: './google-services-prod.json'

interface EnvironmentValues {
	name: string
	bundleIdentifier: string
	package: string
	appleTeamId: string
	appleTeamName: string
}

function getEnvironmentValues(): EnvironmentValues {
	if (IS_DEV) {
		return {
			name: 'BioVault Dev',
			bundleIdentifier: 'org.openmined.biovault.dev',
			package: 'org.openmined.biovault.dev',
			appleTeamName: 'OpenMined Foundation',
			appleTeamId: '28PJ5N8D9X',
		}
	}
	if (IS_PREVIEW) {
		return {
			name: 'BioVault Preview',
			bundleIdentifier: 'org.openmined.biovault.preview',
			package: 'org.openmined.biovault.preview',
			appleTeamName: 'OpenMined Foundation',
			appleTeamId: '28PJ5N8D9X',
		}
	}
	return {
		name: 'BioVault',
		bundleIdentifier: 'org.openmined.biovault',
		package: 'org.openmined.biovault',
		appleTeamName: 'OpenMined Foundation',
		appleTeamId: '28PJ5N8D9X',
	}
}

const config: ExpoConfig = {
	name: getEnvironmentValues().name,
	owner: 'openmined',
	slug: 'biovault',
	version: '0.3.0',
	orientation: 'portrait',
	scheme: 'biovaultapp',
	icon: './assets/images/adaptive-icon.png',
	userInterfaceStyle: 'dark',
	ios: {
		bundleIdentifier: getEnvironmentValues().bundleIdentifier,
		appleTeamId: getEnvironmentValues().appleTeamId, // seems to require name not id
		supportsTablet: true,
		infoPlist: {
			ITSAppUsesNonExemptEncryption: false,
			UIFileSharingEnabled: true,
			LSSupportsOpeningDocumentsInPlace: true,
		},
		icon: {
			light: './assets/icons/ios-dark.png', // making dark default for now
			dark: './assets/icons/ios-dark.png',
			tinted: './assets/icons/ios-tinted.png'
		},
	},
	android: {
		package: getEnvironmentValues().package,
		googleServicesFile: ANDROID_GOOGLE_SERVICES_FILE,
		adaptiveIcon: {
			foregroundImage: './assets/icons/adaptive-icon.png',
			monochromeImage: './assets/icons/adaptive-icon.png',
			// backgroundColor: '#fcfcfd'
			backgroundColor: '#27253C', // dark default

		}
	},
	web: {
		bundler: 'metro',
		output: 'static',
		favicon: './assets/images/icon.png',
	},
	extra: {
		eas: {
			projectId: '6e5fc48a-f9db-4c16-8810-21acf9d978b0',
		},
	},
	plugins: [
		'expo-asset',
		[
			'expo-font',
			{
				fonts: [
					'node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf',
					'node_modules/@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf',
					'node_modules/@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf',
					'node_modules/@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf',
					'node_modules/@expo-google-fonts/inter/900Black/Inter_900Black.ttf',
					'node_modules/@expo-google-fonts/rubik/400Regular/Rubik_400Regular.ttf',
					'node_modules/@expo-google-fonts/rubik/500Medium/Rubik_500Medium.ttf',
					'node_modules/@expo-google-fonts/rubik/600SemiBold/Rubik_600SemiBold.ttf',
					'node_modules/@expo-google-fonts/rubik/700Bold/Rubik_700Bold.ttf',
					'node_modules/@expo-google-fonts/rubik/900Black/Rubik_900Black.ttf',
				],
				android: {
					fonts: [
						{
							fontFamily: 'Inter',
							fontDefinitions: [
								{
									path: 'node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf',
									weight: 400,
								},
								{
									path: 'node_modules/@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf',
									weight: 500,
								},
								{
									path: 'node_modules/@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf',
									weight: 600,
								},
								{
									path: 'node_modules/@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf',
									weight: 700,
								},
								{
									path: 'node_modules/@expo-google-fonts/inter/900Black/Inter_900Black.ttf',
									weight: 900,
								},
							],
						},
						{
							fontFamily: 'Rubik',
							fontDefinitions: [
								{
									path: 'node_modules/@expo-google-fonts/rubik/400Regular/Rubik_400Regular.ttf',
									weight: 400,
								},
								{
									path: 'node_modules/@expo-google-fonts/rubik/500Medium/Rubik_500Medium.ttf',
									weight: 500,
								},
								{
									path: 'node_modules/@expo-google-fonts/rubik/600SemiBold/Rubik_600SemiBold.ttf',
									weight: 600,
								},
								{
									path: 'node_modules/@expo-google-fonts/rubik/700Bold/Rubik_700Bold.ttf',
									weight: 700,
								},
								{
									path: 'node_modules/@expo-google-fonts/rubik/900Black/Rubik_900Black.ttf',
									weight: 900,
								},
							],
						},
					],
				},
			},
		],
		'expo-web-browser',
		[
			'expo-router',
			{
				headers: {
					'Cross-Origin-Embedder-Policy': 'credentialless',
					'Cross-Origin-Opener-Policy': 'same-origin',
				},
			},
		],
		'expo-sqlite',
		[
			'expo-splash-screen',
			{
				imageWidth: 200,
				resizeMode: 'contain',
				image: './assets/icons/splash-icon-dark.png',
				// backgroundColor: '#fcfcfd',
				backgroundColor: '#27253C', // dark default
				dark: {
					image: './assets/icons/splash-icon-light.png',
					backgroundColor: '#27253C',
				}
			},
		],
		['expo-secure-store'],
	],
	experiments: {
		typedRoutes: true,
	},
}

// ts-prune-ignore-next
export default config
