import { omRadius, omTheme } from '@/styles/brand'
import { StyleProp, StyleSheet, View, ViewProps, ViewStyle } from 'react-native'

interface OMCardProps extends ViewProps {
	tone?: 'default' | 'dim' | 'dark' | 'warning'
	style?: StyleProp<ViewStyle>
}

const toneStyles = StyleSheet.create({
	default: {
		backgroundColor: omTheme.surface,
		borderColor: omTheme.border,
	},
	dim: {
		backgroundColor: omTheme.surfaceDim,
		borderColor: omTheme.border,
	},
	dark: {
		backgroundColor: omTheme.primary,
		borderColor: omTheme.primary,
	},
	warning: {
		backgroundColor: omTheme.warningSurface,
		borderColor: omTheme.warningSurface,
	},
})

export function OMCard({ tone = 'default', style, children, ...props }: OMCardProps) {
	return (
		<View style={[styles.card, toneStyles[tone], style]} {...props}>
			{children}
		</View>
	)
}

const styles = StyleSheet.create({
	card: {
		borderWidth: 1,
		borderRadius: omRadius.l,
	},
})
