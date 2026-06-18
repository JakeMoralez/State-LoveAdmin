import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Bug, RefreshCw, Trash2 } from 'lucide-react'
import { ApiError, api, type DevErrorItem } from '../api'

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
  const [items, setItems] = useState<DevErrorItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)

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

  const clearAll = async () => {
    if (!window.confirm('Очистить весь лог ошибок?')) return
    await api.clearDevErrors()
    await load()
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 page-enter">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[var(--accent-gold)] mb-1">
            <Bug size={18} />
            <span className="text-xs font-semibold uppercase tracking-wider">Developer</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Лог ошибок</h1>
          <p className="text-sm text-white/45 mt-1">
            Клиентские и серверные ошибки панели. Хранится последние {total} записей.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
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
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200 flex items-center gap-2">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      <div className="dev-log-list">
        {loading && items.length === 0 ? (
          <div className="text-white/35 text-sm py-12 text-center">Загрузка…</div>
        ) : items.length === 0 ? (
          <div className="text-white/35 text-sm py-12 text-center">Ошибок пока нет</div>
        ) : (
          items.map((item) => (
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
  )
}
