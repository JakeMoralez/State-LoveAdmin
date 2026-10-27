import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const runtime = process.env.PLAYWRIGHT_PATH || 'C:/Users/aAdmin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
const { chromium } = require(runtime), { expect } = require(`${runtime}/test`)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  for (const width of [390, 768, 1440]) {
    const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173', viewport: { width, height: 1000 } })
    try {
      assert.equal((await context.request.post('/api/auth/dev-login', { data: { access_level: 11, spheres: ['server'] } })).status(), 200)
      const list = await (await context.request.get('/api/staff')).json()
      const original = list.members.find(m => m.access_level === 2)
      assert.ok(original)
      let detail = await (await context.request.get(`/api/staff/${original.vk_id}`)).json()
      let failed = false, writes = []
      const page = await context.newPage()
      await page.route('**/api/**', async route => {
        const req = route.request(), path = new URL(req.url()).pathname
        if (path === '/api/staff' && req.method() === 'GET') return route.fulfill({ json: { ...list, members: [detail], total: 1 } })
        if (path === `/api/staff/${detail.vk_id}`) {
          if (req.method() === 'GET') return route.fulfill({ json: detail })
          if (req.method() === 'PATCH') {
            const body = req.postDataJSON(); writes.push(body)
            if (failed) return route.fulfill({ status: 400, json: { detail: 'Этот ник уже занят' } })
            detail = { ...detail, nickname: 'Bob_New', bot_nickname: '[След. МЮ] Bob_New', display_name: '[След. МЮ] Bob_New', spheres: ['justice'] }
            return route.fulfill({ json: detail })
          }
        }
        if (!['GET', 'HEAD'].includes(req.method()) && !path.includes('/auth/refresh')) throw new Error(`Unexpected mutation ${path}`)
        return route.continue()
      })
      await page.goto('/staff')
      await page.getByRole('button', { name: /^Настройки:/ }).click()
      await page.locator('#staff-nickname').fill('Bob_New')
      await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(page.getByRole('link', { name: '[След. МЮ] Bob_New', exact: true })).toBeVisible()
      assert.equal(writes[0].nickname, 'Bob_New')
      failed = true
      await page.getByRole('button', { name: /^Настройки:/ }).click()
      await page.locator('#staff-nickname').fill('Bob_Broken')
      await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
      await expect(page.getByRole('alert')).toContainText('Этот ник уже занят')
      await expect(page.locator('#staff-nickname')).toHaveValue('Bob_Broken')
      await expect(page.getByRole('dialog')).toBeVisible()
      assert.equal(writes.length, 2)
      console.log(`Staff save ${width}px: response updates registry; rejected save preserves draft. All writes mocked.`)
    } finally { await context.close() }
  }
} finally { await browser.close() }
