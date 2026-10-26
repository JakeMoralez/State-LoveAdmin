import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const runtime = process.env.PLAYWRIGHT_PATH || 'C:/Users/aAdmin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
const { chromium } = require(runtime)
const { expect } = require(`${runtime}/test`)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173' })
try {
  assert.ok((await context.request.post('/api/auth/dev-login', { data: { access_level: 11, spheres: ['server'] } })).ok())
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.addInitScript(() => {
    window.AudioContext = class { constructor() { throw new Error('Test audio unavailable') } }
  })
  let size = 2, spins = 0, duration = 14000
  const prizes = () => Array.from({ length: size }, (_, i) => ({ id: i + 1, case_id: 999, title: `Приз ${i + 1}`, image_url: '', weight: 1, sort_order: i, rarity_label: '' }))
  await page.route('**/api/dev/cases/999', route => route.fulfill({ json: { id: 999, title: 'Проверка движения', prizes: prizes(), can_spin: true, spin_duration_ms: duration } }))
  await page.route('**/api/dev/cases/999/spin', route => {
    spins++
    return route.fulfill({ json: { spin_token: 'test-only', spin_duration_ms: duration, prize: prizes().at(-1), prizes: prizes() } })
  })
  const centered = async () => {
    await expect(page.locator('.case-roulette')).toHaveAttribute('data-phase', 'done', { timeout: 20000 })
    await expect(page.locator('.case-roulette-result-title')).toHaveText(`Приз ${size}`)
    const delta = await page.locator('.case-prize-card--winner').evaluate(card => {
      const box = card.getBoundingClientRect(), viewport = card.closest('.case-roulette-viewport').getBoundingClientRect()
      return Math.abs(box.left + box.width / 2 - viewport.left - viewport.width / 2)
    })
    assert.ok(delta <= 1, `Winner off center: ${delta}px`)
    assert.ok(await page.locator('.case-roulette-strip .case-prize-card').count() <= 22)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/dev/cases/999/spin')
  await expect(page.getByRole('button', { name: 'Крутить', exact: true })).toBeEnabled()
  await page.clock.install()
  await page.getByRole('button', { name: 'Крутить', exact: true }).click()
  await expect(page.locator('.case-roulette')).toHaveAttribute('data-phase', /accelerating|cruise/)
  await page.clock.runFor(2000)
  const before = await page.locator('.case-prize-card').first().getAttribute('style')
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')) })
  await page.clock.runFor(8000)
  assert.equal(await page.locator('.case-prize-card').first().getAttribute('style'), before)
  await page.setViewportSize({ width: 768, height: 1000 })
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')) })
  await page.clock.runFor(13000)
  await centered()
  console.log('14s spin, resize, hidden pause and rejected audio passed')
  // A second run starts from the displayed strip, with a larger server prize pool.
  size = 96; duration = 3000
  await page.getByRole('button', { name: 'Крутить ещё', exact: true }).click()
  await expect(page.locator('.case-roulette')).toHaveAttribute('data-phase', /accelerating|cruise/)
  await page.clock.runFor(3500)
  await centered()
  assert.equal(spins, 2)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 900 })
  await page.getByRole('button', { name: 'Крутить ещё', exact: true }).click()
  await centered()
  assert.equal(spins, 3)
  assert.deepEqual(errors, [])
  console.log('Repeat run, 96 prizes, reduced motion and exact server winner passed; no real awards created')
} finally {
  await context.close(); await browser.close()
}
