/**
 * Profile - User settings, SyftBox authentication, and research participation (Web only)
 * Enhanced version of the mobile profile with web-specific features
 */

import { useSyftBox, useSyftBoxAuth } from '@/lib/syftbox-auth'
import React, { useState } from 'react'
import {
	Alert,
	Platform,
	ScrollView,
	StyleSheet,
	Switch,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

interface ProfileState {
	// SyftBox auth state
	otpEmail: string
	otpCode: string
	showOtpInput: boolean
	otpLoading: boolean
	// Settings
	autoAcceptPipelines: boolean
	shareAnonymousStats: boolean
	allowDataVisitation: boolean
	notificationsEnabled: boolean
}

export default function Profile() {
	const { isAuthenticated, email: syftboxEmail } = useSyftBoxAuth()
	const { requestOTP, verifyOTP, signOut } = useSyftBox()

	const [state, setState] = useState<ProfileState>({
		otpEmail: '',
		otpCode: '',
		showOtpInput: false,
		otpLoading: false,
		autoAcceptPipelines: false,
		shareAnonymousStats: true,
		allowDataVisitation: true,
		notificationsEnabled: true,
	})

	const handleRequestOTP = async () => {
		if (!state.otpEmail.trim()) {
			Alert.alert('Error', 'Please enter your email address')
			return
		}

		setState((prev) => ({ ...prev, otpLoading: true }))
		try {
			await requestOTP(state.otpEmail)
			setState((prev) => ({ ...prev, showOtpInput: true, otpLoading: false }))
			Alert.alert('Success', 'Verification code sent to your email')
		} catch (error) {
			setState((prev) => ({ ...prev, otpLoading: false }))
			Alert.alert('Error', `Failed to send verification code: ${error}`)
		}
	}

	const handleVerifyOTP = async () => {
		if (!state.otpCode.trim()) {
			Alert.alert('Error', 'Please enter the verification code')
			return
		}

		setState((prev) => ({ ...prev, otpLoading: true }))
		try {
			await verifyOTP(state.otpEmail, state.otpCode)
			setState((prev) => ({
				...prev,
				otpLoading: false,
				showOtpInput: false,
				otpEmail: '',
				otpCode: '',
			}))
			Alert.alert('Success', 'Successfully signed in to SyftBox!')
		} catch (error) {
			setState((prev) => ({ ...prev, otpLoading: false }))
			Alert.alert('Error', `Failed to verify code: ${error}`)
		}
	}

	const handleSignOut = async () => {
		Alert.alert(
			'Sign Out',
			'Are you sure you want to sign out of SyftBox? This will disable research participation.',
			[
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Sign Out',
					style: 'destructive',
					onPress: async () => {
						try {
							await signOut()
							Alert.alert('Success', 'Signed out of SyftBox')
						} catch (error) {
							Alert.alert('Error', `Failed to sign out: ${error}`)
						}
					},
				},
			]
		)
	}

	const toggleSetting = (setting: keyof ProfileState) => {
		setState((prev) => ({
			...prev,
			[setting]: !prev[setting],
		}))
	}

	const showNotImplemented = () => {
		Alert.alert('Coming Soon', 'This feature is not implemented yet.')
	}

	const renderAuthSection = () => {
		if (!isAuthenticated) {
			return (
				<View style={styles.authCard}>
					<Text style={styles.authTitle}>🔗 Connect to BioVault Network</Text>
					<Text style={styles.authSubtitle}>
						Sign in with SyftBox to participate in collaborative genomics research
					</Text>

					<View style={styles.authForm}>
						<TextInput
							style={styles.authInput}
							placeholder="Enter your email address"
							value={state.otpEmail}
							onChangeText={(text) => setState((prev) => ({ ...prev, otpEmail: text }))}
							keyboardType="email-address"
							autoCapitalize="none"
							autoCorrect={false}
							editable={!state.otpLoading}
						/>

						{state.showOtpInput && (
							<TextInput
								style={styles.authInput}
								placeholder="Enter verification code"
								value={state.otpCode}
								onChangeText={(text) => setState((prev) => ({ ...prev, otpCode: text }))}
								keyboardType="number-pad"
								autoCorrect={false}
								editable={!state.otpLoading}
							/>
						)}

						<TouchableOpacity
							style={styles.authButton}
							onPress={state.showOtpInput ? handleVerifyOTP : handleRequestOTP}
							disabled={state.otpLoading}
						>
							<Text style={styles.authButtonText}>
								{state.showOtpInput ? 'Verify Code' : 'Connect to Network'}
							</Text>
						</TouchableOpacity>
					</View>
				</View>
			)
		}

		return (
			<View style={styles.connectedCard}>
				<Text style={styles.connectedTitle}>✅ Connected to BioVault Network</Text>
				<Text style={styles.connectedEmail}>{syftboxEmail}</Text>
				<TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
					<Text style={styles.signOutButtonText}>Sign Out</Text>
				</TouchableOpacity>
			</View>
		)
	}

	return (
		<SafeAreaView style={styles.container}>
			<ScrollView style={styles.scrollView}>
				<View style={styles.header}>
					<Text style={styles.title}>Profile & Settings</Text>
					<Text style={styles.subtitle}>
						Manage your BioVault account and research participation preferences
					</Text>
				</View>

				{renderAuthSection()}

				{isAuthenticated && (
					<>
						<View style={styles.settingsCard}>
							<Text style={styles.settingsTitle}>🔬 Research Participation</Text>

							<View style={styles.settingItem}>
								<View style={styles.settingTextContainer}>
									<Text style={styles.settingTitle}>Auto-Accept Simple Pipelines</Text>
									<Text style={styles.settingDescription}>
										Automatically accept low-risk analysis pipelines
									</Text>
								</View>
								<Switch
									value={state.autoAcceptPipelines}
									onValueChange={() => toggleSetting('autoAcceptPipelines')}
									trackColor={{ false: '#e0e0e0', true: '#4CAF50' }}
									thumbColor={state.autoAcceptPipelines ? '#ffffff' : '#f4f3f4'}
								/>
							</View>

							<View style={styles.settingItem}>
								<View style={styles.settingTextContainer}>
									<Text style={styles.settingTitle}>Allow Data Visitation</Text>
									<Text style={styles.settingDescription}>
										Enable secure data visitation for approved researchers
									</Text>
								</View>
								<Switch
									value={state.allowDataVisitation}
									onValueChange={() => toggleSetting('allowDataVisitation')}
									trackColor={{ false: '#e0e0e0', true: '#4CAF50' }}
									thumbColor={state.allowDataVisitation ? '#ffffff' : '#f4f3f4'}
								/>
							</View>

							<View style={styles.settingItem}>
								<View style={styles.settingTextContainer}>
									<Text style={styles.settingTitle}>Share Anonymous Statistics</Text>
									<Text style={styles.settingDescription}>
										Help improve BioVault by sharing anonymous usage data
									</Text>
								</View>
								<Switch
									value={state.shareAnonymousStats}
									onValueChange={() => toggleSetting('shareAnonymousStats')}
									trackColor={{ false: '#e0e0e0', true: '#4CAF50' }}
									thumbColor={state.shareAnonymousStats ? '#ffffff' : '#f4f3f4'}
								/>
							</View>
						</View>

						<View style={styles.menuCard}>
							<Text style={styles.menuTitle}>🔒 Privacy & Data</Text>

							<TouchableOpacity style={styles.menuItem} onPress={showNotImplemented}>
								<Text style={styles.menuItemText}>→ Data Usage Dashboard</Text>
								<Text style={styles.menuItemSubtext}>See how your data is being used</Text>
							</TouchableOpacity>

							<TouchableOpacity style={styles.menuItem} onPress={showNotImplemented}>
								<Text style={styles.menuItemText}>→ Research Permissions</Text>
								<Text style={styles.menuItemSubtext}>Manage study participation settings</Text>
							</TouchableOpacity>

							<TouchableOpacity style={styles.menuItem} onPress={showNotImplemented}>
								<Text style={styles.menuItemText}>→ Export Data</Text>
								<Text style={styles.menuItemSubtext}>Download your genetic data and results</Text>
							</TouchableOpacity>
						</View>

						<View style={styles.menuCard}>
							<Text style={styles.menuTitle}>⚙️ Application Settings</Text>

							<View style={styles.settingItem}>
								<View style={styles.settingTextContainer}>
									<Text style={styles.settingTitle}>Desktop Notifications</Text>
									<Text style={styles.settingDescription}>
										Get notified about new research submissions
									</Text>
								</View>
								<Switch
									value={state.notificationsEnabled}
									onValueChange={() => toggleSetting('notificationsEnabled')}
									trackColor={{ false: '#e0e0e0', true: '#4CAF50' }}
									thumbColor={state.notificationsEnabled ? '#ffffff' : '#f4f3f4'}
								/>
							</View>

							<TouchableOpacity style={styles.menuItem} onPress={showNotImplemented}>
								<Text style={styles.menuItemText}>→ Storage Management</Text>
								<Text style={styles.menuItemSubtext}>Manage local data storage and cache</Text>
							</TouchableOpacity>

							<TouchableOpacity style={styles.menuItem} onPress={showNotImplemented}>
								<Text style={styles.menuItemText}>→ Backup & Sync</Text>
								<Text style={styles.menuItemSubtext}>Backup settings and sync across devices</Text>
							</TouchableOpacity>
						</View>
					</>
				)}

				<View style={styles.infoCard}>
					<Text style={styles.infoTitle}>💡 About BioVault Desktop</Text>
					<Text style={styles.infoText}>
						• Cross-platform application that runs as a local web app
					</Text>
					<Text style={styles.infoText}>• Utilizes SyftBox network for secure collaboration</Text>
					<Text style={styles.infoText}>
						• Access larger reference databases for detailed insights
					</Text>
					<Text style={styles.infoText}>
						• Enable researchers to run private NextFlow workflows
					</Text>
					<Text style={styles.infoText}>• Full privacy with secure enclave technology</Text>
				</View>
			</ScrollView>
		</SafeAreaView>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#f5f5f5',
		paddingTop: Platform.OS === 'web' ? 60 : 0, // Add padding for web tab bar
	},
	scrollView: {
		flex: 1,
	},
	header: {
		padding: 20,
		paddingBottom: 16,
	},
	title: {
		fontSize: 28,
		fontWeight: '700',
		color: '#333',
		marginBottom: 4,
	},
	subtitle: {
		fontSize: 16,
		color: '#666',
		lineHeight: 22,
	},
	authCard: {
		backgroundColor: 'white',
		marginHorizontal: 20,
		marginBottom: 20,
		padding: 24,
		borderRadius: 16,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	authTitle: {
		fontSize: 20,
		fontWeight: '700',
		color: '#333',
		marginBottom: 8,
		textAlign: 'center',
	},
	authSubtitle: {
		fontSize: 14,
		color: '#666',
		textAlign: 'center',
		marginBottom: 20,
		lineHeight: 20,
	},
	authForm: {
		gap: 12,
	},
	authInput: {
		height: 50,
		borderWidth: 1,
		borderColor: '#e0e0e0',
		borderRadius: 12,
		paddingHorizontal: 16,
		fontSize: 16,
		backgroundColor: '#f8f9fa',
	},
	authButton: {
		backgroundColor: '#4CAF50',
		height: 50,
		borderRadius: 12,
		justifyContent: 'center',
		alignItems: 'center',
	},
	authButtonText: {
		color: 'white',
		fontSize: 16,
		fontWeight: '600',
	},
	connectedCard: {
		backgroundColor: '#e8f5e8',
		marginHorizontal: 20,
		marginBottom: 20,
		padding: 20,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: '#4CAF50',
	},
	connectedTitle: {
		fontSize: 18,
		fontWeight: '700',
		color: '#2e7d32',
		marginBottom: 8,
	},
	connectedEmail: {
		fontSize: 16,
		color: '#2e7d32',
		marginBottom: 16,
	},
	signOutButton: {
		backgroundColor: '#f44336',
		paddingHorizontal: 16,
		paddingVertical: 8,
		borderRadius: 8,
		alignSelf: 'flex-start',
	},
	signOutButtonText: {
		color: 'white',
		fontSize: 14,
		fontWeight: '600',
	},
	settingsCard: {
		backgroundColor: 'white',
		marginHorizontal: 20,
		marginBottom: 20,
		padding: 20,
		borderRadius: 16,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	settingsTitle: {
		fontSize: 18,
		fontWeight: '700',
		color: '#333',
		marginBottom: 16,
	},
	settingItem: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingVertical: 12,
		borderBottomWidth: 1,
		borderBottomColor: '#f0f0f0',
	},
	settingTextContainer: {
		flex: 1,
		marginRight: 16,
	},
	settingTitle: {
		fontSize: 16,
		fontWeight: '600',
		color: '#333',
		marginBottom: 4,
	},
	settingDescription: {
		fontSize: 14,
		color: '#666',
		lineHeight: 18,
	},
	menuCard: {
		backgroundColor: 'white',
		marginHorizontal: 20,
		marginBottom: 20,
		borderRadius: 16,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	menuTitle: {
		fontSize: 18,
		fontWeight: '700',
		color: '#333',
		padding: 20,
		paddingBottom: 12,
	},
	menuItem: {
		padding: 20,
		borderBottomWidth: 1,
		borderBottomColor: '#f0f0f0',
	},
	menuItemText: {
		fontSize: 16,
		fontWeight: '500',
		color: '#333',
		marginBottom: 4,
	},
	menuItemSubtext: {
		fontSize: 14,
		color: '#666',
	},
	infoCard: {
		backgroundColor: '#e8f5e8',
		marginHorizontal: 20,
		marginBottom: 20,
		padding: 20,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: '#4CAF50',
	},
	infoTitle: {
		fontSize: 16,
		fontWeight: '700',
		color: '#2e7d32',
		marginBottom: 12,
	},
	infoText: {
		fontSize: 14,
		color: '#2e7d32',
		marginBottom: 6,
		lineHeight: 18,
	},
})
