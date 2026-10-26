import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const runtime = process.env.PLAYWRIGHT_PATH || 'C:/Users/aAdmin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
const { chromium } = require(runtime), { expect } = require(`${runtime}/test`)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173' })
try {
  await context.request.post('/api/auth/dev-login', { data: { access_level: 11, spheres: ['server'] } })
  const page = await context.newPage(), errors = [], queries = []
  page.on('pageerror', e => errors.push(e.message))
  const base = await (await context.request.get('/api/knowledge?include_drafts=true')).json()
  let releaseSlow
  const slow = new Promise(resolve => { releaseSlow = resolve })
  await page.route('**/api/knowledge?*', async route => {
    const params = new URL(route.request().url()).searchParams
    queries.push(Object.fromEntries(params))
    const q = params.get('q') || ''
    if (q === 'slow') await slow
    const articles = q === 'empty' ? [] : [{ ...base.articles[0], id: 999, title: q || 'Все материалы', excerpt: '[!NOTE] Текст заметки' }]
    await route.fulfill({ json: { ...base, articles } }).catch(() => {})
  })
  await page.goto('/knowledge')
  const search = page.getByRole('searchbox', { name: 'Поиск по базе знаний' })
  await expect(page.locator('.kb-card')).toContainText('Все материалы')
  await search.fill('slow'); await search.press('Enter')
  await expect.poll(() => queries.some(query => query.q === 'slow')).toBeTruthy()
  await search.fill('fast'); await page.getByRole('button', { name: 'Найти', exact: true }).click()
  await expect(page.locator('.kb-card')).toContainText('fast')
  releaseSlow()
  await expect(page.locator('.kb-card')).toContainText('fast')
  await expect(page.locator('.kb-card')).not.toContainText('[!NOTE]')
  await page.getByRole('tab', { name: 'Регламент', exact: true }).click()
  await page.getByRole('button', { name: 'Очистить поиск' }).click()
  await expect(search).toHaveValue('')
  await expect(page.locator('.kb-card')).toContainText('Все материалы')
  assert.equal(queries.at(-1).category, 'reglament')
  assert.ok(!queries.at(-1).q)
  await search.fill('empty'); await search.press('Enter')
  await expect(page.getByText('Ничего не найдено', { exact: true })).toBeVisible()
  console.log('Search submit/reset, category preservation, old response cancellation and legacy excerpt passed')
  await page.goto('/dashboard')
  const sidebar = page.locator('#app-sidebar')
  await page.getByRole('button', { name: 'Свернуть панель', exact: true }).click()
  assert.ok((await sidebar.evaluate(el => getComputedStyle(el).transitionDuration)).includes('0.32s'))
  await expect(sidebar).toHaveClass(/sidebar-shell--collapsed/)
  await page.getByRole('button', { name: 'Развернуть панель', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 900 })
  const menu = page.getByRole('button', { name: 'Открыть меню', exact: true })
  await menu.click()
  await expect(sidebar).toHaveAttribute('aria-hidden', 'false')
  await page.keyboard.press('Escape')
  await expect(sidebar).toHaveAttribute('inert', '')
  await expect(menu).toBeFocused()
  await expect(sidebar).toBeHidden()
  console.log('Sidebar transition, mobile inert, Escape and focus restoration passed')
  const members = (await (await context.request.get('/api/staff')).json()).members
  const target = members.find(m => m.access_level === 2)
  await page.goto(`/profile/${target.public_id}`)
  await page.getByRole('button', { name: 'Редактировать', exact: true }).click()
  const reason = page.getByRole('textbox', { name: 'Причина изменения', exact: true })
  await reason.fill('Проверка черновика без сохранения')
  page.once('dialog', d => d.dismiss())
  await page.evaluate(() => history.back())
  await expect(page.getByRole('tab', { name: 'Управление', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page).toHaveURL(/tab=manage/)
  await expect(reason).toHaveValue('Проверка черновика без сохранения')
  page.once('dialog', d => d.accept())
  await page.reload()
  await expect(reason).toHaveValue('Проверка черновика без сохранения')
  page.once('dialog', d => d.accept())
  await page.getByRole('button', { name: 'Сбросить изменения', exact: true }).click()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`/profile/${target.public_id}`)
    await page.evaluate(() => { document.body.style.zoom = '1.5' })
    await expect(page.locator('.profile-overview-cards')).toBeVisible()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
  }
  await page.evaluate(() => { document.body.style.zoom = '' })
  const member = await (await context.request.get(`/api/staff/${target.vk_id}`)).json()
  let fixture = { ...member, public_id: 9999 }
  let leader = { vk_id: target.vk_id, public_id: 9999, in_registry: false, permissions: {} }
  await page.route('**/api/profile/resolve/9999', r => r.fulfill({ json: { vk_id: target.vk_id, public_id: 9999 } }))
  await page.route(`**/api/staff/${target.vk_id}`, r => r.fulfill({ json: fixture }))
  await page.route(`**/api/staff/leaders/${target.vk_id}`, r => r.fulfill({ json: leader }))
  fixture = { ...member, public_id: 9999, spheres: ['defense', 'health'], senior_spheres: ['health'], is_senior: true }
  await page.goto('/profile/9999')
  await expect(page.locator('.profile-info-card').filter({ hasText: 'Обязанности' })).toContainText('Старший следящий')
  await expect(page.locator('.profile-info-card').filter({ hasText: 'Обязанности' })).toContainText('Министерство')
  fixture = { ...member, public_id: 9999, access_level: 0, in_registry: false, appointment_history: [] }
  leader = { ...leader, in_registry: true, nickname: 'Leader_Test', position: 'Лидер', access_role_title: 'Лидер', org_tag: 'LSPD', sphere: 'justice' }
  await page.goto('/profile/9999')
  await expect(page.locator('.profile-v2-position')).toContainText('LSPD')
  await expect(page.locator('.profile-status')).toHaveText('В составе')
  leader = { ...leader, in_registry: false }
  fixture = { ...fixture, appointment_history: [{ id: 1, position: 'Лидер', org_tag: 'LSPD', closed_at: '2026-10-20', granted_at: '2026-08-01' }] }
  await page.goto('/profile/9999')
  await expect(page.locator('.profile-status')).toHaveText('Без назначения')
  await page.getByRole('tab', { name: 'История', exact: true }).click()
  await expect(page.locator('.profile-appointment-history')).toContainText('LSPD')
  fixture = { ...fixture, permissions: Object.fromEntries(Object.keys(member.permissions).map(key => [key, key === 'max_access_level' ? 0 : false])) }
  await page.goto('/profile/9999?tab=manage')
  await expect(page.getByRole('tab', { name: 'Управление', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Редактировать', exact: true })).toHaveCount(0)
  await expect(page.locator('.profile-overview-cards')).toBeVisible()
  console.log('Supervisor scopes, leader, unassigned/archive and restricted profile fixtures passed')
  assert.deepEqual(errors, [])
  console.log('Back navigation protection, reload draft recovery and 150% profile zoom passed; no business writes')
} finally { await context.close(); await browser.close() }
