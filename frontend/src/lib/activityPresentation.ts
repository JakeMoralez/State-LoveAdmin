import { ACCESS_ROLE_TITLES } from './accessLevels'
import { formatSpheresDisplay } from './spheres'

const LABELS: Record<string, string> = {
  access_level: 'Должность', nickname: 'Ник', bot_nickname: 'Ник', position: 'Должность', spheres: 'Сферы',
  senior_spheres: 'Обязанности по сферам', is_senior: 'Дополнительные полномочия', has_ca_access: 'Доступ к ЦА',
  discord_id: 'Discord', username: 'Аккаунт форума', note: 'Заметка', granted_at: 'Дата назначения', promoted_at: 'Дата повышения',
  status: 'Статус', title: 'Название', notify_tasks: 'Уведомления о задачах', notify_assign: 'Уведомления о назначениях',
}
const STATUSES: Record<string, string> = { todo: 'К выполнению', in_progress: 'В работе', done: 'Выполнено', cancelled: 'Отменено', draft: 'Черновик', pending: 'На проверке', confirmed: 'Подтверждено' }

export function activityValue(field: string, value: unknown, stored?: unknown): string {
  if (typeof stored === 'string' && stored.trim()) return stored
  if (value == null) return 'Не сохранено'
  if (field === 'access_level') return Number(value) === 0 ? 'Нет доступа' : ACCESS_ROLE_TITLES[Number(value)] || `Уровень ${value}`
  if (Array.isArray(value)) return field.includes('spheres') ? value.length ? formatSpheresDisplay(value.map(String)) : 'Нет' : value.map(v => activityValue('', v)).join(', ') || 'Нет'
  if (typeof value === 'boolean') return field === 'has_ca_access' ? value ? 'Есть доступ' : 'Нет доступа' : value ? 'Да' : 'Нет'
  if (value === '') return 'Не указано'
  if (field.endsWith('_at')) {
    const date = new Date(String(value))
    if (!Number.isNaN(date.getTime())) return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
  }
  if (field === 'status') return STATUSES[String(value)] || String(value)
  return typeof value === 'object' ? 'Подробности не сохранены' : String(value)
}

export function activityChanges(detail: Record<string, unknown>) {
  return Object.entries(detail).flatMap(([field, raw]) => {
    if (!raw || typeof raw !== 'object' || !('from' in raw) || !('to' in raw)) return []
    const change = raw as Record<string, unknown>
    const label = field === 'senior_spheres' ? detail.target_access_level === 2 ? 'Старшинство' : Number(detail.target_access_level) > 2 ? 'Дополнительно следит' : LABELS[field] : LABELS[field]
    return [{ field, label: label || 'Сведения', before: activityValue(field, change.from, change.from_name ?? change.from_display), after: activityValue(field, change.to, change.to_name ?? change.to_display) }]
  })
}
