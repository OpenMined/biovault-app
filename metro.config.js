const { getDefaultConfig } = require('expo/metro-config')

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname)

// Add .sqlite to the list of asset extensions
config.resolver.assetExts.push('sqlite', 'db')

// Add wasm asset support
config.resolver.assetExts.push('wasm')

// Add COEP and COOP headers to support SharedArrayBuffer
config.server.enhanceMiddleware = (middleware) => {
	return (req, res, next) => {
		res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless')
		res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
		middleware(req, res, next)
	}
}

module.exports = config
