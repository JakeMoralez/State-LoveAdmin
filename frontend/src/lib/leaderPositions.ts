export const LEADER_POSITIONS = ['Лидер', 'Заместитель', 'Министр', 'Советник'] as const

export type LeaderPosition = (typeof LEADER_POSITIONS)[number]

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
