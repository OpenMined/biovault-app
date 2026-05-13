const { getDefaultConfig } = require('expo/metro-config')

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname)

// Add bundled non-code assay/package assets
config.resolver.assetExts.push('sqlite', 'db', 'py', 'txt')

// Add wasm asset support
config.resolver.assetExts.push('wasm')

// Local dev experiment: relax cross-origin isolation so Chrome can load
// third-party iframe embeds such as YouTube. Production headers are controlled
// separately by workers/biovault-app.ts.
config.server.enhanceMiddleware = (middleware) => {
	return (req, res, next) => {
		res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none')
		res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none')
		res.setHeader('Permissions-Policy', 'cross-origin-isolated=()')
		middleware(req, res, next)
	}
}

module.exports = config
