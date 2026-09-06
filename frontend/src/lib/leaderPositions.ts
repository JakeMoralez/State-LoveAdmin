export const LEADER_POSITIONS = ['Лидер', 'Зам', 'Министр', 'Советник'] as const

export type LeaderPosition = (typeof LEADER_POSITIONS)[number]

export const LEADER_ASSIGN_TYPES = [
  { value: 'leader', label: 'Лидер' },
  { value: 'deputy', label: 'Зам' },
  { value: 'minister', label: 'Министр' },
  { value: 'advisor', label: 'Советник' },
] as const
