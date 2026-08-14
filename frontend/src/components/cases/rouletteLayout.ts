import type { LootCasePrize } from '../../api'

export const CARD_WIDTH = 140
export const CARD_GAP = 12
export const CARD_STRIDE = CARD_WIDTH + CARD_GAP

export const STRIP_COPIES_DEFAULT = 40
export const SPIN_TARGET_COPY = 28
export const SPIN_MIN_LAPS = 8
export const SPIN_MAX_LAPS = 13

export const DEFAULT_SPIN_DURATION_MS = 12000
export const MIN_SPIN_DURATION_MS = 3000
export const MAX_SPIN_DURATION_MS = 30000
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

/** Полный план прокрутки: старт/финиш, длина ленты, длительность */
export function buildSpinPlan(
  viewportWidth: number,
  prizes: LootCasePrize[],
  winnerId: number,
  spinDurationMs = DEFAULT_SPIN_DURATION_MS,
): SpinPlan {
  const prizeCount = Math.max(prizes.length, 1)
  const winnerIdx = Math.max(0, prizes.findIndex((p) => p.id === winnerId))
  const lapCount = SPIN_MIN_LAPS + Math.floor(Math.random() * (SPIN_MAX_LAPS - SPIN_MIN_LAPS + 1))
  const winnerStripIndex = SPIN_TARGET_COPY * prizeCount + winnerIdx
  const endX = translateForCenter(viewportWidth, winnerStripIndex)
  const startX = endX - lapCount * prizeCount * CARD_STRIDE
  const stripCopies = requiredStripCopies(viewportWidth, startX, winnerStripIndex, prizeCount, lapCount)
  const durationMs = Math.min(MAX_SPIN_DURATION_MS, Math.max(MIN_SPIN_DURATION_MS, spinDurationMs))

  return { startX, endX, winnerStripIndex, stripCopies, lapCount, durationMs }
}

export function buildStrip(prizes: LootCasePrize[], copies = STRIP_COPIES_DEFAULT): LootCasePrize[] {
  if (prizes.length === 0) return []
  return Array.from({ length: copies }, () => prizes).flat()
}

/** Стартовая позиция до первого спина — показываем середину ленты по центру */
export function computeIdleOffset(viewportWidth: number, prizeCount: number): number {
  if (prizeCount <= 0) return 0
  const idleCopy = 3
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
  const durationMs = Math.min(MAX_SPIN_DURATION_MS, Math.max(MIN_SPIN_DURATION_MS, spinDurationMs))
  return durationMs + RESULT_REVEAL_MS
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
