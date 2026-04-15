import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  resolve: {
    alias: {
      '@biovault/protocol': path.resolve(__dirname, '../packages/protocol/src'),
      '@biovault/ui-core': path.resolve(__dirname, '../packages/ui-core/src'),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    fs: { allow: ['..'] },
  },
})
