export const ACADEMY_DIRECTIONS = [
  { value: 'general', label: 'Подготовка ЗГС/ГС' },
  { value: 'central_apparatus', label: 'Центральный аппарат' },
  { value: 'justice', label: 'Министерство Юстиции' },
  { value: 'defense', label: 'Министерство Обороны' },
  { value: 'health', label: 'Министерство Здравоохранения' },
  { value: 'gov_structures', label: 'Правительство / госструктуры' },
] as const

export const ACADEMY_STAGES = [
  { value: 'theory', label: 'Теория' },
  { value: 'mentored', label: 'Работа с наставником' },
  { value: 'practice', label: 'Самостоятельная практика' },
  { value: 'attestation', label: 'Аттестация' },
] as const

export const ACADEMY_STATUSES = [
  { value: 'active', label: 'Обучается' },
  { value: 'frozen', label: 'Заморожен' },
  { value: 'graduated', label: 'Выпускник' },
  { value: 'expelled', label: 'Отчислен' },
] as const

export const ACADEMY_EVENT_LABELS: Record<string, string> = {
  enrolled: 'принят в Академию',
  updated: 'обновлена карточка',
  stage_changed: 'сменён этап',
  graduated: 'выпущен в кадровый резерв',
  expelled: 'отчислен',
  frozen: 'заморожен',
  comment: 'комментарий наставника',
  warning: 'предупреждение Академии',
  assignment_issued: 'выдано задание',
  report_submitted: 'сдан отчёт',
  report_reviewed: 'задание проверено',
}

export function formatAcademyDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  return d.toLocaleDateString('ru-RU')
}

export function academyCanEnrollLevel(level: number): boolean {
  return level >= 1 && level <= 2
}
