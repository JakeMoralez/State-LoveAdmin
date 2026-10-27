import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const runtime = process.env.PLAYWRIGHT_PATH || 'C:/Users/aAdmin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
const { chromium } = require(runtime), { expect } = require(`${runtime}/test`)
const output = resolve('../data/interface-check')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const seniorNick = '[Ст. След. МО | След. МЮ] Bob_Burmalda'
const ordinaryNick = '[След. МЮ&МО] Bob_Burmalda'
try {
  for (const width of [390, 768, 1440]) {
    const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173', viewport: { width, height: 1000 } })
    try {
      assert.equal((await context.request.post('/api/auth/dev-login', { data: { access_level: 11, spheres: ['server'] } })).status(), 200)
      const list = await (await context.request.get('/api/staff')).json()
      const original = list.members.find(m => m.access_level === 2)
      assert.ok(original)
      const current = await (await context.request.get(`/api/staff/${original.vk_id}`)).json()
      let detail = { ...current, nickname: '[След. МЮ] Bob_Burmalda', bot_nickname: '[След. МЮ] Bob_Burmalda',
        display_name: '[След. МЮ] Bob_Burmalda', spheres: ['justice'], sphere: 'Министерство Юстиции',
        is_senior: false, senior_spheres: [], access_level: 2 }
      let reject = false
      const writes = [], errors = []
      const page = await context.newPage()
      page.on('pageerror', e => errors.push(e.message))
      await page.route('**/api/**', async route => {
        const req = route.request(), path = new URL(req.url()).pathname
        if (path === '/api/staff' && req.method() === 'GET') return route.fulfill({ json: { ...list, members: [detail], total: 1 } })
        if (path === `/api/staff/${detail.vk_id}`) {
          if (req.method() === 'GET') return route.fulfill({ json: detail })
          if (req.method() === 'PATCH') {
            const body = req.postDataJSON(); writes.push(body)
            if (reject) return route.fulfill({ status: 400, json: { detail: 'Этот ник уже занят' } })
            const senior = body.is_senior ?? detail.is_senior
            detail = { ...detail, ...body, bot_nickname: senior ? seniorNick : ordinaryNick,
              nickname: senior ? seniorNick : ordinaryNick, display_name: senior ? seniorNick : ordinaryNick,
              sphere: 'Министерство Юстиции, Министерство Обороны' }
            return route.fulfill({ json: detail })
          }
        }
        if (!['GET', 'HEAD'].includes(req.method()) && !path.includes('/auth/refresh')) {
          errors.push(`Unexpected mutation ${path}`)
          return route.abort()
        }
        return route.continue()
      })
      await page.goto('/staff')
      const open = () => page.getByRole('button', { name: /^Настройки:/ }).click()
      const defense = page.getByRole('combobox', { name: 'Назначение: Министерство Обороны', exact: true })
      const justice = page.getByRole('combobox', { name: 'Назначение: Министерство Юстиции', exact: true })
      const choose = async label => {
        await defense.click()
        await page.getByRole('option', { name: label, exact: true }).click()
      }
      const save = () => page.getByRole('button', { name: 'Сохранить', exact: true }).click()
      await open()
      await expect(justice).toContainText('Следящий')
      await choose('Старший следящий')
      await expect(page.getByText(seniorNick, { exact: true })).toBeVisible()
      await save()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(page.getByRole('link', { name: seniorNick, exact: true })).toBeVisible()
      assert.deepEqual([...writes[0].spheres].sort(), ['defense', 'justice'])
      assert.deepEqual(writes[0].senior_spheres, ['defense'])
      assert.equal(writes[0].is_senior, true)
      assert.equal(writes[0].nickname, 'Bob_Burmalda')
      assert.equal('access_level' in writes[0], false)
      await writeFile(resolve(output, 'staff-sphere-payload.json'), JSON.stringify(writes[0], null, 2))
      await open()
      await expect(defense).toContainText('Старший следящий')
      await expect(justice).toContainText('Следящий')
      await choose('Следящий')
      await expect(page.getByText(ordinaryNick, { exact: true })).toBeVisible()
      await save()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      assert.deepEqual(writes[1].senior_spheres, [])
      assert.equal(writes[1].is_senior, false)
      assert.deepEqual([...writes[1].spheres].sort(), ['defense', 'justice'])
      reject = true
      await open()
      await choose('Старший следящий')
      await save()
      await expect(page.getByRole('alert')).toContainText('Этот ник уже занят')
      await expect(defense).toContainText('Старший следящий')
      await expect(justice).toContainText('Следящий')
      await expect(page.locator('#staff-nickname')).toHaveValue('Bob_Burmalda')
      await page.screenshot({ path: resolve(output, `staff-spheres-${width}.png`), fullPage: true })
      assert.deepEqual(errors, [])
      assert.equal(writes.length, 3)
      console.log(`${width}px: senior MO + ordinary MJU; senior removal; error preserves draft. Writes mocked.`)
    } finally { await context.close() }
  }
} finally { await browser.close() }
