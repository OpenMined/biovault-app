import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [
    {
      name: 'biovault-app-desktop-asset-require',
      enforce: 'pre',
      transform(code, id) {
        if (!/\.[cm]?[jt]sx?$/.test(id) || !code.includes('require(')) return null
        const nextCode = code.replace(
          /require\((['"])([^'"]+\.(?:svg|png|jpe?g|ttf|py|txt))\1\)/g,
          "new URL('$2', import.meta.url).href",
        )
        return nextCode === code ? null : { code: nextCode, map: null }
      },
    },
    react(),
    {
      name: 'biovault-app-desktop-native-copy',
      generateBundle(_, bundle) {
        for (const chunk of Object.values(bundle)) {
          if (chunk.type !== 'chunk') continue
          chunk.code = chunk.code
            .replaceAll('Web' + 'Assembly', 'NativeRust')
            .replaceAll('WA' + 'SM runtime', 'Native Rust runtime')
        }
      },
    },
  ],
  clearScreen: false,
  define: {
    'process.env.EXPO_PUBLIC_BIOVAULT_DESKTOP': JSON.stringify('1'),
  },
  resolve: {
    alias: [
      { find: 'expo-router', replacement: path.resolve(__dirname, 'src/shims/expo-router.tsx') },
      { find: '@react-navigation/native', replacement: path.resolve(__dirname, 'src/shims/react-navigation-native.ts') },
      { find: 'react-native', replacement: 'react-native-web' },
      {
        find: 'react-native-safe-area-context',
        replacement: path.resolve(__dirname, 'src/shims/react-native-safe-area-context.tsx'),
      },
      { find: 'expo-sqlite', replacement: path.resolve(__dirname, 'src/shims/expo-sqlite.ts') },
      { find: 'expo-asset', replacement: path.resolve(__dirname, 'src/shims/expo-asset.ts') },
      { find: 'expo-constants', replacement: path.resolve(__dirname, 'src/shims/expo-constants.ts') },
      { find: 'expo-device', replacement: path.resolve(__dirname, 'src/shims/expo-device.ts') },
      { find: 'expo-notifications', replacement: path.resolve(__dirname, 'src/shims/expo-notifications.ts') },
      { find: 'expo-file-system/legacy', replacement: path.resolve(__dirname, 'src/shims/expo-file-system.ts') },
      { find: 'expo-file-system', replacement: path.resolve(__dirname, 'src/shims/expo-file-system.ts') },
      { find: 'react-native-svg', replacement: path.resolve(__dirname, 'src/shims/react-native-svg.tsx') },
      {
        find: '@/lib/lab/adapters/file-adapter.web',
        replacement: path.resolve(__dirname, 'src/lab/web-file-adapter.ts'),
      },
      {
        find: '@/lib/lab/adapters/file-picker',
        replacement: path.resolve(__dirname, 'src/lab/web-file-picker.ts'),
      },
      {
        find: '@/lib/lab/runtime-root',
        replacement: path.resolve(__dirname, 'src/lab/runtime-root.ts'),
      },
      {
        find: '@/lib/lab/generated-index-cache',
        replacement: path.resolve(__dirname, 'src/shims/generated-index-cache.ts'),
      },
      {
        find: '@/lib/lab/assay-registry',
        replacement: path.resolve(__dirname, 'src/shims/lab-assay-registry.ts'),
      },
      {
        find: '@/lib/remote-lab-file',
        replacement: path.resolve(__dirname, 'src/lab/remote-lab-file.ts'),
      },
      {
        find: '@/lib/app-db',
        replacement: path.resolve(__dirname, 'src/shims/app-db.ts'),
      },
      {
        find: '@/lib/assay-package-url-registry',
        replacement: path.resolve(__dirname, 'src/shims/assay-package-url-registry.ts'),
      },
      {
        find: '@/lib/remote-resource-cache',
        replacement: path.resolve(__dirname, 'src/shims/remote-resource-cache.ts'),
      },
      {
        find: '@/lib/clear-app-storage',
        replacement: path.resolve(__dirname, 'src/shims/clear-app-storage.ts'),
      },
      {
        find: '@react-native-async-storage/async-storage',
        replacement: path.resolve(__dirname, 'src/shims/async-storage.ts'),
      },
      {
        find: '@/modules/expo-bioscript',
        replacement: path.resolve(__dirname, 'src/lab/desktop-expo-bioscript.ts'),
      },
      { find: '@/lib/browser-support', replacement: path.resolve(__dirname, 'src/shims/browser-support.ts') },
      { find: '@', replacement: path.resolve(__dirname, '..') },
      { find: '@biovault/protocol', replacement: path.resolve(__dirname, '../packages/protocol/src') },
      { find: '@biovault/ui-core', replacement: path.resolve(__dirname, '../packages/ui-core/src') },
    ],
  },
  server: {
    port: 1420,
    strictPort: true,
    fs: { allow: ['..'] },
  },
})
