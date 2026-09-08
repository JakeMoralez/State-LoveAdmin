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

export const ACADEMY_CATEGORIES = [
  { value: 'theory', label: 'Теория' },
  { value: 'practice', label: 'Практика' },
  { value: 'management', label: 'Управление' },
] as const

export const ACADEMY_PROOF_KINDS: Record<string, string> = {
  text: 'Текст',
  link: 'Ссылка',
  file: 'Файл / URL',
  proof: 'Доказательство',
}

export const ACADEMY_REVIEWER_KINDS = [
  { value: 'mentor', label: 'Наставник' },
  { value: 'academy_lead', label: 'Руководство Академии' },
] as const

export function academyCategoryForStage(stage: string): string {
  if (stage === 'practice') return 'practice'
  if (stage === 'attestation') return 'management'
  if (stage === 'mentored') return 'practice'
  return 'theory'
}

export function academyProofLabel(kind: string): string {
  return ACADEMY_PROOF_KINDS[kind] || kind
}

export function academyReviewerLabel(kind: string): string {
  return ACADEMY_REVIEWER_KINDS.find((item) => item.value === kind)?.label || kind
}

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

export const ACADEMY_REPORT_STATUS_LABELS: Record<string, string> = {
  pending: 'На проверке',
  accepted: 'Принято',
  revision: 'На доработку',
  rejected: 'Отклонено',
  open: 'Не сдано',
}

export function academyReportLabel(status: string | null | undefined): string {
  if (!status) return 'Не сдано'
  return ACADEMY_REPORT_STATUS_LABELS[status] || status
}

export function academyStageChipClass(
  stage: string,
  status?: string,
  overdue?: boolean,
): string {
  if (status === 'frozen') return 'academy-chip academy-chip--muted'
  if (overdue) return 'academy-chip academy-chip--warn'
  if (stage === 'practice') return 'academy-chip academy-chip--gold'
  if (stage === 'attestation') return 'academy-chip academy-chip--bright'
  if (stage === 'mentored') return 'academy-chip academy-chip--gold'
  return 'academy-chip'
}

export function academyStatusChipClass(status: string | null | undefined): string {
  if (status === 'accepted') return 'academy-chip academy-chip--ok'
  if (status === 'revision' || status === 'rejected') return 'academy-chip academy-chip--warn'
  if (status === 'pending') return 'academy-chip academy-chip--gold'
  return 'academy-chip academy-chip--muted'
}

export function formatAcademyDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  return d.toLocaleDateString('ru-RU')
}

export function formatAcademyDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16)
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function academyDueOverdue(dueAt: string | null | undefined, status?: string | null): boolean {
  if (!dueAt || status === 'accepted') return false
  const t = new Date(dueAt).getTime()
  return !Number.isNaN(t) && t < Date.now()
}

export function academyCanEnrollLevel(level: number): boolean {
  return level >= 1 && level <= 2
}

export function academyProgressPct(done: number, total: number): number {
  if (total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)))
}

const ACADEMY_FILE_PATH_RE = /\/uploads\/academy\/([a-f0-9]{32}\.[a-z0-9]{1,8})(?:\?.*)?$/i

export const ACADEMY_MATERIAL_ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.rtf,.txt,.csv,.zip,.png,.jpg,.jpeg,.gif,.webp'

export function academyMaterialFilePath(url: string): string | null {
  const match = url.trim().match(ACADEMY_FILE_PATH_RE)
  return match ? `/uploads/academy/${match[1].toLowerCase()}` : null
}

export function isAcademyMaterialFile(url: string): boolean {
  return academyMaterialFilePath(url) != null
}

export function academyMaterialHref(url: string): string {
  return academyMaterialFilePath(url) || url.trim()
}

export function academyMaterials(items?: { title: string; url: string }[] | null): { title: string; url: string }[] {
  return (items || []).filter((item) => {
    const url = item.url.trim()
    return /^https?:\/\//i.test(url) || isAcademyMaterialFile(url)
  })
}

export function cleanMaterials(items: { title: string; url: string }[]): { title: string; url: string }[] {
  return items
    .map((item) => {
      const title = item.title.trim()
      const file = academyMaterialFilePath(item.url)
      const url = file || item.url.trim()
      return { title, url }
    })
    .filter((item) => /^https?:\/\//i.test(item.url) || isAcademyMaterialFile(item.url))
    .slice(0, 8)
}
