import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const officialBrandAssets = [
  'brand/ejnexa/isotipo-3d.png',
  'brand/ejnexa/isotipo-flat.png',
  'brand/ejnexa/logo-light.png',
  'brand/ejnexa/logo-dark.png',
  'brand/ejnexa/icon-192.png',
  'brand/ejnexa/icon-512.png',
  'brand/ejnexa/maskable-512.png',
  'brand/ejnexa/favicon.png',
]
const availableBrandAssets = officialBrandAssets.filter(asset => existsSync(join(process.cwd(), 'public', asset)))
const officialPwaIcons = [
  { asset: 'brand/ejnexa/icon-192.png', sizes: '192x192', type: 'image/png' },
  { asset: 'brand/ejnexa/icon-512.png', sizes: '512x512', type: 'image/png' },
  { asset: 'brand/ejnexa/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
]

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    includeAssets: availableBrandAssets,
    manifest: {
      name: 'EJNEXA Business', short_name: 'EJNEXA', lang: 'es',
      description: 'Gestión inteligente para negocios.', theme_color: '#0A2D6B', background_color: '#FBF7F1',
      display: 'standalone', start_url: '/', scope: '/',
      icons: officialPwaIcons.filter(icon => existsSync(join(process.cwd(), 'public', icon.asset))).map(({ asset, ...icon }) => ({ src: `/${asset}`, ...icon })),
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
