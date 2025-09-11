const { getDefaultConfig } = require('expo/metro-config')

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname)

// Add .sqlite to the list of asset extensions
config.resolver.assetExts.push('sqlite', 'db')

module.exports = config
