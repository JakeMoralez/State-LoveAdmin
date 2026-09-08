import { ACCESS_LEVEL_SHORT } from './accessLevels'
import { formatSpheresDisplay } from './spheres'
import { parseStaffNick } from './staff'
import { rewriteLegacyNicknameTags } from './staffNickname'

/** Русские глаголы журнала. Дублируют backend ACTION_MESSAGES, чтобы лента не зависела от старого API. */
export const ACTIVITY_VERBS: Record<string, string> = {
  staff_assign: 'назначил следящим',
  staff_update: 'изменил должность',
  profile_update: 'обновил кабинет',
  staff_revoke: 'снял доступ следящего',
  judge_assign: 'назначил судьёй',
  congress_assign: 'назначил в конгресс',
  leader_assign: 'назначил в руководство',
  leader_update: 'изменил карточку руководства',
  leader_remove: 'убрал из реестра руководства',
  leader_clear_nickname: 'очистил ник в реестре руководства',
  dev_catalog_update: 'обновил справочник',
  dev_chat_update: 'обновил настройки беседы',
  qb_bank_create: 'создал банк вопросов',
  qb_bank_update: 'изменил банк вопросов',
  qb_bank_delete: 'удалил банк вопросов',
  qb_item_create: 'добавил вопрос в банк',
  qb_item_created: 'добавил вопрос в банк',
  qb_item_update: 'изменил вопрос в банке',
  qb_item_updated: 'изменил вопрос в банке',
  qb_item_submit: 'отправил вопрос на проверку',
  qb_item_submitted: 'отправил вопрос на проверку',
  qb_item_approve: 'одобрил вопрос в банке',
  qb_item_approved: 'одобрил вопрос в банке',
  qb_item_reject: 'отклонил вопрос в банке',
  qb_item_rejected: 'отклонил вопрос в банке',
  qb_item_needs_revision: 'вернул вопрос на доработку',
  qb_item_comment: 'оставил комментарий к вопросу',
  qb_item_delete: 'удалил вопрос из банка',
  qb_item_deleted: 'удалил вопрос из банка',
  task_create: 'создал задачу',
  task_update: 'изменил задачу',
  task_delete: 'удалил задачу',
  project_create: 'создал проект',
  project_update: 'изменил проект',
  project_delete: 'удалил проект',
  judge_forum_template_save: 'обновил шаблон списка судей',
  loot_case_create: 'создал кейс',
  loot_case_update: 'изменил кейс',
  loot_case_delete: 'удалил кейс',
  loot_case_spin: 'открыл кейс',
  loot_case_prize_create: 'добавил приз в кейс',
  loot_case_prize_update: 'изменил приз в кейсе',
  loot_case_prize_delete: 'удалил приз из кейса',
  loot_case_prize_bulk: 'импортировал призы в кейс',
  loot_case_prize_shuffle: 'перемешал призы в кейсе',
  academy_enroll: 'зачислил в академию',
  academy_updated: 'изменил карточку академика',
  academy_stage_changed: 'сменил этап академии',
  academy_graduated: 'выпустил академика',
  academy_expelled: 'отчислил из академии',
  academy_frozen: 'заморозил академика',
  academy_comment: 'оставил комментарий в академии',
  academy_warning: 'выдал предупреждение академии',
  academy_template_create: 'создал шаблон задания академии',
  academy_template_update: 'изменил шаблон задания академии',
  academy_assignment_create: 'выдал задание академии',
  academy_report_submit: 'сдал отчёт академии',
  academy_report_review: 'проверил отчёт академии',
  academy_session_create: 'создал занятие академии',
  academy_attendance: 'отметил посещаемость академии',
  question_bank_create: 'создал банк вопросов',
  obzvon_question_create: 'создал вопрос обзвона',
  obzvon_session_create: 'начал сессию обзвона',
  obzvon_session_complete: 'завершил сессию обзвона',
  obzvon_template_create: 'создал шаблон обзвона',
  arz_lead_cookies: 'обновил cookies Arizona Leaders',
  issuance_created: 'создал заявку на выдачу',
  issuance_issued: 'выдал',
  issuance_unissued: 'снял отметку о выдаче',
  issuance_rejected: 'отклонил заявку на выдачу',
  issuance_unrejected: 'снял отклонение заявки на выдачу',
  issuance_deleted: 'удалил заявку на выдачу',
}

