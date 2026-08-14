import type { LootCasePrize } from '../../api'

export const CARD_WIDTH = 140
export const CARD_GAP = 12
export const CARD_STRIDE = CARD_WIDTH + CARD_GAP
/** Сколько карточек держим в DOM — длинная лента плющит GPU-слой. */
export const STRIP_WINDOW_CARDS = 22

export function roundPx(x: number): number {
  return Math.round(x)
}

export function stripPixelWidth(cardCount: number): number {
  if (cardCount <= 0) return 0
  return cardCount * CARD_STRIDE - CARD_GAP
}

export function stripWindowFrom(
  translateX: number,
  viewportWidth: number,
  stripLength: number,
  currentFrom = 0,
): number {
  if (stripLength <= STRIP_WINDOW_CARDS) return 0
  const { min, max } = visibleStripIndexRange(translateX, viewportWidth)
  const windowTo = currentFrom + STRIP_WINDOW_CARDS - 1
  if (min >= currentFrom + 3 && max <= windowTo - 3) return currentFrom
  const visible = Math.max(1, max - min + 1)
  const pad = Math.max(4, Math.ceil((STRIP_WINDOW_CARDS - visible) / 2))
  const from = min - pad
  return Math.max(0, Math.min(from, stripLength - STRIP_WINDOW_CARDS))
}

export function windowedTranslateX(worldX: number, from: number): number {
  return worldX + from * CARD_STRIDE
}

export const STRIP_COPIES_DEFAULT = 40
export const SPIN_TARGET_COPY = 28
export const SPIN_MIN_LAPS = 8
export const SPIN_MAX_LAPS = 13
export const MAX_VISUAL_COPIES = 80
/** Максимум карточек в одном круге ленты (веса масштабируются, если сумма больше). */
export const MAX_CYCLE_LENGTH = 96
/** Потолок DOM-узлов ленты, чтобы старт спина не рендерился пустым кадром. */
export const MAX_STRIP_CARDS = 720

export const DEFAULT_SPIN_DURATION_MS = 28000
export const LEGACY_SPIN_DURATION_MS = 12000
export const LEGACY_SPIN_DURATION_MS_V2 = 20000
export const MIN_SPIN_DURATION_MS = 3000
export const MAX_SPIN_DURATION_MS = 45000
export const RESULT_REVEAL_MS = 350

/** Центр карточки `stripIndex` в координатах ленты (px) */
export function cardCenterX(stripIndex: number): number {
  return stripIndex * CARD_STRIDE + CARD_WIDTH / 2
}

/** translateX, при котором центр карточки совпадает с центром viewport */
export function translateForCenter(viewportWidth: number, stripIndex: number): number {
  return viewportWidth / 2 - cardCenterX(stripIndex)
}

/** Индексы карточек, пересекающих viewport при данном translateX */
export function visibleStripIndexRange(translateX: number, viewportWidth: number): { min: number; max: number } {
  const min = Math.max(0, Math.ceil((-translateX - CARD_WIDTH) / CARD_STRIDE))
  const max = Math.floor((viewportWidth - translateX - CARD_WIDTH) / CARD_STRIDE)
  return { min, max: Math.max(min, max) }
}

/** Сколько копий призов нужно, чтобы на startX и на winner не было «дыр» */
export function requiredStripCopies(
  viewportWidth: number,
  startX: number,
  winnerStripIndex: number,
  prizeCount: number,
  lapCount: number,
): number {
  const { max: maxVisibleAtStart } = visibleStripIndexRange(startX, viewportWidth)
  const minForStart = Math.ceil((maxVisibleAtStart + 2) / prizeCount)
  const minForWinner = Math.ceil((winnerStripIndex + 3) / prizeCount)
  const minForTarget = SPIN_TARGET_COPY + lapCount + 2
  return Math.max(STRIP_COPIES_DEFAULT, minForStart, minForWinner, minForTarget)
}

export interface SpinPlan {
  startX: number
  endX: number
  winnerStripIndex: number
  stripCopies: number
  lapCount: number
  durationMs: number
}

