import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const runtime = process.env.PLAYWRIGHT_PATH || 'C:/Users/aAdmin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
const { chromium } = require(runtime), { expect } = require(`${runtime}/test`)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173' })
const output = resolve('../data/interface-check')
const SECRET = 'test-only-browser-key-never-persisted'
try {
  const page = await context.newPage(), errors = []
  page.on('pageerror', e => errors.push(e.message))
  const login = async level => {
    const response = await context.request.post('/api/auth/dev-login', { data: { access_level: level, spheres: level >= 8 ? ['server'] : level === 1 ? ['central_apparatus'] : ['gov_structures'] } })
    assert.equal(response.status(), 200)
  }
  await login(11)
  let state = await (await context.request.get('/api/forum/list')).json()
  assert.ok(state.fetched_at && state.result?.rendered)
  state = structuredClone(state); state.refresh_status = 'idle'
  let conflict = false, failedKey = false, saved = 0, configured = true
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname, method = request.method()
    if (path === '/api/dev/errors') return route.fulfill({ status: 204, body: '' })
    if (path === '/api/forum/list' && method === 'GET') return route.fulfill({ json: state })
    if (path === '/api/forum/list/render') {
      const template = request.postDataJSON().template
      return route.fulfill({ json: template?.includes('{{unknown}}') ? { rendered: null, errors: ['{{unknown}}'], warnings: [] } : { rendered: template || state.result.rendered, errors: [], warnings: [] } })
    }
    if (path === '/api/forum/list/settings' && method === 'PUT') {
      const body = request.postDataJSON(); saved++
      if (conflict) {
        conflict = false
        state.settings.version++
        return route.fulfill({ status: 409, json: { detail: 'Шаблон уже изменён другим сотрудником. Черновик сохранён.' } })
      }
      state.settings = { ...state.settings, version: state.settings.version + 1, template: body.reset ? state.default_template : body.template, mappings: body.reset ? {} : body.mappings }
      return route.fulfill({ json: state })
    }
    if (path === '/api/forum/list/import') return route.fulfill({ json: { template: '{{fraction.1.deputies.1.nickname}}', errors: [], conversions: [{ from: 'PLACEHOLDER_DEPUTY_LSPD_NICK', to: ['{{fraction.1.deputies.1.nickname}}'] }] } })
    if (path === '/api/forum/list/refresh') return route.fulfill({ status: 202, json: state })
    if (path === '/api/dev/forum-list-key') {
      if (method === 'GET') return route.fulfill({ json: { configured, external_server_id: configured ? 30 : null } })
      if (method === 'PUT') {
        assert.equal(request.postDataJSON().key, SECRET)
        if (!failedKey) { failedKey = true; return route.fulfill({ status: 500, json: { detail: 'Не удалось сохранить серверную конфигурацию. Прежний ключ сохранён.' } }) }
        configured = true
        return route.fulfill({ json: { configured: true, external_server_id: 30 } })
      }
      if (method === 'DELETE') { configured = false; return route.fulfill({ json: { configured: false, external_server_id: null } }) }
    }
    if (!['GET', 'HEAD'].includes(method) && !path.startsWith('/api/auth/')) throw Error(`Unexpected mutation: ${method} ${path}`)
    return route.continue()
  })
  await page.goto('/forum/list')
  await expect(page.getByRole('textbox', { name: 'Готовый BBCode', exact: true })).not.toHaveValue('')
  await expect(page.getByRole('link', { name: 'Форумный список', exact: true })).toBeVisible()
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    await page.screenshot({ path: resolve(output, `forum-list-${width}.png`), fullPage: true })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('tab', { name: 'Редактор', exact: true }).click()
  const editor = page.getByRole('textbox', { name: 'BBCode-шаблон', exact: true })
  await editor.fill('{{fraction.1.leaders.1.nickname}}')
  await editor.focus(); await editor.press('End')
  await page.getByRole('button', { name: 'Вставить', exact: true }).click()
  await expect(editor).toHaveValue('{{fraction.1.leaders.1.nickname}}{{fraction.1.leaders.1.nickname}}')
  await page.getByRole('tab', { name: 'Плейсхолдеры', exact: true }).click()
  await page.getByRole('combobox', { name: 'Источник данных' }).click()
  await page.getByRole('option', { name: 'Администрация', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Группа администрации' })).toBeVisible()
  await page.getByRole('combobox', { name: 'Поле данных' }).click()
  await expect(page.getByRole('option', { name: 'Ссылка VK', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: /Редактор/ }).click()
  await expect(editor).toHaveValue('{{fraction.1.leaders.1.nickname}}{{fraction.1.leaders.1.nickname}}')
  page.once('dialog', d => d.dismiss())
  await page.getByRole('link', { name: 'Задачи', exact: true }).click()
  await expect(page).toHaveURL(/forum\/list/)
  conflict = true
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Шаблон уже изменён')
  await expect(editor).not.toHaveValue(state.settings.template)
  await page.getByRole('button', { name: 'Повторить загрузку' }).click()
  page.once('dialog', d => d.accept())
  await page.getByRole('button', { name: 'Загрузить актуальную' }).click()
  await expect(editor).toHaveValue(state.settings.template)
  await page.getByText('Импорт шаблона из расширения', { exact: true }).click()
  await page.getByRole('textbox', { name: 'Старый шаблон', exact: true }).fill('PLACEHOLDER_DEPUTY_LSPD_NICK')
  await page.getByRole('button', { name: 'Преобразовать', exact: true }).click()
  await page.getByRole('button', { name: 'Перенести в редактор', exact: true }).click()
  await expect(editor).toHaveValue('{{fraction.1.deputies.1.nickname}}')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByText('Общий шаблон сохранён', { exact: true })).toBeVisible()
  page.once('dialog', d => d.accept())
  await page.getByRole('button', { name: 'Сбросить шаблон', exact: true }).click()
  await expect(editor).toHaveValue(state.default_template)
  await editor.fill('{{unknown}}')
  await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Скопировать BBCode' })).toBeDisabled()
  await page.getByRole('tab', { name: /Редактор/ }).click()
  page.once('dialog', d => d.accept())
  await page.getByRole('button', { name: 'Сбросить шаблон', exact: true }).click()
  await page.goto('/dev/settings?tab=integrations')
  const key = page.getByLabel('Новый API-ключ r-arrow.ru', { exact: true })
  await expect(key).toHaveValue('')
  await key.fill(SECRET)
  await page.getByRole('button', { name: 'Проверить и сохранить ключ' }).click()
  await expect(page.getByRole('alert')).toContainText('Прежний ключ сохранён')
  await expect(key).toHaveValue(SECRET)
  const storage = await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }))
  assert.ok(!storage.includes(SECRET))
  await page.getByRole('button', { name: 'Проверить и сохранить ключ' }).click()
  await expect(key).toHaveValue('')
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    await page.screenshot({ path: resolve(output, `forum-key-settings-${width}.png`), fullPage: true })
  }
  page.once('dialog', d => d.accept())
  await page.getByRole('button', { name: 'Отключить API', exact: true }).click()
  await expect(page.getByText('Подключение отключено', { exact: true })).toBeVisible()
  await login(7)
  await page.goto('/forum/list')
  await expect(page.getByRole('tab', { name: 'Редактор', exact: true })).toBeVisible()
  await login(1)
  await page.goto('/forum/list')
  await expect(page.getByRole('textbox', { name: 'Готовый BBCode', exact: true })).not.toHaveValue('')
  await expect(page.getByRole('tab', { name: 'Редактор', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Список судей', exact: true })).toHaveCount(0)
  assert.ok(saved >= 3)
  assert.deepEqual(errors, [])
  console.log('Forum list: 3 widths, picker, draft guard, conflict, import, reset, invalid tokens, 1+/7+ and write-only key settings passed. No real template/key settings changed.')
} finally { await context.close(); await browser.close() }
