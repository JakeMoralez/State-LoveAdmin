import { JUDGE_POSITIONS } from './judgePositions'

export const LEADER_POSITIONS = ['Лидер', 'Заместитель', 'Министр', 'Советник'] as const

export const CONGRESS_POSITIONS = ['Спикер конгресса', 'Вице-спикер конгресса'] as const

export type LeaderPosition = (typeof LEADER_POSITIONS)[number]

export const OFFICE_POSITIONS = [
  ...LEADER_POSITIONS,
  ...JUDGE_POSITIONS,
  ...CONGRESS_POSITIONS,
] as const

export function isJudgeOfficePosition(position: string): boolean {
  return (JUDGE_POSITIONS as readonly string[]).includes(position)
}

export function isCongressOfficePosition(position: string): boolean {
  return (CONGRESS_POSITIONS as readonly string[]).includes(position)
}

export const LEADER_ASSIGN_TYPES = [
  { value: 'leader', label: 'Лидер' },
  { value: 'deputy', label: 'Заместитель' },
  { value: 'minister', label: 'Министр' },
  { value: 'advisor', label: 'Советник' },
] as const

export function normalizeLeaderPosition(position: string | null | undefined): string {
  const cleaned = (position ?? '').trim()
  if (cleaned === 'Зам' || cleaned === 'Зам.') return 'Заместитель'
  return cleaned
}