function scaleCopyCounts(counts: number[], targetTotal: number): number[] {
  const n = counts.length
  if (n === 0) return counts
  const total = counts.reduce((a, b) => a + b, 0)
  if (total <= targetTotal) return counts
  const raw = counts.map((c) => (c / total) * targetTotal)
  const next = raw.map((x) => Math.max(1, Math.floor(x)))
  let used = next.reduce((a, b) => a + b, 0)
  const order = raw
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac)
  let k = 0
  while (used < targetTotal) {
    next[order[k % order.length].i] += 1
    used += 1
    k += 1
  }
  while (used > targetTotal) {
    const idx = next.findIndex((c) => c > 1)
    if (idx < 0) break
    next[idx] -= 1
    used -= 1
  }
  return next
}

function rarityRank(label: string): number {
  const key = normalizeRarity(label)
  if (key === 'legendary') return 4
  if (key === 'epic') return 3
  if (key === 'rare') return 2
  if (key === 'uncommon') return 1
  return 0
}

function placeIntoEmpty(
  slots: Array<LootCasePrize | null>,
  prize: LootCasePrize,
  count: number,
  phase: number,
) {
  const empty: number[] = []
  for (let i = 0; i < slots.length; i++) {
    if (slots[i] == null) empty.push(i)
  }
  const n = empty.length
  const use = Math.min(count, n)
  if (use <= 0) return

  const taken = new Set<number>()
  for (let k = 0; k < use; k++) {
    const t = (k + 0.5 + phase) / use
    const start = Math.floor((t % 1) * n)
    for (let step = 0; step < n; step++) {
      const ei = (start + step) % n
      if (taken.has(ei)) continue
      taken.add(ei)
      slots[empty[ei]] = prize
      break
    }
  }
}

/** Развести одинаковые призы и высокие редкости, чтобы не было пластов. */
function unclumpCycle(cycle: LootCasePrize[]): LootCasePrize[] {
  const arr = cycle.slice()
  const n = arr.length
  if (n < 3) return arr

  const rankOf = (i: number) => rarityRank(arr[i].rarity_label)

  for (let i = 0; i < n; i++) {
    const a = i
    const b = (i + 1) % n
    const samePrize = arr[a].id === arr[b].id
    const highRarityClump = rankOf(a) >= 3 && rankOf(a) === rankOf(b)
    if (!samePrize && !highRarityClump) continue

    for (let step = 2; step < n - 1; step++) {
      const j = (i + step) % n
      if (arr[j].id === arr[a].id) continue
      if (highRarityClump && rankOf(j) === rankOf(a)) continue
      const jPrev = (j - 1 + n) % n
      if (arr[j].id === arr[jPrev].id) continue
      const tmp = arr[b]
      arr[b] = arr[j]
      arr[j] = tmp
      break
    }
  }
  return arr
}

/** Копии по весу, слоты перемешаны по редкости: легендарки редко и врозь, обычные заполняют промежутки. */
export function expandPrizeCycle(prizes: LootCasePrize[]): LootCasePrize[] {
  if (prizes.length === 0) return []
  const counts = scaleCopyCounts(
    prizes.map((prize) => Math.max(1, Math.min(MAX_VISUAL_COPIES, Math.floor(prize.weight || 1)))),
    MAX_CYCLE_LENGTH,
  )
  const total = counts.reduce((a, b) => a + b, 0)
  const slots: Array<LootCasePrize | null> = Array.from({ length: total }, () => null)

  const items = prizes
    .map((prize, i) => ({
      prize,
      count: counts[i],
      rank: rarityRank(prize.rarity_label),
    }))
    .filter((item) => item.count > 0)
    .sort(
      (a, b) =>
        b.rank - a.rank ||
        a.count - b.count ||
        a.prize.sort_order - b.prize.sort_order ||
        a.prize.id - b.prize.id,
    )

  items.forEach((item, index) => {
    const phase = ((item.prize.id * 0.37 + item.prize.sort_order * 0.19 + index * 0.11) % 1)
    placeIntoEmpty(slots, item.prize, item.count, phase)
  })

  const cycle = slots.map((slot, i) => slot ?? prizes[i % prizes.length])
  return unclumpCycle(cycle)
}

export function idleStripCopies(cycleLength: number): number {
  return Math.max(4, Math.min(8, Math.floor(MAX_STRIP_CARDS / Math.max(cycleLength, 1))))
}

