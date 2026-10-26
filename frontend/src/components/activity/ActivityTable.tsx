import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ActivityLogItem } from '../../api'
import { activityVerb, formatStaffUpdateDetail, staffUpdateVerb } from '../../lib/activityLabels'
import { profilePath } from '../../lib/profileLinks'
import { stripStaffNicknameTags } from '../../lib/staffNickname'
import { activityChanges } from '../../lib/activityPresentation'
import { cn } from '../../lib/utils'
import { Select } from '../ui/Select'
import { PageSkeleton } from '../ui/LoadingState'

export const ACTIVITY_PAGE_SIZE_OPTIONS = [
  { value: '10', label: 'На странице 10' },
  { value: '25', label: 'На странице 25' },
  { value: '50', label: 'На странице 50' },
]

export function ActivityToolbar({
  q,
  onQuery,
  pageSize,
  onPageSize,
  loading,
  onRefresh,
  children,
}: {
  q: string
  onQuery: (value: string) => void
  pageSize: number
  onPageSize: (value: number) => void
  loading?: boolean
  onRefresh: () => void
  children?: ReactNode
}) {
  return (
    <div className="activity-table-toolbar">
      <label className="activity-table-search">
        <Search size={15} aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Поиск по действиям…"
          aria-label="Поиск по журналу"
        />
      </label>
      {children}
      <Select
        className="activity-log-pagesize"
        size="sm"
        value={String(pageSize)}
        onChange={(value) => onPageSize(parseInt(value, 10) || 10)}
        options={ACTIVITY_PAGE_SIZE_OPTIONS}
      />
      <button
        type="button"
        className="activity-table-refresh"
        aria-label="Обновить"
        disabled={loading}
        onClick={onRefresh}
      >
        <RefreshCw size={15} className={loading ? 'animate-spin' : undefined} />
      </button>
    </div>
  )
}

export function formatActivityStamp(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { date: iso, time: '' }
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }),
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}

export function formatActivityDetail(detail: Record<string, unknown>, action: string): string | null {
  if (action === 'staff_update') {
    return formatStaffUpdateDetail(detail)
  }
  if (action === 'task_update' && detail.status) {
    return `статус: ${String(detail.status)}`
  }
  if (action === 'loot_case_spin') {
    const prize = typeof detail.prize_title === 'string' ? detail.prize_title.trim() : ''
    const caseTitle = typeof detail.case_title === 'string' ? detail.case_title.trim() : ''
    if (prize && caseTitle) return `выпал приз «${prize}» из кейса «${caseTitle}»`
    if (prize) return `выпал приз «${prize}»`
    if (caseTitle) return `«${caseTitle}»`
  }
  if (action === 'loot_case_prize_bulk' && detail.count != null) {
    return `${detail.count}`
  }
  if (action.startsWith('issuance_')) {
    const label = typeof detail.amount_label === 'string' ? detail.amount_label.trim() : ''
    if (label) return `[${label}]`
  }
  if (action === 'dev_catalog_update' && Array.isArray(detail.keys)) {
    const labels: Record<string, string> = {
      factions: 'фракции',
      ministers: 'министры',
      advisors: 'советники',
      judge_positions: 'должности судей',
      tag_spheres: 'сферы тегов',
    }
    const parts = detail.keys
      .map((key) => labels[String(key)] || String(key))
      .filter(Boolean)
    if (parts.length) return parts.join(', ')
  }
  if (action === 'dev_chat_update') {
    const bits: string[] = []
    if (detail.peer_id != null) bits.push(`#${detail.peer_id}`)
    if (typeof detail.chat_kind === 'string' && detail.chat_kind.trim()) {
      bits.push(detail.chat_kind.trim())
    }
    if (bits.length) return bits.join(', ')
  }
  const title = detail.title
  if (typeof title === 'string' && title.trim()) return `«${title.trim()}»`
  const comment = detail.comment
  if (typeof comment === 'string' && comment.trim()) return comment.trim()
  const position = detail.position
  if (typeof position === 'string' && position.trim()) {
    const org = typeof detail.org_tag === 'string' ? detail.org_tag.trim() : ''
    return org ? `${position.trim()} [${org}]` : position.trim()
  }
  return null
}

function ActivityNick({ label, to }: { label: string; to?: string | null }) {
  const name = stripStaffNicknameTags(label) || label
  const inner = <span className="activity-nick-name">{name}</span>
  if (!to) return inner
  return (
    <Link to={to} className="activity-row-link">
      {inner}
    </Link>
  )
}

function actorPath(vkId: number) {
  return vkId > 0 ? profilePath(vkId) : undefined
}

function targetPath(item: ActivityLogItem): string | null {
  if (item.target_vk_id == null) return null
  return profilePath(item.target_vk_id)
}

