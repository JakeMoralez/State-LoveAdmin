import { useCallback, useEffect, useMemo, useState } from 'react'
import { History } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, type ActivityLogItem } from '../api'
import { PageHeader } from '../components/PageHeader'
import { PageSearch } from '../components/ui/PageSearch'
import { useAuth } from '../context/AuthContext'

const PAGE_SIZE = 50

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

function formatDayKey(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const now = new Date()
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === now.getFullYear()
      ? { day: 'numeric', month: 'long' }
      : { day: 'numeric', month: 'long', year: 'numeric' }
  return d.toLocaleDateString('ru-RU', opts)
}

function groupByDay(items: ActivityLogItem[]): { day: string; items: ActivityLogItem[] }[] {
  const map = new Map<string, ActivityLogItem[]>()
  for (const item of items) {
    const day = formatDayKey(item.created_at)
    const list = map.get(day)
    if (list) list.push(item)
    else map.set(day, [item])
  }
  return Array.from(map.entries()).map(([day, dayItems]) => ({ day, items: dayItems }))
}

function formatDetail(detail: Record<string, unknown>, action: string): string | null {
  if (action === 'staff_update') {
    const bits: string[] = []
    const level = detail.access_level
    if (level && typeof level === 'object') {
      const ch = level as { from_name?: string; to_name?: string; from?: unknown; to?: unknown }
      const from = ch.from_name ?? ch.from
      const to = ch.to_name ?? ch.to
      if (from != null && to != null) bits.push(`уровень: ${from} → ${to}`)
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
  const title = detail.title
  if (typeof title === 'string' && title.trim()) return `«${title.trim()}»`
  const comment = detail.comment
  if (typeof comment === 'string' && comment.trim()) return comment.trim()
  const position = detail.position
  if (typeof position === 'string' && position.trim()) return position.trim()
  return null
}

function ActivityActors({ item }: { item: ActivityLogItem }) {
  const { actor_name, actor_vk_id, target_name, target_vk_id, action_label } = item
  const targetPath =
    target_vk_id != null && item.entity_type === 'leader'
      ? `/leaders/${target_vk_id}`
      : target_vk_id != null
        ? `/staff/${target_vk_id}`
        : null

  return (
    <p className="activity-row-text">
      <Link to={`/staff/${actor_vk_id}`} className="activity-row-link">
        {actor_name}
      </Link>
      <span className="activity-row-verb">{action_label}</span>
      {target_name && target_vk_id != null ? (
        <Link to={targetPath!} className="activity-row-link">
          {target_name}
        </Link>
      ) : null}
    </p>
  )
}

function ActivityRow({ item }: { item: ActivityLogItem }) {
  const detail = formatDetail(item.detail, item.action)

  return (
    <li className="activity-row">
      <time className="activity-row-time" dateTime={item.created_at}>
        {formatTime(item.created_at)}
      </time>
      <div className="activity-row-body">
        <ActivityActors item={item} />
        {detail ? <p className="activity-row-meta">{detail}</p> : null}
      </div>
    </li>
  )
}

function ActivityDayGroup({ day, items }: { day: string; items: ActivityLogItem[] }) {
  return (
    <li className="activity-day">
      <h2 className="activity-day-label">{day}</h2>
      <ul className="activity-rows">
        {items.map((item) => (
          <ActivityRow key={item.id} item={item} />
        ))}
      </ul>
    </li>
  )
}

export function ActivityLogPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<ActivityLogItem[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)

  const canView = (user?.access_level ?? 0) >= 2

  const load = useCallback(() => {
    if (!canView) {
      setLoading(false)
      return
    }
    setLoading(true)
    api
      .activityLog({ q: q || undefined, limit: PAGE_SIZE, offset })
      .then((res) => {
        setItems(res.items)
        setTotal(res.total)
      })
      .finally(() => setLoading(false))
  }, [canView, offset, q])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    setOffset(0)
  }, [q])

  const groups = useMemo(() => groupByDay(items), [items])
  const hasMore = offset + items.length < total
  const hasPrev = offset > 0

  const subtitle = canView
    ? total > 0
      ? `Назначения и правки на панели · ${total} записей`
      : 'Назначения и правки на панели'
    : undefined

  return (
    <div className="page-stack page-stack--activity">
      <PageHeader section="Команда" title="Журнал действий" subtitle={subtitle} icon={History} />

      {!canView ? (
        <div className="page-empty-state page-empty-state--card">
          <p className="page-empty-state-title">Нет доступа</p>
          <p className="page-empty-state-hint">Журнал доступен с уровня Следящий (2)+.</p>
        </div>
      ) : (
        <>
          <PageSearch
            value={q}
            onChange={setQ}
            placeholder="Поиск по имени или действию…"
            className="activity-log-search"
          />

          {loading && items.length === 0 ? (
            <div className="page-empty-state page-empty-state--card page-loading">Загрузка…</div>
          ) : items.length === 0 ? (
            <div className="page-empty-state page-empty-state--card">
              <p className="page-empty-state-title">{q ? 'Ничего не найдено' : 'Записей пока нет'}</p>
            </div>
          ) : (
            <div className="activity-log glass-card">
              <ul className="activity-feed">
                {groups.map((group) => (
                  <ActivityDayGroup key={group.day} day={group.day} items={group.items} />
                ))}
              </ul>
            </div>
          )}

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
        </>
      )}
    </div>
  )
}