const ACTION_TOKEN_RU: Record<string, string> = {
  create: 'создал',
  created: 'создал',
  update: 'изменил',
  updated: 'изменил',
  delete: 'удалил',
  deleted: 'удалил',
  complete: 'завершил',
  completed: 'завершил',
  submit: 'отправил',
  submitted: 'отправил',
  approve: 'одобрил',
  approved: 'одобрил',
  reject: 'отклонил',
  rejected: 'отклонил',
  assign: 'назначил',
  revoke: 'снял',
  enroll: 'зачислил',
  spin: 'открыл',
  shuffle: 'перемешал',
  bulk: 'импортировал',
  cookies: 'cookies',
  obzvon: 'обзвона',
  question: 'вопрос',
  session: 'сессию',
  template: 'шаблон',
  prize: 'приз',
  bank: 'банк',
  lead: 'Arizona Leaders',
  arz: '',
  staff: 'штат',
  task: 'задачу',
  project: 'проект',
  academy: 'академию',
  issuance: 'выдачу',
  forum: 'форум',
  catalog: 'справочник',
  chat: 'беседу',
  nickname: 'ник',
}

function actionKey(value: string | null | undefined): string {
  return (value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

export function humanizeActionKey(action: string): string {
  const parts = actionKey(action).split('_').filter(Boolean)
  if (!parts.length) return (action || '').trim() || 'неизвестное действие'
  return parts
    .map((part) => (part in ACTION_TOKEN_RU ? ACTION_TOKEN_RU[part] : part))
    .filter(Boolean)
    .join(' ')
    .trim() || action.replaceAll('_', ' ')
}

export function activityVerb(action: string, fallback?: string | null): string {
  const keys = [actionKey(action), actionKey(fallback)].filter(Boolean)
  for (const key of keys) {
    if (ACTIVITY_VERBS[key]) return ACTIVITY_VERBS[key]
  }
  const key = keys[0] || ''
  if (key.startsWith('qb_item_')) return 'изменил вопрос в банке'
  if (key.startsWith('loot_case_')) return 'изменил кейс'
  if (key.startsWith('leader_')) return 'изменил карточку руководства'
  if (key.startsWith('dev_')) return 'обновил настройки'
  if (key.startsWith('academy_')) return 'изменил академию'
  if (key.startsWith('obzvon_')) return humanizeActionKey(key)
  if (key.startsWith('question_bank_')) return 'изменил банк вопросов'
  if (key.startsWith('arz_')) return 'обновил Arizona Leaders'
  if (key.startsWith('staff_')) return 'изменил карточку следящего'
  if (key.startsWith('task_')) return 'изменил задачу'
  if (key.startsWith('project_')) return 'изменил проект'
  if (key.startsWith('issuance_')) return humanizeActionKey(key)
  const label = (fallback || action || '').trim()
  if (label && /[а-яё]/i.test(label)) return label
  return humanizeActionKey(action || fallback || '')
}

export function localizeActivityMessage(message: string, action: string): string {
  const ru = activityVerb(action)
  const en = action.replaceAll('_', ' ')
  if (en && message.includes(en)) return message.replace(en, ru)
  return message
}

function verbsWithPrefix(prefix: string): string[] {
  return Object.keys(ACTIVITY_VERBS).filter((key) => key.startsWith(prefix))
}

export const ACTION_FILTERS: { id: string; label: string; actions: string[] }[] = [
  { id: 'all', label: 'Все действия', actions: [] },
  { id: 'staff', label: 'Следящие', actions: verbsWithPrefix('staff_') },
  { id: 'leaders', label: 'Руководство', actions: verbsWithPrefix('leader_') },
  {
    id: 'justice',
    label: 'Судьи и конгресс',
    actions: ['judge_assign', 'congress_assign', 'judge_forum_template_save'],
  },
  { id: 'tasks', label: 'Задачи', actions: verbsWithPrefix('task_') },
  { id: 'projects', label: 'Проекты', actions: verbsWithPrefix('project_') },
  { id: 'banks', label: 'Банки вопросов', actions: verbsWithPrefix('qb_') },
  { id: 'cases', label: 'Кейсы', actions: verbsWithPrefix('loot_case_') },
  { id: 'academy', label: 'Академия', actions: verbsWithPrefix('academy_') },
  { id: 'issuance', label: 'Выдачи', actions: verbsWithPrefix('issuance_') },
]

export const ACTION_FILTER_OPTIONS = ACTION_FILTERS.map(({ id, label }) => ({ value: id, label }))

export const ACTION_GROUP_PREFIXES: Record<string, string[]> = {
  staff: ['staff_'],
  leaders: ['leader_'],
  justice: ['judge_', 'congress_'],
  tasks: ['task_'],
  projects: ['project_'],
  banks: ['qb_'],
  cases: ['loot_case_'],
  academy: ['academy_'],
  issuance: ['issuance_'],
}

export function actionMatchesFilter(action: string, filterId: string): boolean {
  if (!filterId || filterId === 'all') return true
  const key = actionKey(action)
  const exact = ACTION_FILTERS.find((item) => item.id === filterId)?.actions ?? []
  if (exact.includes(key)) return true
  return (ACTION_GROUP_PREFIXES[filterId] ?? []).some((prefix) => key.startsWith(prefix))
}

export function activityKind(action: string): { label: string; tone: 'error' | 'warn' | 'info' } {
  const key = actionKey(action)
  const group = ACTION_FILTERS.find((item) => item.id !== 'all' && item.actions.includes(key))
  const label = group?.label ?? 'Действие'
  if (/delete|revoke|remove|reject/.test(key)) return { label, tone: 'error' }
  if (/create|assign|spin|approve|submit|issued/.test(key)) return { label, tone: 'info' }
  return { label, tone: 'warn' }
}

const GLOBAL_ROLE_NAMES = new Set(['Куратор', 'ЗГА', 'ГА', 'Разработчик'])

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function levelNum(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim())
  return null
}

function roleLabel(value: unknown): string {
  const num = levelNum(value)
  if (num != null) return ACCESS_LEVEL_SHORT[num] ?? `Уровень ${num}`
  if (typeof value === 'string' && value.trim()) return value.trim()
  return ''
}

function isGlobalRole(label: string, level: number | null): boolean {
  if (level != null && level >= 8) return true
  return GLOBAL_ROLE_NAMES.has(label)
}

function sphereKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item).trim()).filter(Boolean)
}

