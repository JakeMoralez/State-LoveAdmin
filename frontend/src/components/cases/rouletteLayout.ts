import type { LootCasePrize } from '../../api'
import { spinEaseProfile } from './spinEngine'

export const CARD_WIDTH = 140
export const CARD_GAP = 12
export const CARD_STRIDE = CARD_WIDTH + CARD_GAP
export const STRIP_WINDOW_CARDS = 22
export const DEFAULT_SPIN_DURATION_MS = 14000
export const MIN_SPIN_DURATION_MS = 3000
export const MAX_SPIN_DURATION_MS = 45000
export const RESULT_REVEAL_MS = 250
export function resolveSpinDurationMs(value?: number | null) {
  return Math.max(MIN_SPIN_DURATION_MS, Math.min(MAX_SPIN_DURATION_MS, value ?? DEFAULT_SPIN_DURATION_MS))
}
export function cardCenterX(index: number) { return index * CARD_STRIDE + CARD_WIDTH / 2 }
export function translateForCenter(width: number, index: number) { return width / 2 - cardCenterX(index) }
export function visibleStripIndexRange(x: number, width: number) {
  const min = Math.max(0, Math.ceil((-x - CARD_WIDTH) / CARD_STRIDE))
  return { min, max: Math.max(min, Math.floor((width - x) / CARD_STRIDE)) }
}
export function stripWindowFrom(x: number, width: number, length: number, current = 0) {
  if (length <= STRIP_WINDOW_CARDS) return 0
  const { min, max } = visibleStripIndexRange(x, width)
  if (min >= current + 3 && max <= current + STRIP_WINDOW_CARDS - 4) return current
  return Math.max(0, Math.min(min - 5, length - STRIP_WINDOW_CARDS))
}
/** Bounded visual sampling only; the API remains the sole winner selector. */
export function createVisualStrip(prizes: LootCasePrize[], count: number, random = Math.random): LootCasePrize[] {
  if (!prizes.length) return []
  let total = 0
  const cdf = prizes.map(prize => { total += Math.max(1, Math.min(80, Math.floor(prize.weight || 1))); return total })
  return Array.from({ length: count }, () => {
    const pick = random() * total
    let low = 0, high = cdf.length - 1
    while (low < high) { const mid = (low + high) >>> 1; if (pick < cdf[mid]) high = mid; else low = mid + 1 }
    return prizes[low]
  })
}
export interface SpinPlan { startX: number; endX: number; winnerStripIndex: number; durationMs: number; strip: LootCasePrize[] }
export function buildSpinPlan(width: number, prizes: LootCasePrize[], winnerId: number, duration = DEFAULT_SPIN_DURATION_MS,
  previousStrip: LootCasePrize[] = [], previousX = 0): SpinPlan {
  const winner = prizes.find(prize => prize.id === winnerId)
  if (!winner) throw new Error('Серверный приз отсутствует в ответе')
  const durationMs = resolveSpinDurationMs(duration)
  const first = Math.max(0, visibleStripIndexRange(previousX, width).min - 3)
  const startX = previousX + first * CARD_STRIDE
  const desiredDistance = 9 * CARD_STRIDE * spinEaseProfile(durationMs).effectiveSeconds
  const winnerStripIndex = Math.round((width / 2 - CARD_WIDTH / 2 - startX + desiredDistance) / CARD_STRIDE)
  const strip = createVisualStrip(prizes, winnerStripIndex + STRIP_WINDOW_CARDS * 2)
  previousStrip.slice(first, first + STRIP_WINDOW_CARDS).forEach((prize, index) => { strip[index] = prize })
  strip[winnerStripIndex] = winner
  return { startX, endX: translateForCenter(width, winnerStripIndex), winnerStripIndex, durationMs, strip }
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
