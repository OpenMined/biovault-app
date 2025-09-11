import { ExpoConfig } from 'expo/config'

const config: ExpoConfig = {
	name: 'BioVault',
	owner: 'openmined',
	slug: 'biovault',
	version: '1.0.0',
	orientation: 'portrait',
	icon: './assets/images/biovault-icon.png',
	scheme: 'biovaultapp',
	userInterfaceStyle: 'light',
	newArchEnabled: true,
	ios: {
		bundleIdentifier: 'org.openmined.biovault',
		supportsTablet: true,
		infoPlist: {
			ITSAppUsesNonExemptEncryption: false,
		},
	},
	android: {
		adaptiveIcon: {
			foregroundImage: './assets/images/adaptive-icon.png',
			backgroundColor: '#ffffff',
		},
		edgeToEdgeEnabled: true,
	},
	web: {
		bundler: 'metro',
		output: 'static',
		favicon: './assets/images/favicon.png',
	},
	extra: {
		eas: {
			projectId: '6e5fc48a-f9db-4c16-8810-21acf9d978b0',
		},
	},
	plugins: [
		'expo-font',
		'expo-sqlite',
		'expo-web-browser',
		'expo-router',
		[
			'expo-splash-screen',
			{
				image: './assets/images/splash-icon.png',
				imageWidth: 200,
				resizeMode: 'contain',
				backgroundColor: '#ffffff',
			},
		],
		['react-native-bottom-tabs'],
		[
			'expo-asset',
			{
				assets: ['./assets/clinvar_23andme.sqlite'],
			},
		],
		[
			'expo-build-properties',
			{
				ios: {
					useFrameworks: 'static',
				},
			},
		],
	],
	experiments: {
		typedRoutes: true,
	},
}

export default config
