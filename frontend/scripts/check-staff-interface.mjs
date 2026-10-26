import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const runtime = process.env.PLAYWRIGHT_PATH || 'C:/Users/aAdmin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
const { chromium } = require(runtime)
const { expect } = require(`${runtime}/test`)
const output = resolve('../data/interface-check')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173' })
const errors = []
const expectedWarnings = []
const checks = []
try {
  const login = await context.request.post('/api/auth/dev-login', { data: { access_level: 11, spheres: ['server'] } })
  expect(login.ok()).toBeTruthy()
  const { members } = await (await context.request.get('/api/staff')).json()
  const target = members.find(m => m.access_level === 2)
  expect(target, 'A local supervisor is needed for read-only form checks').toBeTruthy()
  // Never submit business mutations against the user's local data.
  await context.route('**/api/**', async route => {
    if (!['GET', 'HEAD'].includes(route.request().method()) && !route.request().url().includes('/auth/refresh')) {
      if (new URL(route.request().url()).pathname === '/api/dev/errors') {
        const data = route.request().postDataJSON()
        if (data.message === 'SLED_BOT_SECRET не настроен — беседы недоступны.') expectedWarnings.push(data.message)
        else errors.push(`Client error: ${data.message || ''}`)
        return route.fulfill({ status: 204, body: '' })
      }
      errors.push(`Unexpected mutation: ${route.request().method()} ${new URL(route.request().url()).pathname}`)
      return route.abort()
    }
    return route.continue()
  })
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const path of ['/dashboard', '/staff', '/leaders', '/activity', '/assign', '/tasks', '/question-banks', '/issuance', '/knowledge', '/forum/formatting', '/dev/settings', '/dev/cases', '/checklist']) {
      await page.goto(path, { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('main')).toBeVisible()
      await expect(page.locator('.page-skeleton')).toHaveCount(0)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
      checks.push({ path, width, overflow })
      expect(overflow, `${path} overflows at ${width}px`).toBeFalsy()
    }
    console.log(`Page layouts passed at ${width}px`)
    await page.goto(`/profile/${target.public_id}`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.profile-overview-cards')).toBeVisible()
    await page.screenshot({ animations: 'disabled', path: resolve(output, `profile-${width}.png`), fullPage: true })
    await page.getByRole('button', { name: 'Редактировать', exact: true }).click()
    await expect(page.getByRole('tab', { name: 'Управление', exact: true })).toHaveAttribute('aria-selected', 'true')
    const status = page.getByRole('combobox', { name: 'Назначение: Министерство Здравоохранения', exact: true })
    await status.scrollIntoViewIfNeeded()
    await status.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('option')).toHaveText(['Не назначен', 'Следящий', 'Старший следящий'])
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await expect(status).toContainText('Старший следящий')
    await expect(status).toBeFocused()
    page.once('dialog', dialog => dialog.dismiss())
    await page.getByRole('tab', { name: 'Обзор', exact: true }).click()
    await expect(page.getByRole('tab', { name: 'Управление', exact: true })).toHaveAttribute('aria-selected', 'true')
    page.once('dialog', dialog => dialog.accept())
    await page.getByRole('tab', { name: 'Обзор', exact: true }).click()
    await page.getByRole('tab', { name: 'Управление', exact: true }).click()
    await expect(status).toContainText('Старший следящий')
    page.once('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Сбросить изменения', exact: true }).click()
    await page.getByRole('tab', { name: 'Действия', exact: true }).click()
    await expect(page.getByRole('tab', { name: 'Действия', exact: true })).toHaveAttribute('aria-selected', 'true')
    await page.getByRole('tab', { name: 'Обзор', exact: true }).click()
    await page.goto('/staff')
    await page.getByRole('button', { name: /^Настройки:/ }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    const combo = page.getByRole('dialog').getByRole('combobox').first()
    await combo.click()
    await expect(page.getByRole('listbox')).toBeVisible()
    expect(await page.getByRole('listbox').evaluate(el => !!el.closest('[role="dialog"]'))).toBeTruthy()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('listbox')).toHaveCount(0)
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.screenshot({ animations: 'disabled', path: resolve(output, `staff-edit-${width}.png`), fullPage: true })
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    checks.push({ path: '/profile/:id', width, form: 'seniority and draft protection passed' })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/knowledge')
  await expect(page.locator('.kb-card').first()).toBeVisible()
  await page.screenshot({ animations: 'disabled', path: resolve(output, 'knowledge-1440.png'), fullPage: true })
  await page.goto('/question-banks')
  await page.screenshot({ animations: 'disabled', path: resolve(output, 'banks-1440.png'), fullPage: true })
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ checks, errors, expectedWarnings }, null, 2))
  expect(errors).toEqual([])
  console.log(`Passed ${checks.length} interface checks. No user data changed.`)
} finally {
  await context.close()
  await browser.close()
}
