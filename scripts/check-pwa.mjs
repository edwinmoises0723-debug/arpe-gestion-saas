import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from '@playwright/test'
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined })
try {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto('http://localhost:4173')
  await page.getByRole('heading', { name: 'Qué gusto tenerte aquí' }).waitFor()
  const manifest = await page.evaluate(async () => (await fetch('/manifest.webmanifest')).json())
  assert.equal(manifest.name, 'EJNEXA Business')
  assert.equal(manifest.short_name, 'EJNEXA')
  assert.equal(manifest.description, 'Gestión inteligente para negocios.')
  assert.equal(manifest.theme_color, '#0A2D6B')
  assert.equal(manifest.background_color, '#FBF7F1')
  assert.equal(manifest.display, 'standalone')
  const expectedIcons = ['icon-192.png', 'icon-512.png', 'maskable-512.png'].filter(name => existsSync(join(process.cwd(), 'public', 'brand/ejnexa', name)))
  assert.deepEqual(manifest.icons.map(icon => icon.src), expectedIcons.map(name => `/brand/ejnexa/${name}`))
  const faviconHref = await page.locator('link[rel="icon"]').getAttribute('href')
  assert.equal(faviconHref, '/brand/ejnexa/favicon.png')
  const imageChecks = await page.evaluate(async paths => Promise.all(paths.map(async ({ path, size }) => {
    const response = await fetch(path)
    const bytes = new Uint8Array(await response.arrayBuffer())
    const view = new DataView(bytes.buffer)
    return { path, status: response.status, contentType: response.headers.get('content-type'), signature: Array.from(bytes.slice(0, 8)), width: view.getUint32(16), height: view.getUint32(20), expectedSize: size }
  })), [
    { path: faviconHref, size: 256 },
    { path: '/brand/ejnexa/icon-192.png', size: 192 },
    { path: '/brand/ejnexa/icon-512.png', size: 512 },
    { path: '/brand/ejnexa/maskable-512.png', size: 512 },
  ])
  for (const check of imageChecks) {
    assert.equal(check.status, 200, `${check.path} must load successfully`)
    assert.match(check.contentType ?? '', /image\/png/, `${check.path} must be served as PNG`)
    assert.deepEqual(check.signature, [137, 80, 78, 71, 13, 10, 26, 10], `${check.path} must have a PNG signature`)
    assert.equal(check.width, check.expectedSize, `${check.path} width`)
    assert.equal(check.height, check.expectedSize, `${check.path} height`)
  }
  assert.deepEqual(manifest.icons.map(icon => icon.sizes), ['192x192', '512x512', '512x512'])
  assert.equal(manifest.icons[2].purpose, 'maskable')
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await page.reload()
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
  await context.setOffline(true)
  await page.reload()
  await page.getByRole('heading', { name: 'Qué gusto tenerte aquí' }).waitFor()
  await page.getByRole('status').filter({ hasText: 'Sin conexión' }).waitFor()
  const cachedUrls = await page.evaluate(async () => {
    const urls = []
    for (const name of await globalThis.caches.keys()) {
      const cache = await globalThis.caches.open(name)
      urls.push(...(await cache.keys()).map(request => request.url))
    }
    return urls
  })
  assert(!cachedUrls.some(url => url.includes('supabase.co')), 'Private API responses must not be cached')
  console.log('PASS: EJNEXA manifest, registered service worker, offline shell, offline notice, no Supabase data cached.')
} finally { await browser.close() }