function cleanSphereText(value: unknown): string {
  if (typeof value !== 'string') return ''
  const text = value.trim()
  return !text || text === '—' ? '' : text
}

function nickLabel(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return ''
  const { name } = parseStaffNick(rewriteLegacyNicknameTags(value.trim()))
  return name.replaceAll(' ', '_') || value.trim()
}

function spheresSide(detail: Record<string, unknown>, side: 'from' | 'to'): string {
  const raw = detail.spheres
  const rec = asRecord(raw)
  if (rec) {
    const display = cleanSphereText(rec[side === 'from' ? 'from_display' : 'to_display'])
    if (display) return display
    const keys = sphereKeys(rec[side])
    if (keys.length) return cleanSphereText(formatSpheresDisplay(keys))
  }
  if (side === 'to') {
    const display = cleanSphereText(detail.spheres_display)
    if (display) return display
    if (Array.isArray(raw)) return cleanSphereText(formatSpheresDisplay(sphereKeys(raw)))
  }
  return ''
}

function joinRoleSphere(role: string, sphere: string): string {
  if (role && sphere) return `${role}, ${sphere}`
  return role || sphere
}

function wasBecame(from: string, to: string): string {
  if (from && to && from !== to) return `[Было: ${from} | Стало: ${to}]`
  if (to) return `[Стало: ${to}]`
  if (from) return `[Было: ${from}]`
  return ''
}

