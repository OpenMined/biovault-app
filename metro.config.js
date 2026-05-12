const { getDefaultConfig } = require('expo/metro-config')

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname)

// Add bundled non-code assay/package assets
config.resolver.assetExts.push('sqlite', 'db', 'py', 'txt')

// Add wasm asset support
config.resolver.assetExts.push('wasm')

// COOP + COEP for SharedArrayBuffer (Monty/wasm). Use credentialless — not
// require-corp — so third-party iframes (e.g. YouTube) are not blocked.
config.server.enhanceMiddleware = (middleware) => {
	return (req, res, next) => {
		res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless')
		res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
		res.setHeader('Permissions-Policy', 'cross-origin-isolated=(self)')
		middleware(req, res, next)
	}
}

module.exports = config
