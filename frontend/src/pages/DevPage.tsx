import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { AlertTriangle, Bug, CheckCircle2, RefreshCw, Trash2 } from 'lucide-react'
import { ApiError, api, type DevErrorItem } from '../api'
import { PageHeader } from '../components/PageHeader'
import { PageSearch } from '../components/ui/PageSearch'
import { useAuth } from '../context/AuthContext'
import { PageSkeleton } from '../components/ui/LoadingState'

function formatWhen(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function levelClass(level: string) {
  if (level === 'warn') return 'dev-log-level dev-log-level--warn'
  if (level === 'info') return 'dev-log-level dev-log-level--info'
  return 'dev-log-level dev-log-level--error'
}

export function DevPage() {
  const { user, loading: authLoading } = useAuth()
  const [items, setItems] = useState<DevErrorItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.devErrors()
      setItems(data.items)
      setTotal(data.total)
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : 'Не удалось загрузить лог')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const id = window.setInterval(() => void load(), 15000)
    return () => window.clearInterval(id)
  }, [load])

  const filteredItems = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return items
    return items.filter(
      (item) =>
        item.message.toLowerCase().includes(needle) ||
        item.source.toLowerCase().includes(needle) ||
        item.level.toLowerCase().includes(needle) ||
        (item.url ?? '').toLowerCase().includes(needle),
    )
  }, [items, q])

  const clearAll = async () => {
    if (!window.confirm('Очистить весь лог ошибок?')) return
    await api.clearDevErrors()
    await load()
  }

  if (!authLoading && user && !user.can_dev_panel) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="page-stack page-stack--dev">
      <PageHeader
        section="Разработка"
        title="Лог ошибок"
        icon={Bug}
        subtitle={`Клиентские и серверные ошибки панели · ${total} записей`}
        shrink
        actions={
          <>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : undefined} />
              Обновить
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm dev-btn-danger"
              onClick={() => void clearAll()}
            >
              <Trash2 size={15} />
              Очистить
            </button>
          </>
        }
      />

      {items.length > 0 && (
        <PageSearch value={q} onChange={setQ} placeholder="Поиск по сообщению, источнику или URL…" />
      )}

      <div className="page-body">
        {error && (
          <div className="alert-banner">
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        <div className="dev-log-list">
          {loading && items.length === 0 ? (
            <PageSkeleton variant="list" label="Загрузка журнала ошибок" />
          ) : items.length === 0 ? (
            <div className="page-empty-state page-empty-state--card">
              <CheckCircle2 size={32} strokeWidth={1.5} className="page-empty-state-icon" aria-hidden />
              <p className="page-empty-state-title">Ошибок пока нет</p>
              <p className="page-empty-state-hint">
                Записи появятся здесь автоматически при сбоях клиента или сервера
              </p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="page-empty-state page-empty-state--card">
              <p className="page-empty-state-title">Ничего не найдено</p>
              <p className="page-empty-state-hint">Измените поиск.</p>
            </div>
          ) : (
            filteredItems.map((item) => (
              <article key={item.id} className="dev-log-card">
                <button
                  type="button"
                  className="dev-log-card-head"
                  onClick={() => setExpanded((v) => (v === item.id ? null : item.id))}
                >
                  <span className={levelClass(item.level)}>{item.level}</span>
                  <span className="dev-log-source">{item.source}</span>
                  <span className="dev-log-message">{item.message}</span>
                  <span className="dev-log-time">{formatWhen(item.created_at)}</span>
                </button>
                {expanded === item.id && (
                  <div className="dev-log-card-body">
                    <div className="dev-log-meta">
                      {item.url && (
                        <div>
                          <span>URL</span>
                          <code>{item.url}</code>
                        </div>
                      )}
                      {item.method && (
                        <div>
                          <span>Method</span>
                          <code>{item.method}</code>
                        </div>
                      )}
                      {item.user_vk_id != null && (
                        <div>
                          <span>VK</span>
                          <code>{item.user_vk_id}</code>
                        </div>
                      )}
                    </div>
                    {item.stack && <pre className="dev-log-stack">{item.stack}</pre>}
                    {item.context && (
                      <pre className="dev-log-stack">{JSON.stringify(item.context, null, 2)}</pre>
                    )}
                  </div>
                )}
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