export function pageWindow(current: number, last: number): number[] {
  const span = 5
  let start = Math.max(1, current - Math.floor(span / 2))
  const end = Math.min(last, start + span - 1)
  start = Math.max(1, end - span + 1)
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
}

function ActivityActionLine({ item }: { item: ActivityLogItem }) {
  const extra = item.sentence_tail ?? formatActivityDetail(item.detail ?? {}, item.action)
  const verb = item.sentence_verb ?? (
    item.action === 'staff_update'
      ? staffUpdateVerb(item.detail ?? {})
      : activityVerb(item.action, item.action_label))
  return (
    <p className="activity-action">
      {item.actor_role ? <span>{item.actor_role} </span> : null}
      <ActivityNick label={item.actor_name} to={actorPath(item.actor_vk_id)} />{' '}
      <span className="activity-action-verb">{verb}</span>
      {item.target_name ? (
        <>
          {' '}
          <ActivityNick label={item.target_name} to={targetPath(item)} />
        </>
      ) : null}
      {extra ? (
        <>
          {/^[.,:;!?]/.test(extra) ? '' : ' '}
          <span className="activity-action-extra">{extra}</span>
        </>
      ) : null}
    </p>
  )
}

function EventDetails({ item }: { item: ActivityLogItem }) {
  const changes = activityChanges(item.detail)
  const reason = typeof item.detail.reason === 'string' ? item.detail.reason.trim() : ''
  const comparison = <dl className="activity-changes">{changes.map(change => <div key={change.field}>
    <dt>{change.label}</dt><dd><span className="activity-change-before">{change.before}</span><span className="activity-change-arrow" aria-label="стало">→</span><strong>{change.after}</strong></dd>
  </div>)}</dl>
  return <>
    {changes.length === 1 ? comparison : changes.length > 1 ? <details className="activity-change-disclosure"><summary>Изменено полей: {changes.length} · Показать изменения</summary>{comparison}</details> : null}
    {reason && <p className="activity-event-reason"><strong>Причина:</strong> {reason}</p>}
  </>
}

export function ActivityTable({
  items,
  loading,
  empty,
  total,
  offset,
  pageSize,
  onPage,
  pagerLabel = 'Страницы журнала',
}: {
  items: ActivityLogItem[]
  loading?: boolean
  empty: string
  total: number
  offset: number
  pageSize: number
  onPage: (page: number) => void
  pagerLabel?: string
}) {
  const currentPage = Math.floor(offset / pageSize) + 1
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : offset + 1
  const to = offset + items.length

  const goPage = (page: number) => {
    const next = Math.min(lastPage, Math.max(1, page))
    onPage(next)
  }

  return (
    <>
      <div className="activity-feed" aria-busy={!!loading}>
        {loading && items.length === 0 ? <PageSkeleton variant="list" label="Загрузка журнала" /> : items.length === 0 ?
          <p className="activity-feed-empty">{empty}</p> : <ol className="activity-events">{items.map(item => {
            const date = new Date(item.created_at)
            const validDate = !Number.isNaN(date.getTime())
            const source = item.detail.source === 'bot' ? 'Бот' : item.detail.source === 'panel' ? 'Панель' : item.detail.source === 'system' ? 'Система' : ''
            return <li key={item.id}><article className="activity-event">
              <div className="activity-event-meta"><time dateTime={item.created_at}>{validDate ? date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Дата не сохранена'}{validDate && <><span aria-hidden> · </span>{date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</>}</time>{source && <span className="activity-event-source">{source}</span>}</div>
              <ActivityActionLine item={item} /><EventDetails item={item} />
            </article></li>
          })}</ol>}
      </div>
      <div className="activity-table-foot">
        <p className="activity-table-range">
          {total === 0 ? 'Записей нет' : `Записи с ${from} до ${to} из ${total}`}
        </p>
        {lastPage > 1 && (
          <nav className="activity-pages" aria-label={pagerLabel}>
            <button
              type="button"
              className="activity-page-btn"
              disabled={currentPage <= 1 || loading}
              aria-label="Предыдущая страница"
              onClick={() => goPage(currentPage - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            {pageWindow(currentPage, lastPage).map((page) => (
              <button
                key={page}
                type="button"
                className={cn('activity-page-btn', page === currentPage && 'activity-page-btn--current')}
                disabled={loading}
                aria-current={page === currentPage ? 'page' : undefined}
                onClick={() => goPage(page)}
              >
                {page}
              </button>
            ))}
            <button
              type="button"
              className="activity-page-btn"
              disabled={currentPage >= lastPage || loading}
              aria-label="Следующая страница"
              onClick={() => goPage(currentPage + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </nav>
        )}
      </div>
    </>
  )
}
