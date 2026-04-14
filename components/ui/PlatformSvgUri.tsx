import { Image, Platform } from 'react-native'
import { SvgUri } from 'react-native-svg'

type Props = {
	uri: string
	width: number
	height: number
	color?: string
}

export function PlatformSvgUri({ uri, width, height, color }: Props) {
	if (Platform.OS === 'web') {
		return <Image source={{ uri }} style={{ width, height, tintColor: color }} resizeMode="contain" />
	}
	return <SvgUri uri={uri} width={width} height={height} color={color} />
}
