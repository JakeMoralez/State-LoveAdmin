import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import ts from 'typescript'

const cache = new Map()
async function moduleUrl(path) {
  path = resolve(path)
  if (cache.has(path)) return cache.get(path)
  let source = ts.transpileModule(await readFile(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  for (const match of [...source.matchAll(/from ['"](.+?)['"]/g)]) {
    if (match[1].startsWith('.')) source = source.replace(match[0], `from '${await moduleUrl(resolve(dirname(path), match[1] + '.ts'))}'`)
  }
  const url = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
  cache.set(path, url)
  return url
}
const engine = await import(await moduleUrl('src/components/cases/spinEngine.ts'))
const layout = await import(await moduleUrl('src/components/cases/rouletteLayout.ts'))
const { markdownExcerpt } = await import(await moduleUrl('src/lib/markdownExcerpt.ts'))
const { activityValue, activityChanges } = await import(await moduleUrl('src/lib/activityPresentation.ts'))
for (const duration of [3000, 12000, 14000, 20000, 28000, 45000]) {
  const p = engine.spinEaseProfile(duration)
  assert.equal(p.acceleration + p.cruise + p.braking, duration / 1000)
  let previous = -1
  for (let i = 0; i <= 10000; i++) {
    const position = engine.spinEase(i / 10000, duration)
    assert.ok(position >= previous && position >= 0 && position <= 1)
    previous = position
  }
  for (const boundary of [p.accelEnd, p.cruiseEnd]) {
    const epsilon = 1e-6
    const before = (engine.spinEase(boundary, duration) - engine.spinEase(boundary - epsilon, duration)) / epsilon
    const after = (engine.spinEase(boundary + epsilon, duration) - engine.spinEase(boundary, duration)) / epsilon
    assert.ok(Math.abs(before - after) < .001, 'Velocity must be continuous at phase boundaries')
  }
  assert.equal(layout.resolveSpinDurationMs(duration), duration)
}
assert.deepEqual([engine.spinEaseProfile(14000).acceleration, engine.spinEaseProfile(14000).cruise, engine.spinEaseProfile(14000).braking], [.8, 9.2, 4])
for (const size of [2, 20, 96, 5000]) {
  const prizes = Array.from({ length: size }, (_, i) => ({ id: i + 1, weight: i % 20 + 1 }))
  const previous = layout.createVisualStrip(prizes, 66, () => .4)
  for (const width of [280, 768, 1440]) {
    const x = layout.translateForCenter(width, 8)
    const plan = layout.buildSpinPlan(width, prizes, size, 14000, previous, x)
    assert.equal(plan.strip[plan.winnerStripIndex].id, size)
    assert.ok(Math.abs(plan.endX + layout.cardCenterX(plan.winnerStripIndex) - width / 2) < 1e-9)
    assert.ok(Math.abs((plan.startX - plan.endX) / layout.CARD_STRIDE / engine.spinEaseProfile(14000).effectiveSeconds - 9) < .05)
    assert.ok(plan.strip.length < 200, 'Visual strip must not grow with prize count')
    const first = Math.max(0, layout.visibleStripIndexRange(x, width).min - 3)
    assert.deepEqual(plan.strip.slice(0, 22), previous.slice(first, first + 22))
    for (let i = 0; i <= 1000; i++) {
      const frame = plan.startX + (plan.endX - plan.startX) * engine.spinEase(i / 1000, 14000)
      const start = layout.stripWindowFrom(frame, width, plan.strip.length)
      const visible = layout.visibleStripIndexRange(frame, width)
      assert.ok(visible.min >= start && visible.max < start + 22)
    }
  }
}
let clock = 0, nextId = 0, callbacks = new Map(), frames = [], completed = 0
const document = new EventTarget(); document.hidden = false
globalThis.document = document
Object.defineProperty(globalThis, 'performance', { value: { now: () => clock }, configurable: true })
globalThis.requestAnimationFrame = callback => { callbacks.set(++nextId, callback); return nextId }
globalThis.cancelAnimationFrame = id => callbacks.delete(id)
const advance = ms => { clock += ms; const batch = [...callbacks.values()]; callbacks.clear(); batch.forEach(fn => fn(clock)) }
engine.runSpinAnimator({ startX: 0, endX: -100, durationMs: 1000, onFrame: (t, x) => frames.push([t, x]), onComplete: () => completed++ })
advance(400)
document.hidden = true; document.dispatchEvent(new Event('visibilitychange')); advance(10000)
assert.equal(frames.at(-1)[0], .4)
document.hidden = false; document.dispatchEvent(new Event('visibilitychange')); advance(600)
assert.deepEqual(frames.at(-1), [1, -100]); assert.equal(completed, 1)
const cancel = engine.runSpinAnimator({ startX: 0, endX: -100, durationMs: 1000, onComplete: () => completed++ })
cancel(); advance(1000); assert.equal(completed, 1)
for (const marker of ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION', 'INFO', 'DANGER']) {
  const text = markdownExcerpt(`Глава 1. > [!${marker}] Содержимое заметки`)
  assert.ok(!text.includes('[!')); assert.ok(text.includes('Содержимое заметки'))
}
assert.equal(activityValue('access_level', 2, 'Историческая должность'), 'Историческая должность')
assert.ok(!activityValue('spheres', ['central_apparatus']).includes('central_apparatus'))
assert.equal(activityValue('has_ca_access', false), 'Нет доступа')
assert.equal(activityValue('nickname', null), 'Не сохранено')
assert.equal(activityChanges({ access_level: { from: 8, to: 2 }, reason: 'Перевод' }).length, 1)
console.log('Motion, bounded rendering, server winner, pause/cancel, excerpts and journal formatting passed')
