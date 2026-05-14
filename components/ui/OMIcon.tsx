import { omTheme } from '@/styles/brand'
import { Asset } from 'expo-asset'
import { StyleProp, View, ViewStyle, StyleSheet } from 'react-native'
import { PlatformSvgUri } from './PlatformSvgUri'

type OMIconTone = 'default' | 'muted' | 'accent' | 'danger' | 'inverse'
type OMIconContainerTone = 'none' | 'soft' | 'dark'

const iconUris = {
	'add-circle-outline': Asset.fromModule(require('../../assets/icons/plus-circle.svg')).uri,
	'alert-circle-outline': Asset.fromModule(require('../../assets/icons/alert-circle.svg')).uri,
	'book-outline': Asset.fromModule(require('../../assets/icons/book-open.svg')).uri,
	checkmark: Asset.fromModule(require('../../assets/icons/check.svg')).uri,
	'checkmark-circle': Asset.fromModule(require('../../assets/icons/check-circle.svg')).uri,
	'close-circle': Asset.fromModule(require('../../assets/icons/close-circle.svg')).uri,
	'close-outline': Asset.fromModule(require('../../assets/icons/x.svg')).uri,
	'cloud-download-outline': Asset.fromModule(require('../../assets/icons/cloud-download.svg')).uri,
	'cloud-upload-outline': Asset.fromModule(require('../../assets/icons/cloud-upload.svg')).uri,
	'construct-outline': Asset.fromModule(require('../../assets/icons/wrench.svg')).uri,
	'document-attach-outline': Asset.fromModule(require('../../assets/icons/file-plus.svg')).uri,
	'document-text-outline': Asset.fromModule(require('../../assets/icons/file-text.svg')).uri,
	'ellipse-outline': Asset.fromModule(require('../../assets/icons/minus-circle.svg')).uri,
	'flask-outline': Asset.fromModule(require('../../assets/icons/flask-conical.svg')).uri,
	'folder-open-outline': Asset.fromModule(require('../../assets/icons/folder-open.svg')).uri,
	'folder-outline': Asset.fromModule(require('../../assets/icons/folder.svg')).uri,
	'layers-outline': Asset.fromModule(require('../../assets/icons/layers.svg')).uri,
	'link-outline': Asset.fromModule(require('../../assets/icons/link.svg')).uri,
	'lock-closed-outline': Asset.fromModule(require('../../assets/icons/lock.svg')).uri,
	'logo-github': Asset.fromModule(require('../../assets/icons/github.svg')).uri,
	'mail-outline': Asset.fromModule(require('../../assets/icons/mail.svg')).uri,
	'menu-outline': Asset.fromModule(require('../../assets/icons/menu.svg')).uri,
	'moon-outline': Asset.fromModule(require('../../assets/icons/moon.svg')).uri,
	pencil: Asset.fromModule(require('../../assets/icons/pencil.svg')).uri,
	'play-outline': Asset.fromModule(require('../../assets/icons/play.svg')).uri,
	'search-outline': Asset.fromModule(require('../../assets/icons/search.svg')).uri,
	'settings-outline': Asset.fromModule(require('../../assets/icons/settings.svg')).uri,
	'sunny-outline': Asset.fromModule(require('../../assets/icons/sun.svg')).uri,
	'trash-outline': Asset.fromModule(require('../../assets/icons/trash.svg')).uri,
} as const

export type OMIconName = keyof typeof iconUris

interface OMIconProps {
	name: OMIconName
	size?: number
	tone?: OMIconTone
	color?: string
	containerTone?: OMIconContainerTone
	style?: StyleProp<ViewStyle>
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
		<View style={[containerStyles[containerTone], style, containerStyle]}>
			<PlatformSvgUri uri={iconUris[name]} width={size} height={size} color={color ?? iconColors[tone]} />
		</View>
	)
}
