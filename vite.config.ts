import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    includeAssets: ['favicon.svg', 'icons/*.png'],
    manifest: {
      name: 'ARPE Gestión SaaS', short_name: 'ARPE', lang: 'es',
      description: 'Tu negocio, en armonía.', theme_color: '#304d43', background_color: '#f8f7f3',
      display: 'standalone', start_url: '/', scope: '/',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      // Only the app shell is cached. Auth, database and private logos stay online.
      navigateFallbackDenylist: [/^\/auth\//],
      cleanupOutdatedCaches: true,
    },
  })],
  test: { environment: 'jsdom', pool: 'threads', maxWorkers: 1, testTimeout: 30000, setupFiles: ['./src/test/setup.ts'], include: ['src/**/*.test.{ts,tsx}'] },
})
