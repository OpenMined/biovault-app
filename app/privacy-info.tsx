import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useAnalytics } from '@/hooks/useAnalytics'
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated'

// ts-prune-ignore-next
export default function PrivacyInfoScreen() {
	useAnalytics({
		trackScreenView: true,
		screenProperties: { screen: 'PrivacyInfo' },
	})

	return (
		<View style={styles.container}>
			<SafeAreaView style={styles.safeArea}>
				<ScrollView
					style={styles.scrollView}
					contentContainerStyle={styles.scrollContent}
					showsVerticalScrollIndicator={false}
				>
					{/* Header with Back Button */}
					<Animated.View entering={FadeInDown.duration(300)} style={styles.headerContainer}>
						<TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
							<Text style={styles.backButtonText}>‹</Text>
						</TouchableOpacity>
						<View style={styles.header}>
							<View style={styles.headerIcon}>
								<Text style={styles.headerIconText}>🔒</Text>
							</View>
							<Text style={styles.title}>Your Privacy Matters</Text>
							<Text style={styles.subtitle}>BioVault is designed with privacy at its core</Text>
						</View>
					</Animated.View>

					{/* Privacy Points */}
					<View style={styles.pointsContainer}>
						<Animated.View entering={FadeInUp.duration(250).delay(100)} style={styles.point}>
							<View style={styles.pointIconContainer}>
								<Text style={styles.pointIcon}>📱</Text>
							</View>
							<View style={styles.pointContent}>
								<Text style={styles.pointTitle}>Stored Locally</Text>
								<Text style={styles.pointText}>
									All your genetic data is processed and stored only on your device. No servers, no
									cloud storage.
								</Text>
							</View>
						</Animated.View>

						<Animated.View entering={FadeInUp.duration(250).delay(140)} style={styles.point}>
							<View style={styles.pointIconContainer}>
								<Text style={styles.pointIcon}>🚫</Text>
							</View>
							<View style={styles.pointContent}>
								<Text style={styles.pointTitle}>Never Uploaded</Text>
								<Text style={styles.pointText}>
									Your data never leaves your device without your explicit consent. You have
									complete control.
								</Text>
							</View>
						</Animated.View>

						<Animated.View entering={FadeInUp.duration(250).delay(180)} style={styles.point}>
							<View style={styles.pointIconContainer}>
								<Text style={styles.pointIcon}>⚡</Text>
							</View>
							<View style={styles.pointContent}>
								<Text style={styles.pointTitle}>Instant Analysis</Text>
								<Text style={styles.pointText}>
									All processing happens locally on your device for immediate results. No waiting,
									no external dependencies.
								</Text>
							</View>
						</Animated.View>

						<Animated.View entering={FadeInUp.duration(250).delay(220)} style={styles.point}>
							<View style={styles.pointIconContainer}>
								<Text style={styles.pointIcon}>🗑️</Text>
							</View>
							<View style={styles.pointContent}>
								<Text style={styles.pointTitle}>Full Control</Text>
								<Text style={styles.pointText}>
									Delete your data anytime from Settings. It&apos;s your genetic information, you
									decide what happens to it.
								</Text>
							</View>
						</Animated.View>

						<Animated.View entering={FadeInUp.duration(250).delay(260)} style={styles.point}>
							<View style={styles.pointIconContainer}>
								<Text style={styles.pointIcon}>🔓</Text>
							</View>
							<View style={styles.pointContent}>
								<Text style={styles.pointTitle}>Open Source</Text>
								<Text style={styles.pointText}>
									BioVault is open source and transparent. You can verify exactly what the app does
									with your data.
								</Text>
							</View>
						</Animated.View>
					</View>

					{/* Additional Info */}
					<Animated.View entering={FadeInUp.duration(300).delay(300)} style={styles.infoCard}>
						<Text style={styles.infoTitle}>How It Works</Text>
						<Text style={styles.infoText}>
							When you upload a genetic data file, BioVault processes it entirely on your device
							using Rust-powered native code. The data is stored in an encrypted SQLite database
							that only you can access. No internet connection is required for analysis.
						</Text>
					</Animated.View>
				</ScrollView>
			</SafeAreaView>
		</View>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#e0f2e7',
	},
	safeArea: {
		flex: 1,
	},
	headerContainer: {
		paddingHorizontal: 28,
		paddingTop: 20,
		paddingBottom: 32,
		position: 'relative',
	},
	backButton: {
		position: 'absolute',
		left: 28,
		top: 20,
		width: 44,
		height: 44,
		borderRadius: 22,
		backgroundColor: 'rgba(255, 255, 255, 0.95)',
		justifyContent: 'center',
		alignItems: 'center',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 8,
		elevation: 4,
		zIndex: 10,
	},
	backButtonText: {
		fontSize: 32,
		color: '#059669',
		fontWeight: '600',
		marginTop: -2,
		marginLeft: -2,
	},
	scrollView: {
		flex: 1,
	},
	scrollContent: {
		paddingBottom: 100,
	},
	header: {
		alignItems: 'center',
	},
	headerIcon: {
		width: 80,
		height: 80,
		borderRadius: 40,
		backgroundColor: '#d1fae5',
		justifyContent: 'center',
		alignItems: 'center',
		marginBottom: 20,
		shadowColor: '#059669',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.15,
		shadowRadius: 12,
		elevation: 4,
	},
	headerIconText: {
		fontSize: 40,
	},
	title: {
		fontSize: 32,
		fontWeight: '900',
		color: '#059669',
		marginBottom: 8,
		letterSpacing: -0.8,
		textAlign: 'center',
	},
	subtitle: {
		fontSize: 16,
		color: '#475569',
		lineHeight: 24,
		fontWeight: '500',
		textAlign: 'center',
		opacity: 0.8,
		maxWidth: 320,
	},
	pointsContainer: {
		paddingHorizontal: 28,
		gap: 16,
		marginBottom: 24,
	},
	point: {
		flexDirection: 'row',
		backgroundColor: 'rgba(255,255,255,0.95)',
		padding: 20,
		borderRadius: 20,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.08,
		shadowRadius: 12,
		elevation: 6,
	},
	pointIconContainer: {
		width: 48,
		height: 48,
		borderRadius: 24,
		backgroundColor: '#d1fae5',
		justifyContent: 'center',
		alignItems: 'center',
		marginRight: 16,
	},
	pointIcon: {
		fontSize: 24,
	},
	pointContent: {
		flex: 1,
	},
	pointTitle: {
		fontSize: 17,
		fontWeight: '800',
		color: '#0f172a',
		marginBottom: 6,
		letterSpacing: -0.3,
	},
	pointText: {
		fontSize: 14,
		color: '#64748b',
		lineHeight: 20,
		fontWeight: '500',
	},
	infoCard: {
		backgroundColor: 'rgba(254, 252, 232, 0.9)',
		marginHorizontal: 28,
		padding: 24,
		borderRadius: 24,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.08,
		shadowRadius: 12,
		elevation: 6,
		marginBottom: 20,
	},
	infoTitle: {
		fontSize: 18,
		fontWeight: '800',
		color: '#78350f',
		marginBottom: 12,
		letterSpacing: -0.3,
	},
	infoText: {
		fontSize: 14,
		color: '#92400e',
		lineHeight: 22,
		fontWeight: '600',
	},
})
