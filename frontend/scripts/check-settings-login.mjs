import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const runtime = process.env.PLAYWRIGHT_PATH || 'C:/Users/aAdmin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
const { chromium } = require(runtime), { expect } = require(`${runtime}/test`)
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu'] })
const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173' })
const output = resolve('../data/interface-check')
try {
  const page = await context.newPage(), errors = [], gpuMessages = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', message => { if (message.text().startsWith('ShapeWaves:')) gpuMessages.push(message.text()) })
  await page.goto('/login')
  await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeVisible()
  await expect(page.locator('.login-backdrop')).toHaveCSS('background-color', 'rgb(6, 6, 8)')
  await page.getByRole('textbox', { name: 'VK ID', exact: true }).fill('123456789')
  await page.waitForFunction(() => document.querySelector('.shape-waves')?.getAttribute('data-ready') === 'true' || document.querySelector('.login-backdrop')?.getAttribute('data-background-state') === 'fallback', { timeout: 20000 })
  await page.waitForTimeout(2500)
  const backgroundState = await page.locator('.login-backdrop').getAttribute('data-background-state')
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    await page.screenshot({ path: resolve(output, `login-waves-${width}.png`), fullPage: true })
  }
  console.log(`Login gold/graphite background, form interaction and 3 widths passed; WebGPU=${backgroundState}; ${gpuMessages.join('; ')}`)
  assert.ok((await context.request.post('/api/auth/dev-login', { data: { access_level: 11, spheres: ['server'] } })).ok())
  const portal = await (await context.request.get('/api/dev/portal')).json()
  const catalog = await (await context.request.get('/api/dev/catalog')).json()
  const reads = {}, writes = [], settings = { ...portal.settings }
  let failedPortalSave = false
  await page.route('**/api/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname, method = req.method()
    if (method === 'GET') reads[path] = (reads[path] || 0) + 1
    if (path === '/api/dev/errors') return route.fulfill({ status: 204, body: '' })
    if (path === '/api/dev/chats') return route.fulfill({ status: 503, json: { detail: 'Связь с ботом не настроена. Настройки панели остаются доступны.' } })
    if (path === '/api/dev/catalog' && method === 'GET') return route.fulfill({ json: catalog })
    if (path === '/api/dev/portal' && method === 'GET') return route.fulfill({ json: { ...portal, settings } })
    if (path === '/api/dev/portal' && method === 'PATCH') {
      const body = req.postDataJSON(); writes.push({ path, keys: Object.keys(body) })
      if ('dev_error_retention_days' in body && !failedPortalSave) { failedPortalSave = true; return route.fulfill({ status: 500, json: { detail: 'Пробная ошибка сохранения настроек' } }) }
      Object.assign(settings, body)
      return route.fulfill({ json: { settings } })
    }
    if (path === '/api/dev/integrations') return route.fulfill({ json: { bot_ok: false, bot_error: 'Нет связи', sled_url: 'http://127.0.0.1:8081', sled_secret_configured: false, discord_configured: false, vk_service_configured: false, forum: null, forum_error: 'Нет данных' } })
    if (path === '/api/dev/forum') return route.fulfill({ json: { ok: false, configured: false, connected: false, logged_in: false, error: 'Пробный отказ авторизации', error_kind: 'authentication', library: { version: '1.9', revision: 'f904e7fc03f67907f542658e3f7c3d13d3058263' }, queue_policy: { interval_seconds: 2, max_requests: 30, window_seconds: 60 }, last_check: { checked_at: '2026-10-26T12:00:00Z', operation: 'check_health', http_status: 401, path: '/account/', http_duration_ms: 200, duration_ms: 2200, error_kind: 'authentication', ok: false }, cookies: {} } })
    if (path === '/api/dev/command-access') return route.fulfill({ json: { items: [{ key: 'sample', label: 'Тестовая команда', category: 'Общие', default_min_level: 2, min_level: 2, overridable: true, is_override: false }] } })
    if (!['GET', 'HEAD'].includes(method) && !path.startsWith('/api/auth/')) throw new Error(`Unexpected business mutation: ${method} ${path}`)
    return route.continue()
  })
  await page.goto('/dev/settings')
  await expect(page.getByRole('alert')).toContainText('Связь с ботом не настроена')
  await page.getByRole('tab', { name: 'Портал', exact: true }).click()
  await expect(page).toHaveURL(/tab=portal/)
  const retention = page.getByRole('spinbutton', { name: 'Хранение логов ошибок (записей)' })
  await retention.fill('650')
  await page.getByRole('tab', { name: 'Уведомления', exact: true }).click()
  await expect(page.getByText('Напоминания по задачам', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Портал', exact: true }).click()
  await expect(retention).toHaveValue('650')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Пробная ошибка сохранения настроек')
  await expect(retention).toHaveValue('650')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByText('Сохранено', { exact: true })).toBeVisible()
  assert.deepEqual(writes.at(-1).keys, ['dev_error_retention_days'])
  await page.getByRole('tab', { name: 'Форум', exact: true }).click()
  await expect(page.getByText('Arizona API 1.9', { exact: true })).toBeVisible()
  await expect(page.getByText('401 · /account/', { exact: true })).toBeVisible()
  const chatsBefore = reads['/api/dev/chats'], forumBefore = reads['/api/dev/forum']
  await page.getByRole('button', { name: 'Обновить', exact: true }).click()
  await expect.poll(() => reads['/api/dev/forum']).toBeGreaterThan(forumBefore)
  assert.equal(reads['/api/dev/chats'], chatsBefore)
  await page.getByRole('tab', { name: 'Интеграции', exact: true }).click()
  await expect(page.getByText('Как подключить сервисы', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Справочники', exact: true }).click()
  await expect(page.getByText('Фракции', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Права команд', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Сохранить права' })).toBeDisabled()
  await page.getByRole('tab', { name: 'Ссылки', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Чек-листы · архив' })).toBeVisible()
  await page.getByRole('tab', { name: 'Портал', exact: true }).click()
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    await page.screenshot({ path: resolve(output, `settings-${width}.png`), fullPage: true })
    await page.goto('/profile?tab=manage')
    await expect(page.locator('.profile-preferences-card')).toHaveCount(2)
    await page.getByRole('textbox', { name: 'Discord ID', exact: true }).fill('bad-id')
    await page.getByRole('button', { name: 'Сохранить настройки', exact: true }).click()
    await expect(page.getByText('Discord ID — 17–20 цифр', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Сбросить', exact: true }).click()
    await page.screenshot({ path: resolve(output, `personal-settings-${width}.png`), fullPage: true })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    await page.goto('/dev/settings?tab=portal')
  }
  assert.deepEqual(errors, [])
  console.log('All 8 settings tabs, independent refresh, retained drafts/save errors, diagnostics and personal settings passed; no real settings changed.')
} finally { await context.close(); await browser.close() }
