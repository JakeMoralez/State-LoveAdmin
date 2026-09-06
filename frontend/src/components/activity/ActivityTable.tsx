import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ActivityLogItem } from '../../api'
import { activityVerb } from '../../lib/activityLabels'
import { parseStaffNick } from '../../lib/staff'
import { cn } from '../../lib/utils'
import { Select } from '../ui/Select'

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
    date: `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
  }
}

export function formatActivityDetail(detail: Record<string, unknown>, action: string): string | null {
  if (action === 'staff_update') {
    const bits: string[] = []
    const level = detail.access_level
    if (level && typeof level === 'object') {
      const ch = level as { from_name?: string; to_name?: string; from?: unknown; to?: unknown }
      const from = ch.from_name ?? ch.from
      const to = ch.to_name ?? ch.to
      if (from != null && to != null) bits.push(`[Было: ${from} | Стало: ${to}]`)
    }
    if (detail.nickname) bits.push('ник')
    if (detail.spheres) bits.push('сферы')
    if (detail.has_ca_access != null) bits.push('доступ к порталу')
    if (detail.note) bits.push('заметка')
    return bits.length ? bits.join(' · ') : null
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
  const title = detail.title
  if (typeof title === 'string' && title.trim()) return `«${title.trim()}»`
  const comment = detail.comment
  if (typeof comment === 'string' && comment.trim()) return comment.trim()
  const position = detail.position
  if (typeof position === 'string' && position.trim()) return position.trim()
  return null
}

function ActivityNick({ label, to }: { label: string; to?: string | null }) {
  const { name } = parseStaffNick(label)
  const inner = <span className="activity-nick-name">{name.replaceAll(' ', '_')}</span>
  if (!to) return inner
  return (
    <Link to={to} className="activity-row-link">
      {inner}
    </Link>
  )
}

function actorPath(vkId: number) {
  return `/staff/${vkId}`
}

function targetPath(item: ActivityLogItem): string | null {
  if (item.target_vk_id == null) return null
  if (item.entity_type === 'leader') return `/leaders/${item.target_vk_id}`
  return `/staff/${item.target_vk_id}`
}

export function pageWindow(current: number, last: number): number[] {
  const span = 5
  let start = Math.max(1, current - Math.floor(span / 2))
  const end = Math.min(last, start + span - 1)
  start = Math.max(1, end - span + 1)
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
}

function ActivityActionLine({ item }: { item: ActivityLogItem }) {
  const extra = formatActivityDetail(item.detail, item.action)
  const verb = activityVerb(item.action, item.action_label)
  return (
    <p className="activity-action">
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
          {' '}
          <span className="activity-action-extra">{extra}</span>
        </>
      ) : null}
    </p>
  )
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
      <div className="activity-table-wrap">
        <table className="activity-table">
          <thead>
            <tr>
              <th scope="col" className="activity-col-date">
                Дата
              </th>
              <th scope="col">Действие</th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 ? (
              <tr>
                <td colSpan={2} className="activity-table-empty">
                  Загрузка…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={2} className="activity-table-empty">
                  {empty}
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const stamp = formatActivityStamp(item.created_at)
                return (
                  <tr key={item.id}>
                    <td className="activity-col-date">
                      <time dateTime={item.created_at} className="activity-stamp">
                        <span>{stamp.date}</span>
                        {stamp.time ? <span>{stamp.time}</span> : null}
                      </time>
                    </td>
                    <td>
                      <ActivityActionLine item={item} />
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
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
