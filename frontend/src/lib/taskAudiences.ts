export const GOV_STRUCTURES_SPHERE = 'gov_structures'

export type TaskAudience = 'supervisors' | 'gs_zgs' | 'structure_managers'

export const TASK_AUDIENCE_OPTIONS: { id: TaskAudience; label: string }[] = [
  { id: 'supervisors', label: 'Следящие' },
  { id: 'gs_zgs', label: 'Главные следящие' },
  { id: 'structure_managers', label: 'Управляющие' },
]

export const TASK_AUDIENCE_LABELS: Record<TaskAudience, string> = Object.fromEntries(
  TASK_AUDIENCE_OPTIONS.map((o) => [o.id, o.label]),
) as Record<TaskAudience, string>

export const WEEKDAY_OPTIONS = [
  { value: 0, label: 'Пн' },
  { value: 1, label: 'Вт' },
  { value: 2, label: 'Ср' },
  { value: 3, label: 'Чт' },
  { value: 4, label: 'Пт' },
  { value: 5, label: 'Сб' },
  { value: 6, label: 'Вс' },
]

export const RECURRENCE_FREQ_OPTIONS = [
  { value: 'daily', label: 'Ежедневно' },
  { value: 'weekly', label: 'Еженедельно' },
  { value: 'monthly', label: 'Ежемесячно' },
  { value: 'dates', label: 'Конкретные даты' },
]
