import { expect, test, type Page } from '@playwright/test'

const userId = '11111111-1111-4111-8111-111111111111'
const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'arpe-test@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }
const session = { access_token: 'test-token', refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user }
const business = { id: '22222222-2222-4222-8222-222222222222', owner_id: userId, name: 'Dulce Encanto', slogan: 'Hecho con amor', logo_path: null, description: '', whatsapp: '', email: '', address: '', currency: 'NIO', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }

async function mockBackend(page: Page, existing = false) {
  let profile: Record<string, unknown> | null = existing ? { ...business } : null
  await page.route('**/auth/v1/**', async route => {
    const url = route.request().url()
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(url.includes('/user') ? user : url.includes('/logout') || url.includes('/recover') ? {} : session) })
  })
  await page.route('**/rest/v1/arpe_businesses*', async route => {
    const method = route.request().method()
    if (method === 'POST') profile = { ...business, ...route.request().postDataJSON() }
    if (method === 'PATCH') profile = { ...profile, ...route.request().postDataJSON() }
    await route.fulfill({ status: method === 'POST' ? 201 : 200, contentType: 'application/json', body: JSON.stringify(method === 'GET' ? profile ? [profile] : [] : profile) })
  })
}

async function login(page: Page) {
  await page.goto('/')
  await page.getByLabel('Correo electrónico').fill('arpe-test@example.com')
  await page.getByLabel('Contraseña', { exact: true }).fill('Example-password-123')
  await page.getByRole('button', { name: 'Entrar a mi negocio' }).click()
}

test('onboarding, persistence, settings, navigation and logout', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await mockBackend(page)
  await login(page)
  await expect(page.getByRole('heading', { name: /Tu negocio merece/ })).toBeVisible()
  await page.getByLabel('Nombre del negocio').fill('Dulce Encanto')
  await page.getByLabel('Eslogan').fill('Hecho con amor')
  await page.getByLabel('Descripción').fill('Pastelería artesanal')
  await page.getByLabel('WhatsApp').fill('+505 8888 8888')
  await page.getByLabel('Correo del negocio').fill('hola@example.com')
  await page.getByLabel('Dirección').fill('Managua')
  await page.getByLabel('Moneda principal').selectOption('CRC')
  await page.getByRole('button', { name: 'Crear mi negocio' }).click()
  await expect(page.getByRole('heading', { name: /Todo empieza/ })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: /Todo empieza/ })).toBeVisible()
  await expect(page.getByText('CRC', { exact: false }).first()).toBeVisible()
  for (const name of ['Cotizar', 'Pedidos', 'Pagos', 'Agenda']) {
    await page.getByRole('navigation').getByRole('link', { name, exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Estamos preparando este espacio' })).toBeVisible()
  }
  await page.getByRole('link', { name: 'Configuración', exact: true }).click()
  await page.getByLabel('Nombre del negocio').fill('Dulce Encanto Nicaragua')
  await page.getByLabel('Moneda principal').selectOption('USD')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByRole('status')).toContainText('se guardaron correctamente')
  await page.reload()
  await expect(page.getByLabel('Nombre del negocio')).toHaveValue('Dulce Encanto Nicaragua')
  await expect(page.getByLabel('Moneda principal')).toHaveValue('USD')
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page.getByRole('heading', { name: 'Qué gusto tenerte aquí' })).toBeVisible()
  await page.goto('/configuracion')
  await expect(page.getByRole('heading', { name: 'Qué gusto tenerte aquí' })).toBeVisible()
})

for (const width of [320, 360, 390, 768, 884, 1440]) {
  test(`responsive login and dashboard at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await mockBackend(page, true)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Qué gusto tenerte aquí' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await login(page)
    await expect(page.getByRole('heading', { name: /Todo empieza/ })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `verification/dashboard-${width}.png`, fullPage: true })
  })
}

test('failed login and password recovery request', async ({ page }) => {
  await page.route('**/auth/v1/token*', route => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ msg: 'Invalid login credentials', error_code: 'invalid_credentials' }) }))
  await page.route('**/auth/v1/recover*', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await login(page)
  await expect(page.getByRole('alert')).toHaveText('El correo o la contraseña no son correctos.')
  await page.getByRole('button', { name: '¿Olvidaste tu contraseña?' }).click()
  await page.getByRole('button', { name: 'Enviar enlace' }).click()
  await expect(page.getByRole('status')).toContainText('recibirás un enlace')
})

test('signup confirmation and recovery password form', async ({ page }) => {
  await page.route('**/auth/v1/signup*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) }))
  await page.goto('/')
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click()
  await page.getByLabel('Correo electrónico').fill('arpe-test@example.com')
  await page.getByLabel('Contraseña', { exact: true }).fill('Example-password-123')
  await page.getByRole('button', { name: 'Crear mi cuenta' }).click()
  await expect(page.getByRole('status')).toContainText('confirma tu cuenta')
  await mockBackend(page, true)
  await page.evaluate(() => sessionStorage.setItem('arpe:recovery', 'true'))
  await login(page)
  await expect(page.getByRole('heading', { name: 'Una nueva contraseña' })).toBeVisible()
  await page.getByLabel('Contraseña', { exact: true }).fill('Updated-password-456')
  await page.getByRole('button', { name: 'Guardar contraseña' }).click()
  await expect(page.getByRole('heading', { name: /Todo empieza/ })).toBeVisible()
})

test('logo upload, signed preview and removal', async ({ page }) => {
  await mockBackend(page, true)
  const storageCalls: string[] = []
  await page.route('**/storage/v1/**', async route => {
    const method = route.request().method()
    storageCalls.push(method)
    if (method === 'GET') return route.fulfill({ path: 'public/icons/icon-192.png', contentType: 'image/png' })
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(route.request().url().includes('/sign/') ? { signedURL: '/object/sign/arpe-business-logos/test.png?token=test' } : { Key: 'test.png' }) })
  })
  await login(page)
  await page.getByRole('link', { name: 'Configuración', exact: true }).click()
  await page.getByLabel('Logo del negocio').setInputFiles('public/icons/icon-192.png')
  await expect(page.getByAltText('Vista previa del nuevo logo')).toBeVisible()
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByRole('status')).toContainText('se guardaron correctamente')
  await expect(page.getByAltText('Logo de Dulce Encanto').first()).toBeVisible()
  await page.getByRole('button', { name: 'Quitar logo' }).click()
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByRole('status')).toContainText('se guardaron correctamente')
  await expect(page.getByAltText('Logo de Dulce Encanto')).toHaveCount(0)
  expect(storageCalls).toContain('DELETE')
})