function spinStripGeometry(cycleLength: number): { copies: number; lapCount: number; targetCopy: number } {
  const n = Math.max(cycleLength, 1)
  const copies = Math.max(6, Math.min(STRIP_COPIES_DEFAULT, Math.floor(MAX_STRIP_CARDS / n)))
  const lapCount = Math.min(SPIN_MAX_LAPS, Math.max(3, copies - 4))
  const targetCopy = Math.max(1, Math.min(SPIN_TARGET_COPY, copies - lapCount - 2))
  return { copies, lapCount, targetCopy }
}

/** Полный план прокрутки: старт/финиш, длина ленты, длительность */
export function buildSpinPlan(
  viewportWidth: number,
  prizes: LootCasePrize[],
  winnerId: number,
  spinDurationMs = DEFAULT_SPIN_DURATION_MS,
): SpinPlan {
  const cycle = expandPrizeCycle(prizes)
  const prizeCount = Math.max(cycle.length, 1)
  const slots = cycle.map((p, i) => (p.id === winnerId ? i : -1)).filter((i) => i >= 0)
  const winnerIdx = slots.length ? slots[Math.floor(Math.random() * slots.length)] : 0
  const { copies, lapCount, targetCopy } = spinStripGeometry(prizeCount)
  const durationMs = resolveSpinDurationMs(spinDurationMs)
  const peakEase = 1.3
  const maxPxPerSec = 22 * 60
  const maxDist = (maxPxPerSec * durationMs) / 1000 / peakEase
  const maxLaps = Math.max(3, Math.floor(maxDist / (prizeCount * CARD_STRIDE)))
  const laps = Math.min(lapCount, maxLaps)
  const winnerStripIndex = targetCopy * prizeCount + winnerIdx
  const endX = translateForCenter(viewportWidth, winnerStripIndex)
  const startX = endX - laps * prizeCount * CARD_STRIDE
  const { max: maxVisibleAtStart } = visibleStripIndexRange(startX, viewportWidth)
  const stripCopies = Math.max(
    copies,
    Math.ceil((maxVisibleAtStart + 4) / prizeCount),
    Math.ceil((winnerStripIndex + 4) / prizeCount),
  )

  return { startX, endX, winnerStripIndex, stripCopies, lapCount: laps, durationMs }
}

export function buildStrip(prizes: LootCasePrize[], copies?: number): LootCasePrize[] {
  const cycle = expandPrizeCycle(prizes)
  if (cycle.length === 0) return []
  const n = copies ?? idleStripCopies(cycle.length)
  return Array.from({ length: n }, () => cycle).flat()
}

/** Стартовая позиция до первого спина — показываем середину ленты по центру */
export function computeIdleOffset(viewportWidth: number, prizeCount: number, stripCopies = 4): number {
  if (prizeCount <= 0) return 0
  const idleCopy = Math.min(2, Math.max(0, stripCopies - 2))
  const stripIndex = idleCopy * prizeCount + Math.floor(prizeCount / 2)
  return translateForCenter(viewportWidth, stripIndex)
}

/** @deprecated используйте buildSpinPlan */
export function findWinnerStripIndex(prizes: LootCasePrize[], winnerId: number): number {
  const idx = prizes.findIndex((p) => p.id === winnerId)
  if (idx < 0) return SPIN_TARGET_COPY * prizes.length
  return SPIN_TARGET_COPY * prizes.length + idx
}

/** @deprecated используйте buildSpinPlan */
export function computeSpinOffsets(
  viewportWidth: number,
  stripIndex: number,
  prizeCount: number,
): { startX: number; endX: number } {
  const endX = translateForCenter(viewportWidth, stripIndex)
  const extraLaps = 10 + Math.floor(Math.random() * 5)
  const startX = endX - extraLaps * prizeCount * CARD_STRIDE
  return { startX, endX }
}

export function spinTotalDurationMs(spinDurationMs = DEFAULT_SPIN_DURATION_MS): number {
  const durationMs = resolveSpinDurationMs(spinDurationMs)
  return durationMs + RESULT_REVEAL_MS
}

