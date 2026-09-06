export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function formatDueDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const hasTime = iso.length > 10
  const d = new Date(hasTime ? iso : iso + 'T12:00:00')
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(hasTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  })
}

export function isOverdue(iso: string | null | undefined): boolean {
  if (!iso) return false
  const d = new Date(iso.length > 10 ? iso : iso + 'T23:59:59')
  return d < new Date()
}

export const TASK_TYPE_LABELS: Record<string, string> = {
  assignment: 'Поручение',
  check: 'Проверка',
  report: 'Отчёт',
  bug: 'Баг',
}

export function taskTypeBadgeClass(taskType: string | undefined): string {
  switch (taskType) {
    case 'assignment':
      return 'badge-type-assignment'
    case 'check':
      return 'badge-type-check'
    case 'report':
      return 'badge-type-report'
    case 'bug':
      return 'badge-type-bug'
    default:
      return 'badge-muted'
  }
}

export function priorityBadgeClass(priority: string | undefined): string {
  switch (priority) {
    case 'urgent':
      return 'badge-urgent'
    case 'high':
      return 'badge-gold'
    case 'low':
      return 'badge-muted'
    default:
      return 'badge-gold'
  }
}

export function statusBadgeClass(status: string | undefined): string {
  switch (status) {
    case 'backlog':
    case 'todo':
      return 'badge-status-todo'
    case 'in_progress':
    case 'review':
      return 'badge-status-progress'
    case 'done':
      return 'badge-status-done'
    case 'cancelled':
      return 'badge-status-cancelled'
    default:
      return 'badge-muted'
  }
}