function roleChanged(detail: Record<string, unknown>): boolean {
  const level = asRecord(detail.access_level)
  if (!level) return false
  const fromN = levelNum(level.from)
  const toN = levelNum(level.to)
  if (fromN != null && toN != null) return fromN !== toN
  return roleLabel(level.from_name ?? level.from) !== roleLabel(level.to_name ?? level.to)
}

function spheresChanged(detail: Record<string, unknown>): boolean {
  const raw = detail.spheres
  if (raw === true) return true
  const rec = asRecord(raw)
  if (rec) {
    return (
      sphereKeys(rec.from).join() !== sphereKeys(rec.to).join() ||
      cleanSphereText(rec.from_display) !== cleanSphereText(rec.to_display)
    )
  }
  if (Array.isArray(raw)) return sphereKeys(raw).length > 0
  return Boolean(cleanSphereText(detail.spheres_display))
}

function nickChanged(detail: Record<string, unknown>): boolean {
  const raw = detail.nickname
  const rec = asRecord(raw)
  if (rec) {
    const from = nickLabel(rec.from)
    const to = nickLabel(rec.to)
    return Boolean(from || to) && from !== to
  }
  if (raw === true) return !roleChanged(detail) && !spheresChanged(detail)
  return typeof raw === 'string' && Boolean(raw.trim())
}

export function staffUpdateVerb(detail: Record<string, unknown> | null | undefined): string {
  const d = detail ?? {}
  const role =
    roleChanged(d) || (asRecord(d.access_level) != null && !nickChanged(d) && !spheresChanged(d))
  const nick = nickChanged(d)
  const spheres = spheresChanged(d) && !role
  if (role && nick) return 'изменил должность и ник'
  if (nick && spheres) return 'изменил ник и сферы'
  if (nick) return 'изменил ник'
  if (spheres) return 'изменил сферы'
  if (role || asRecord(d.access_level)) return 'изменил должность'
  if (d.granted_at) return 'изменил дату назначения'
  if (d.promoted_at) return 'изменил дату повышения'
  if (d.has_ca_access != null) return 'изменил доступ к порталу'
  if (d.note) return 'изменил заметку'
  return 'изменил карточку следящего'
}

export function formatStaffUpdateDetail(detail: Record<string, unknown>): string | null {
  const level = asRecord(detail.access_level)
  let fromRole = ''
  let toRole = ''
  let fromNum: number | null = null
  let toNum: number | null = null
  if (level) {
    fromNum = levelNum(level.from)
    toNum = levelNum(level.to)
    fromRole = roleLabel(level.from_name ?? level.from)
    toRole = roleLabel(level.to_name ?? level.to)
  } else if (detail.access_level != null) {
    toNum = levelNum(detail.access_level)
    toRole = roleLabel(detail.access_level_name ?? detail.access_level)
  } else if (detail.access_level_name != null) {
    toRole = roleLabel(detail.access_level_name)
  }

  let fromSph = spheresSide(detail, 'from')
  let toSph = spheresSide(detail, 'to')
  if (fromRole || toRole) {
    if (isGlobalRole(fromRole, fromNum)) fromSph = ''
    if (isGlobalRole(toRole, toNum)) toSph = ''
  }

  const roleBracket = wasBecame(joinRoleSphere(fromRole, fromSph), joinRoleSphere(toRole, toSph))
  if (roleBracket) return roleBracket

  const nickRec = asRecord(detail.nickname)
  const fromNick = nickRec ? nickLabel(nickRec.from) : detail.nickname === true ? nickLabel(detail.target_nickname) : ''
  const toNick = nickRec ? nickLabel(nickRec.to) : typeof detail.nickname === 'string' ? nickLabel(detail.nickname) : ''
  const nickBracket = wasBecame(fromNick, toNick)
  if (nickBracket) return nickBracket

  const sphereBracket = wasBecame(fromSph, toSph)
  return sphereBracket || null
}
