import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const runtime = process.env.PLAYWRIGHT_PATH || 'C:/Users/aAdmin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
const { chromium } = require(runtime), { expect } = require(`${runtime}/test`)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173', reducedMotion: 'reduce' })
const output = resolve('../data/interface-check'); await mkdir(output, { recursive: true })
try {
  assert.ok((await context.request.post('/api/auth/dev-login', { data: { access_level: 5, spheres: ['gov_structures'] } })).ok())
  let me = await (await context.request.get('/api/auth/me')).json()
  for (const path of ['/api/cases', '/api/issuance/cases', '/api/cases/templates']) assert.ok((await context.request.get(path)).ok(), path)
  const prizes = Array.from({ length: 2 }, (_, i) => ({ id: i + 1, case_id: 999, title: i ? 'Подписка на месяц' : '100 AZ', image_url: '', weight: 1, sort_order: i, rarity_label: '' }))
  const snapshot = { id: 999, title: 'Выданный кейс', description: 'Сохранённый состав', cover_image_url: '', spin_duration_ms: 14000, can_spin: true, is_active: true, prizes }
  let grant = null, reward = null, attempts = 0, openings = 0, keys = [], moneyReads = 0
  const page = await context.newPage(), errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method()
    if (path === '/api/dev/errors') return route.fulfill({ status: 204, body: '' })
    if (path === '/api/staff') return route.fulfill({ json: { members: [{ vk_id: me.vk_id, access_level: 5, nickname: 'Test_Recipient', public_id: me.public_id }] } })
    if (path === '/api/cases/templates') return route.fulfill({ json: { cases: [snapshot] } })
    if (path === '/api/cases') {
      const status = url.searchParams.get('status')
      const items = grant && (status !== 'available' || grant.status === 'available') && (status !== 'history' || grant.status !== 'available') ? [{ ...grant, reward }] : []
      return route.fulfill({ json: { items, total: items.length, available_count: grant?.status === 'available' ? 1 : 0, can_grant: me.access_level >= 5 } })
    }
    if (path === '/api/cases/grants' && method === 'POST') {
      attempts++; keys.push(request.postDataJSON().request_key)
      if (attempts === 1) return route.fulfill({ status: 500, json: { detail: 'Пробный сбой сохранения. Повторите запрос.' } })
      grant = { id: 1, case_id: 999, snapshot, status: 'available', recipient_vk_id: me.vk_id, recipient_name: 'Test_Recipient', granted_by_vk_id: me.vk_id, granted_by_name: 'Test_Recipient', created_at: '2026-10-26T12:00:00Z', opened_at: null, can_open: true, can_revoke: true, reward: null }
      return route.fulfill({ json: grant })
    }
    if (path === '/api/cases/grants/1') return route.fulfill({ json: { ...grant, reward } })
    if (path === '/api/cases/grants/1/open') {
      openings++; grant.status = 'opened'; grant.can_open = false; grant.can_revoke = false
      reward ||= { id: 1, grant_id: 1, recipient_vk_id: me.vk_id, recipient_name: 'Test_Recipient', case_title: snapshot.title, prize: prizes[1], status: 'pending', created_at: '2026-10-26T12:01:00Z', reviewed_at: null, reviewed_by_vk_id: null, reviewed_by_name: null, history: [], can_review: true }
      return route.fulfill({ json: { spin_token: 'saved-winner', spin_duration_ms: 14000, prize: reward.prize, prizes, reward_id: 1, already_opened: openings > 1 } })
    }
    if (path === '/api/issuance/cases') return route.fulfill({ json: { items: reward ? [{ ...reward, can_review: me.access_level >= 5 }] : [], total: reward ? 1 : 0 } })
    if (path === '/api/issuance/cases/1/issue') {
      reward = { ...reward, status: 'issued', reviewed_by_vk_id: me.vk_id, reviewed_by_name: 'Test_Recipient', reviewed_at: '2026-10-26T12:02:00Z', history: [{ action: 'issue', from: 'pending', to: 'issued', actor_vk_id: me.vk_id, at: '2026-10-26T12:02:00Z' }] }
      return route.fulfill({ json: reward })
    }
    if (path === '/api/issuance') moneyReads++
    if (!['GET', 'HEAD'].includes(method) && !path.startsWith('/api/auth/')) throw new Error(`Unexpected business mutation: ${method} ${path}`)
    return route.continue()
  })
  await page.goto('/cases')
  await page.getByRole('button', { name: 'Выдать кейс', exact: true }).click()
  const comboCase = page.getByRole('combobox', { name: 'Кейс для выдачи' })
  await comboCase.click(); await page.getByRole('option', { name: snapshot.title }).click()
  await page.getByRole('combobox', { name: 'Получатель кейса' }).click(); await page.getByRole('option', { name: 'Test_Recipient' }).click()
  await page.getByRole('button', { name: 'Выдать', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Пробный сбой сохранения')
  await expect(comboCase).toContainText(snapshot.title)
  await page.getByRole('button', { name: 'Выдать', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  assert.equal(new Set(keys).size, 1, 'Retry must retain the grant request key')
  await page.getByRole('link', { name: 'Открыть кейс', exact: true }).click()
  await page.getByRole('button', { name: 'Крутить', exact: true }).click()
  await expect(page.locator('.case-roulette-result-title')).toHaveText('Подписка на месяц')
  await expect(page.getByRole('button', { name: 'Кейс открыт', exact: true })).toBeDisabled()
  await page.reload()
  await expect(page.locator('.case-roulette-result-title')).toHaveText('Подписка на месяц')
  assert.equal(openings, 1, 'Reload must restore the persisted result without another spin')
  await page.getByRole('link', { name: 'Выдача приза', exact: true }).click()
  await expect(page.locator('.case-reward-card')).toContainText('Ожидает выдачи')
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Отметить выданным' }).click()
  await expect(page.locator('.case-reward-card')).toContainText('Выдан')
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/cases?view=history')
    await expect(page.locator('.case-inventory-card')).toContainText('Подписка на месяц')
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    await page.screenshot({ path: resolve(output, `my-cases-${width}.png`), fullPage: true })
    await page.goto('/issuance?kind=cases')
    await expect(page.locator('.case-reward-card')).toBeVisible()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    await page.screenshot({ path: resolve(output, `case-rewards-${width}.png`), fullPage: true })
  }
  await context.request.post('/api/auth/dev-login', { data: { access_level: 1, spheres: ['central_apparatus'] } })
  me = await (await context.request.get('/api/auth/me')).json()
  await page.goto('/issuance?kind=cases')
  await expect(page.locator('.case-reward-card')).toBeVisible()
  await expect(page.getByRole('link', { name: 'АЗ', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Отменить решение' })).toHaveCount(0)
  await page.goto('/cases')
  await expect(page.getByRole('button', { name: 'Выдать кейс', exact: true })).toHaveCount(0)
  assert.equal(moneyReads, 0)
  assert.deepEqual(errors, [])
  console.log('Cases: grant retry, own opening, restored winner, self-fulfillment, 3 widths and level 1 isolation passed. No real grants or awards created.')
} finally { await context.close(); await browser.close() }
