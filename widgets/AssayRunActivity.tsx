import { Text, VStack } from '@expo/ui/swift-ui'
import { font, padding } from '@expo/ui/swift-ui/modifiers'
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets'

export type AssayRunActivityProps = {
	assayTitle: string
	elapsedSeconds: number
	phaseLabel: string
	progressLabel: string
	statusLabel: string
}

const AssayRunActivity = (props: AssayRunActivityProps, _environment: LiveActivityEnvironment) => {
	'widget'

	const compactTime = `${props.elapsedSeconds}s`
	const detailLine = `${props.phaseLabel} ${props.progressLabel} ${compactTime}`

	return {
		banner: (
			<VStack modifiers={[padding({ all: 12 })]} spacing={4}>
				<Text modifiers={[font({ size: 12, weight: 'medium' })]}>{props.assayTitle}</Text>
				<Text modifiers={[font({ size: 18, weight: 'bold' })]}>{props.statusLabel}</Text>
				<Text modifiers={[font({ size: 12 })]}>{detailLine}</Text>
			</VStack>
		),
		compactLeading: <Text modifiers={[font({ size: 12, weight: 'bold' })]}>Run</Text>,
		compactTrailing: <Text modifiers={[font({ size: 12 })]}>{compactTime}</Text>,
		minimal: <Text modifiers={[font({ size: 11, weight: 'bold' })]}>{compactTime}</Text>,
		expandedLeading: <Text modifiers={[font({ size: 12, weight: 'medium' })]}>{props.assayTitle}</Text>,
		expandedCenter: <Text modifiers={[font({ size: 15, weight: 'bold' })]}>{props.statusLabel}</Text>,
		expandedTrailing: <Text modifiers={[font({ size: 12 })]}>{compactTime}</Text>,
		expandedBottom: <Text modifiers={[font({ size: 12 })]}>{detailLine}</Text>,
	}
}

export default createLiveActivity('AssayRunActivity', AssayRunActivity)
