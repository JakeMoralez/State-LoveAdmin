import { useEffect, useMemo, useState } from 'react'
import { History } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, type ActivityLogItem } from '../api'
import { PageHeader } from '../components/PageHeader'
import { PageSearch, PageToolbarRow } from '../components/ui/PageSearch'
import { Select } from '../components/ui/Select'
import { useAuth } from '../context/AuthContext'
import {
  ACTION_FILTER_OPTIONS,
  actionMatchesFilter,
  activityKind,
  activityVerb,
} from '../lib/activityLabels'
import { parseStaffNick } from '../lib/staff'

const PAGE_SIZE = 50

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatDetail(detail: Record<string, unknown>, action: string): string | null {
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

function activityLine(item: ActivityLogItem): string {
  const verb = activityVerb(item.action, item.action_label)
  const extra = formatDetail(item.detail, item.action)
  const target = item.target_name?.trim()
  return [verb, target, extra].filter(Boolean).join(' ')
}

function kindClass(tone: 'error' | 'warn' | 'info') {
  return `dev-log-level dev-log-level--${tone}`
}

function ActivityNick({ label }: { label: string }) {
  const { tag, name } = parseStaffNick(label)
  const tagText = tag?.replace(/^\[|\]$/g, '') ?? null
  return (
    <span className="activity-nick">
      {tagText ? <span className="activity-nick-tag">{tagText}</span> : null}
      <span className="activity-nick-name">{name}</span>
    </span>
  )
}

function ActivityCard({ item }: { item: ActivityLogItem }) {
  const [open, setOpen] = useState(false)
  const kind = activityKind(item.action)
  const targetPath =
    item.target_vk_id != null && item.entity_type === 'leader'
      ? `/leaders/${item.target_vk_id}`
      : item.target_vk_id != null
        ? `/staff/${item.target_vk_id}`
        : null

  return (
    <article className="dev-log-card">
      <button type="button" className="dev-log-card-head" onClick={() => setOpen((v) => !v)}>
        <span className={kindClass(kind.tone)}>{kind.label}</span>
        <span className="dev-log-source">
          <ActivityNick label={item.actor_name} />
        </span>
        <span className="dev-log-message">{activityLine(item)}</span>
        <time className="dev-log-time" dateTime={item.created_at}>
          {formatWhen(item.created_at)}
        </time>
      </button>
      {open && (
        <div className="dev-log-card-body">
          <div className="activity-log-meta">
            <div className="activity-log-meta-item">
              <span>Кто</span>
              <Link to={`/staff/${item.actor_vk_id}`} className="activity-log-meta-link">
                <ActivityNick label={item.actor_name} />
              </Link>
              <span className="activity-log-vk">{item.actor_vk_id}</span>
            </div>
            {item.target_name && item.target_vk_id != null && (
              <div className="activity-log-meta-item">
                <span>Кому</span>
                {targetPath ? (
                  <Link to={targetPath} className="activity-log-meta-link">
                    <ActivityNick label={item.target_name} />
                  </Link>
                ) : (
                  <ActivityNick label={item.target_name} />
                )}
                <span className="activity-log-vk">{item.target_vk_id}</span>
              </div>
            )}
            <div className="activity-log-meta-item">
              <span>Действие</span>
              <span className="activity-log-action">{activityVerb(item.action, item.action_label)}</span>
            </div>
          </div>
        </div>
      )}
    </article>
  )
}

export function ActivityLogPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<ActivityLogItem[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [q, setQ] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  const canView = (user?.access_level ?? 0) >= 2

  useEffect(() => {
    if (!canView) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    api
      .activityLog({
        q: q || undefined,
        group: actionFilter !== 'all' ? actionFilter : undefined,
        limit: PAGE_SIZE,
        offset,
      })
      .then((res) => {
        if (cancelled) return
        setItems(res.items)
        setTotal(res.total)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [actionFilter, canView, offset, q])

  const visibleItems = useMemo(
    () => items.filter((item) => actionMatchesFilter(item.action, actionFilter)),
    [actionFilter, items],
  )
  const filtered = Boolean(q) || actionFilter !== 'all'

  const onSearchChange = (value: string) => {
    setQ(value)
    setOffset(0)
  }

  const onActionFilterChange = (value: string) => {
    setActionFilter(value)
    setOffset(0)
  }

  const hasMore = offset + items.length < total
  const hasPrev = offset > 0

  const subtitle = canView
    ? total > 0
      ? `Назначения и правки на панели · ${total} записей`
      : 'Назначения и правки на панели'
    : undefined

  return (
    <div className="page-stack page-stack--activity">
      <PageHeader section="Команда" title="Журнал действий" subtitle={subtitle} icon={History} shrink />

      {!canView ? (
        <div className="page-empty-state page-empty-state--card">
          <p className="page-empty-state-title">Нет доступа</p>
          <p className="page-empty-state-hint">Журнал доступен с уровня Следящий (2)+.</p>
        </div>
      ) : (
        <>
          <PageToolbarRow className="activity-log-toolbar">
            <PageSearch variant="row" value={q} onChange={onSearchChange} placeholder="Поиск по имени…" />
            <Select
              className="activity-log-filter"
              value={actionFilter}
              onChange={onActionFilterChange}
              options={ACTION_FILTER_OPTIONS}
              placeholder="Действие"
            />
          </PageToolbarRow>

          <div className="page-body">
            <div className="dev-log-list">
              {loading && visibleItems.length === 0 && items.length === 0 ? (
                <div className="staff-registry-empty page-loading">Загрузка…</div>
              ) : visibleItems.length === 0 ? (
                <div className="staff-registry-empty">
                  {filtered ? 'Ничего не найдено. Измените поиск или фильтр.' : 'Записей пока нет'}
                </div>
              ) : (
                visibleItems.map((item) => <ActivityCard key={item.id} item={item} />)
              )}
            </div>

            {(hasPrev || hasMore) && (
              <div className="activity-pager">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={!hasPrev || loading}
                  onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                >
                  Назад
                </button>
                <span className="activity-pager-meta">
                  {offset + 1}–{offset + items.length} из {total}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={!hasMore || loading}
                  onClick={() => setOffset((o) => o + PAGE_SIZE)}
                >
                  Дальше
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
