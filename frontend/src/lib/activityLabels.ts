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
}

function actionKey(value: string | null | undefined): string {
  return (value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
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
  const label = (fallback || action || '').trim()
  if (label && /[а-яё]/i.test(label)) return label
  return 'выполнил действие'
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
  if (/create|assign|spin|approve|submit/.test(key)) return { label, tone: 'info' }
  return { label, tone: 'warn' }
}
