import { Text, TextInput } from 'react-native'

const DEFAULT_INTER_STYLE = { fontFamily: 'Inter' } as const
export const BrandFonts = {
	body: 'Inter',
	heading: 'Rubik',
} as const

let hasAppliedGlobalTypography = false

export function applyGlobalBrandTypography(): void {
	if (hasAppliedGlobalTypography) {
		return
	}

	hasAppliedGlobalTypography = true

	const TextComponent = Text as typeof Text & {
		defaultProps?: { style?: unknown }
	}
	const TextInputComponent = TextInput as typeof TextInput & {
		defaultProps?: { style?: unknown }
	}

	TextComponent.defaultProps = TextComponent.defaultProps ?? {}
	TextComponent.defaultProps.style = [DEFAULT_INTER_STYLE, TextComponent.defaultProps.style]

	TextInputComponent.defaultProps = TextInputComponent.defaultProps ?? {}
	TextInputComponent.defaultProps.style = [
		DEFAULT_INTER_STYLE,
		TextInputComponent.defaultProps.style,
	]
}
