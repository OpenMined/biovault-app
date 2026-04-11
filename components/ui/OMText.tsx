import { omTheme, omTypography } from '@/styles/brand'
import { StyleProp, StyleSheet, Text, TextProps, TextStyle } from 'react-native'

type OMTextVariant =
	| 'h1'
	| 'h3'
	| 'h4'
	| 'headline'
	| 'body'
	| 'subtitle'
	| 'caption'

interface OMTextProps extends TextProps {
	variant?: OMTextVariant
	tone?: 'default' | 'muted' | 'light' | 'accent'
	style?: StyleProp<TextStyle>
}

const variantStyles: Record<OMTextVariant, TextStyle> = {
	h1: omTypography.h1,
	h3: omTypography.h3,
	h4: omTypography.h4,
	headline: omTypography.headline,
	body: omTypography.body,
	subtitle: omTypography.subtitle,
	caption: omTypography.caption,
}

const toneStyles = StyleSheet.create({
	default: { color: omTheme.textHeadline },
	muted: { color: omTheme.textMuted },
	light: { color: omTheme.textLight },
	accent: { color: omTheme.link },
})

export function OMText({
	variant = 'body',
	tone = 'default',
	style,
	children,
	...props
}: OMTextProps) {
	return (
		<Text style={[variantStyles[variant], toneStyles[tone], style]} {...props}>
			{children}
		</Text>
	)
}
