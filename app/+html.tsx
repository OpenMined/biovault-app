import { ScrollViewStyleReset } from 'expo-router/html'
import { type PropsWithChildren } from 'react'

const TITLE = 'BioVault — Your DNA never leaves your browser'
const DESCRIPTION =
	'Run private genomic analysis locally on your device. No upload, no account, fully open source.'
const ORIGIN = (process.env.EXPO_PUBLIC_SITE_ORIGIN ?? 'https://app.biovault.net').replace(/\/+$/, '')
const URL = `${ORIGIN}/`
const OG_IMAGE = `${ORIGIN}/images/og-share.jpg`
const OG_IMAGE_SQUARE = `${ORIGIN}/images/og-share-square.jpg`

// ts-prune-ignore-next
export default function Root({ children }: PropsWithChildren) {
	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<meta httpEquiv="X-UA-Compatible" content="IE=edge" />
				<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
				<title>{TITLE}</title>
				<meta name="description" content={DESCRIPTION} />
				<link rel="canonical" href={URL} />
				<link rel="icon" type="image/png" sizes="32x32" href={`${ORIGIN}/images/favicon-32x32.png`} />
				<link rel="icon" type="image/png" sizes="16x16" href={`${ORIGIN}/images/favicon-16x16.png`} />
				<link rel="apple-touch-icon" sizes="180x180" href={`${ORIGIN}/images/apple-touch-icon.png`} />
				<meta property="og:type" content="website" />
				<meta property="og:url" content={URL} />
				<meta property="og:title" content={TITLE} />
				<meta property="og:description" content={DESCRIPTION} />
				<meta property="og:image" content={OG_IMAGE_SQUARE} />
				<meta property="og:image:width" content="800" />
				<meta property="og:image:height" content="800" />
				<meta property="og:image" content={OG_IMAGE} />
				<meta property="og:image:width" content="1200" />
				<meta property="og:image:height" content="630" />
				<meta name="twitter:card" content="summary_large_image" />
				<meta name="twitter:title" content={TITLE} />
				<meta name="twitter:description" content={DESCRIPTION} />
				<meta name="twitter:image" content={OG_IMAGE} />
				<ScrollViewStyleReset />
			</head>
			<body>{children}</body>
		</html>
	)
}
