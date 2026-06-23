import { useCallback, useEffect, useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  ClipboardList,
  FolderKanban,
  Gavel,
  History,
  Library,
  Shield,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, type ActivityLogItem } from '../api'
import { PageHeader } from '../components/PageHeader'
import { PageSearch } from '../components/ui/PageSearch'
import { useAuth } from '../context/AuthContext'
import { cn } from '../lib/utils'

const PAGE_SIZE = 50

type ActionTone = 'gold' | 'success' | 'danger' | 'violet' | 'cyan' | 'muted'

interface ActionMeta {
  tone: ActionTone
  Icon: LucideIcon
}

function actionMeta(action: string): ActionMeta {
  if (action === 'staff_revoke' || action === 'leader_remove') {
    return { tone: 'danger', Icon: UserMinus }
  }
  if (action.includes('assign') || action === 'staff_assign') {
    return { tone: 'success', Icon: UserPlus }
  }
  if (action.startsWith('leader_') || action === 'judge_assign' || action === 'congress_assign') {
    return { tone: 'violet', Icon: Shield }
  }
  if (action.startsWith('qb_')) {
    return { tone: 'cyan', Icon: Library }
  }
  if (action.startsWith('task_')) {
    return { tone: 'muted', Icon: ClipboardList }
  }
  if (action.startsWith('project_')) {
    return { tone: 'muted', Icon: FolderKanban }
  }
  if (action.includes('judge') || action.includes('forum')) {
    return { tone: 'violet', Icon: Gavel }
  }
  if (action.startsWith('staff_')) {
    return { tone: 'gold', Icon: Users }
  }
  return { tone: 'gold', Icon: History }
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

function formatDayKey(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
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
    <p className="activity-log-actors">
      <Link to={`/staff/${actor_vk_id}`} className="activity-log-person">
        {actor_name}
      </Link>
      <span className="activity-log-verb">{action_label}</span>
      {target_name && target_vk_id != null ? (
        <Link to={targetPath!} className="activity-log-person activity-log-person--target">
          {target_name}
        </Link>
      ) : null}
    </p>
  )
}

function ActivityDayGroup({ day, items }: { day: string; items: ActivityLogItem[] }) {
  return (
    <li className="activity-log-day">
      <h2 className="activity-log-day-title">{day}</h2>
      <ol className="activity-log-day-events">
        {items.map((item) => {
          const { tone, Icon } = actionMeta(item.action)
          const detail = formatDetail(item.detail, item.action)
          return (
            <li key={item.id} className={cn('activity-log-event', `activity-log-event--${tone}`)}>
              <span className="activity-log-event-icon" aria-hidden>
                <Icon size={14} strokeWidth={2} />
              </span>
              <div className="activity-log-event-body">
                <div className="activity-log-event-head">
                  <time className="activity-log-event-time" dateTime={item.created_at}>
                    {formatTime(item.created_at)}
                  </time>
                  <span className={cn('activity-log-badge', `activity-log-badge--${tone}`)}>
                    {item.action_label}
                  </span>
                </div>
                <ActivityActors item={item} />
                {detail ? <p className="activity-log-detail">{detail}</p> : null}
              </div>
            </li>
          )
        })}
      </ol>
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

  return (
    <div className="page-stack page-stack--activity">
      <PageHeader
        section="Команда"
        title="Журнал действий"
        subtitle="Назначения, правки карточек и снятие доступа на панели."
        icon={History}
        hint={
          canView && total > 0 ? (
            <span className="activity-log-total">{total} записей в журнале</span>
          ) : undefined
        }
      />

      {!canView ? (
        <div className="activity-log-empty glass-card">
          <History size={28} className="activity-log-empty-icon" aria-hidden />
          <p>Журнал доступен с уровня Следящий (2)+.</p>
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
            <div className="page-loading">Загрузка…</div>
          ) : items.length === 0 ? (
            <div className="activity-log-empty glass-card">
              <History size={28} className="activity-log-empty-icon" aria-hidden />
              <p>{q ? 'Ничего не найдено.' : 'Записей пока нет.'}</p>
            </div>
          ) : (
            <div className="activity-log-panel glass-card">
              <ul className="activity-log-timeline">
                {groups.map((group) => (
                  <ActivityDayGroup key={group.day} day={group.day} items={group.items} />
                ))}
              </ul>
            </div>
          )}

          {(hasPrev || hasMore) && (
            <div className="activity-log-pager">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={!hasPrev || loading}
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
              >
                Назад
              </button>
              <span className="activity-log-pager-meta">
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