export function resolveSpinDurationMs(value?: number | null): number {
  const ms = value ?? DEFAULT_SPIN_DURATION_MS
  if (ms === LEGACY_SPIN_DURATION_MS || ms === LEGACY_SPIN_DURATION_MS_V2) return DEFAULT_SPIN_DURATION_MS
  return Math.min(MAX_SPIN_DURATION_MS, Math.max(MIN_SPIN_DURATION_MS, ms))
}

export function rarityClass(label: string): string {
  const key = label.trim().toLowerCase()
  if (!key) return 'case-prize-card--default'
  if (key.includes('legend') || key.includes('легенд')) return 'case-prize-card--legendary'
  if (key.includes('epic') || key.includes('эпич')) return 'case-prize-card--epic'
  if (key.includes('rare') || key.includes('редк')) return 'case-prize-card--rare'
  if (key.includes('uncommon') || key.includes('необыч')) return 'case-prize-card--uncommon'
  if (key.includes('common') || key.includes('обыч')) return 'case-prize-card--default'
  return 'case-prize-card--default'
}

export const RARITY_OPTIONS = [
  { value: '', label: 'Обычный', className: 'case-prize-card--default' },
  { value: 'uncommon', label: 'Необычный', className: 'case-prize-card--uncommon' },
  { value: 'rare', label: 'Редкий', className: 'case-prize-card--rare' },
  { value: 'epic', label: 'Эпический', className: 'case-prize-card--epic' },
  { value: 'legendary', label: 'Легендарный', className: 'case-prize-card--legendary' },
] as const

/** Относительный шанс редкости. Затем внутри редкости — по количеству в ленте (weight). */
export const RARITY_DROP_WEIGHT: Record<string, number> = {
  '': 50,
  uncommon: 25,
  rare: 12,
  epic: 5,
  legendary: 2,
}

function prizeCopies(prize: { weight?: number }): number {
  const w = Math.floor(Number(prize.weight) || 1)
  return Number.isFinite(w) && w >= 1 ? w : 1
}

export function dropChanceRatio(
  prize: { rarity_label: string; weight?: number },
  prizes: { rarity_label: string; weight?: number }[],
): number {
  if (prizes.length === 0) return 0
  const copiesByRarity = new Map<string, number>()
  for (const item of prizes) {
    const rarity = normalizeRarity(item.rarity_label)
    copiesByRarity.set(rarity, (copiesByRarity.get(rarity) ?? 0) + prizeCopies(item))
  }
  let rarityTotal = 0
  for (const rarity of copiesByRarity.keys()) {
    rarityTotal += RARITY_DROP_WEIGHT[rarity] ?? RARITY_DROP_WEIGHT['']
  }
  if (rarityTotal <= 0) return 1 / prizes.length
  const rarity = normalizeRarity(prize.rarity_label)
  const rarityShare = (RARITY_DROP_WEIGHT[rarity] ?? RARITY_DROP_WEIGHT['']) / rarityTotal
  const rarityCopies = copiesByRarity.get(rarity) ?? 1
  return rarityShare * (prizeCopies(prize) / rarityCopies)
}

export function formatDropChance(ratio: number): string {
  const pct = ratio * 100
  if (pct <= 0) return '0%'
  if (pct < 0.1) return '<0.1%'
  if (pct < 10) return `${pct.toFixed(1).replace('.', ',')}%`
  return `${Math.round(pct)}%`
}

export function normalizeRarity(value: string): string {
  const key = value.trim().toLowerCase()
  if (!key || key === 'common' || key.includes('обыч')) return ''
  const exact = RARITY_OPTIONS.find((o) => o.value === key)
  if (exact) return exact.value
  if (key.includes('legend') || key.includes('легенд')) return 'legendary'
  if (key.includes('epic') || key.includes('эпич')) return 'epic'
  if (key.includes('rare') || key.includes('редк')) return 'rare'
  if (key.includes('uncommon') || key.includes('необыч')) return 'uncommon'
  return key
}

export function rarityLabel(value: string): string {
  const normalized = normalizeRarity(value)
  const exact = RARITY_OPTIONS.find((o) => o.value === normalized)
  if (exact) return exact.label
  if (!normalized) return 'Обычный'
  return value
}
