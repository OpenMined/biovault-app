import { omRadius, omSpacing, omTheme, omTypography } from '@/styles/brand'
import type { ComponentProps } from 'react'
import { Platform, StyleProp, StyleSheet, TouchableOpacity, TouchableOpacityProps, ViewStyle } from 'react-native'
import { OMIcon } from './OMIcon'
import { OMText } from './OMText'

interface OMButtonProps extends TouchableOpacityProps {
	label: string
	variant?: 'primary' | 'secondary' | 'danger'
	iconName?: ComponentProps<typeof OMIcon>['name']
	style?: StyleProp<ViewStyle>
}

export function OMButton({
	label,
	variant = 'primary',
	iconName,
	style,
	disabled,
	...props
}: OMButtonProps) {
	const iconTone = variant === 'primary' ? 'inverse' : variant === 'danger' ? 'danger' : 'default'

	return (
		<TouchableOpacity
			activeOpacity={0.78}
			disabled={disabled}
			style={[
				styles.base,
				Platform.OS === 'web' ? styles.webMotion : null,
				Platform.OS === 'web' ? disabled ? styles.webDisabledCursor : styles.webCursor : null,
				variantStyles[variant],
				disabled && styles.disabled,
				style,
			]}
			{...props}
		>
			{iconName ? (
				<OMIcon
					name={iconName}
					size={16}
					tone={iconTone}
					color={variant === 'primary' ? omTheme.actionText : undefined}
					style={styles.icon}
				/>
			) : null}
			<OMText
				variant="subtitle"
				style={[
					styles.label,
					variant === 'primary' ? styles.primaryLabel : styles.secondaryLabel,
				]}
			>
				{label}
			</OMText>
		</TouchableOpacity>
	)
}

const styles = StyleSheet.create({
	base: {
		minHeight: 48,
		paddingHorizontal: omSpacing.xl,
		paddingVertical: omSpacing.l,
		borderRadius: omRadius.m,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
	},
	label: {
		...omTypography.subtitle,
	},
	icon: {
		marginRight: omSpacing.s,
	},
	primaryLabel: {
		color: omTheme.actionText,
	},
	secondaryLabel: {
		color: omTheme.textHeadline,
	},
	disabled: {
		opacity: 0.5,
	},
	webMotion: {
		transitionProperty: 'opacity, transform, background-color, border-color',
		transitionDuration: '140ms',
		transitionTimingFunction: 'ease',
	} as object,
	webCursor: {
		cursor: 'pointer',
	} as object,
	webDisabledCursor: {
		cursor: 'not-allowed',
	} as object,
})

const variantStyles = StyleSheet.create({
	primary: {
		backgroundColor: omTheme.primary,
	},
	secondary: {
		backgroundColor: omTheme.surface,
		borderWidth: 1,
		borderColor: omTheme.border,
	},
	danger: {
		backgroundColor: omTheme.dangerSurface,
		borderWidth: 1,
		borderColor: omTheme.dangerBorder,
	},
})
