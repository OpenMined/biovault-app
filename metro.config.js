const fs = require('node:fs')
const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname)

// Add bundled non-code assay/package assets
config.resolver.assetExts.push('sqlite', 'db', 'py', 'txt')

// Add wasm asset support
config.resolver.assetExts.push('wasm')

// Files under modules/expo-bioscript/web-runtime/ are loaded directly by the
// browser — they back Web Workers that can't go through Metro's JS bundler
// (the wasm-bindgen glue must be an honest-to-god ES module). Serve them as
// raw static files with proper MIME types.
const WEB_RUNTIME_PREFIX = '/modules/expo-bioscript/web-runtime/'
const WEB_RUNTIME_ROOT = path.join(__dirname, 'modules', 'expo-bioscript', 'web-runtime')

function webRuntimeMimeFor(filePath) {
	if (filePath.endsWith('.mjs') || filePath.endsWith('.js')) return 'application/javascript; charset=utf-8'
	if (filePath.endsWith('.wasm')) return 'application/wasm'
	if (filePath.endsWith('.json')) return 'application/json; charset=utf-8'
	return 'application/octet-stream'
}

function serveWebRuntime(req, res) {
	const url = req.url || ''
	if (!url.startsWith(WEB_RUNTIME_PREFIX)) return false
	const query = url.indexOf('?')
	const pathname = query >= 0 ? url.slice(0, query) : url
	const rel = pathname.slice(WEB_RUNTIME_PREFIX.length)
	// Prevent path traversal — anything with .. is rejected.
	if (rel.includes('..')) {
		res.statusCode = 400
		res.end('bad request')
		return true
	}
	const abs = path.join(WEB_RUNTIME_ROOT, rel)
	fs.stat(abs, (err, stat) => {
		if (err || !stat.isFile()) {
			res.statusCode = 404
			res.end('not found')
			return
		}
		res.setHeader('Content-Type', webRuntimeMimeFor(abs))
		res.setHeader('Content-Length', String(stat.size))
		fs.createReadStream(abs).pipe(res)
	})
	return true
}

// Add COEP and COOP headers to support SharedArrayBuffer
config.server.enhanceMiddleware = (middleware) => {
	return (req, res, next) => {
		res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless')
		res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
		if (serveWebRuntime(req, res)) return
		middleware(req, res, next)
	}
}

module.exports = config
