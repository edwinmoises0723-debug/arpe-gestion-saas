import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined })
try {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto('http://localhost:4173')
  await page.getByRole('heading', { name: 'Qué gusto tenerte aquí' }).waitFor()
  const manifest = await page.evaluate(async () => (await fetch('/manifest.webmanifest')).json())
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.icons.length, 3)
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
  console.log('PASS: installable manifest, registered service worker, offline shell, offline notice, no Supabase data cached.')
} finally { await browser.close() }
