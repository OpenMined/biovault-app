import Ionicons from '@expo/vector-icons/Ionicons'
import { omTheme } from '@/styles/brand'
import type { ComponentProps } from 'react'
import { StyleProp, TextStyle, View, ViewStyle, StyleSheet } from 'react-native'

type OMIconTone = 'default' | 'muted' | 'accent' | 'danger' | 'inverse'
type OMIconContainerTone = 'none' | 'soft' | 'dark'

interface OMIconProps {
	name: ComponentProps<typeof Ionicons>['name']
	size?: number
	tone?: OMIconTone
	color?: string
	containerTone?: OMIconContainerTone
	style?: StyleProp<TextStyle>
	containerStyle?: StyleProp<ViewStyle>
}

const iconColors: Record<OMIconTone, string> = {
	default: omTheme.textHeadline,
	muted: omTheme.textMuted,
	accent: omTheme.link,
	danger: omTheme.dangerText,
	inverse: omTheme.primaryText,
}

const containerStyles = StyleSheet.create({
	none: {},
	soft: {
		width: 36,
		height: 36,
		borderRadius: 999,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: omTheme.surfaceDim,
	},
	dark: {
		width: 36,
		height: 36,
		borderRadius: 999,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: omTheme.primary,
	},
})

export function OMIcon({
	name,
	size = 20,
	tone = 'default',
	color,
	containerTone = 'none',
	style,
	containerStyle,
}: OMIconProps) {
	return (
		<View style={[containerStyles[containerTone], containerStyle]}>
			<Ionicons name={name} size={size} color={color ?? iconColors[tone]} style={style} />
		</View>
	)
}
