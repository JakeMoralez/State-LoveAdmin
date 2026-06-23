import { useCallback, useEffect, useState } from 'react'
import { History } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, type ActivityLogItem } from '../api'
import { PageHeader } from '../components/PageHeader'
import { PageSearch } from '../components/ui/PageSearch'
import { useAuth } from '../context/AuthContext'

const PAGE_SIZE = 50

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function ActivityMessage({ item }: { item: ActivityLogItem }) {
  const { message, actor_name, actor_vk_id, target_name, target_vk_id } = item
  if (!target_name || target_vk_id == null || !message.includes(target_name)) {
    return <span>{message}</span>
  }

  const afterActor = message.slice(actor_name.length)
  const targetIdx = afterActor.indexOf(target_name)
  if (targetIdx < 0) return <span>{message}</span>

  const beforeTarget = afterActor.slice(0, targetIdx)
  const afterTarget = afterActor.slice(targetIdx + target_name.length)
  const targetPath = item.entity_type === 'leader' ? `/leaders/${target_vk_id}` : `/staff/${target_vk_id}`

  return (
    <span>
      <Link to={`/staff/${actor_vk_id}`} className="activity-log-link">
        {actor_name}
      </Link>
      {beforeTarget}
      <Link to={targetPath} className="activity-log-link">
        {target_name}
      </Link>
      {afterTarget}
    </span>
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

  const hasMore = offset + items.length < total
  const hasPrev = offset > 0

  return (
    <div className="page-stack page-stack--activity">
      <PageHeader
        section="Команда"
        title="Журнал действий"
        subtitle="Кто и что сделал на панели: назначения, изменения карточек, снятие доступа."
        icon={History}
      />

      {!canView ? (
        <p className="activity-log-muted">Журнал доступен с уровня Следящий (2)+.</p>
      ) : (
        <>
          <PageSearch
            value={q}
            onChange={setQ}
            placeholder="Поиск по имени или действию…"
            className="activity-log-search"
          />

          {loading && items.length === 0 ? (
            <p className="activity-log-muted">Загрузка…</p>
          ) : items.length === 0 ? (
            <p className="activity-log-muted">Записей пока нет.</p>
          ) : (
            <ul className="activity-log-list">
              {items.map((item) => (
                <li key={item.id} className="activity-log-item">
                  <time className="activity-log-time" dateTime={item.created_at}>
                    {formatWhen(item.created_at)}
                  </time>
                  <p className="activity-log-message">
                    <ActivityMessage item={item} />
                  </p>
                </li>
              ))}
            </ul>
          )}

          {(hasPrev || hasMore) && (
            <div className="activity-log-pager">
              <button
                type="button"
                className="btn btn--ghost"
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
                className="btn btn--ghost"
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
