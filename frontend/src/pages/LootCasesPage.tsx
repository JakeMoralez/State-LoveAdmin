import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Gift, Plus, RefreshCw } from 'lucide-react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ApiError, api, type LootCase } from '../api'
import { PageHeader } from '../components/PageHeader'
import { ModalViewport } from '../components/ui/ModalViewport'
import { PageSearch, PageToolbarActions, PageToolbarRow } from '../components/ui/PageSearch'
import { useAuth } from '../context/AuthContext'

export function LootCasesPage() {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const [cases, setCases] = useState<LootCase[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    api
      .devCases()
      .then((res) => setCases(res.cases))
      .catch((e: unknown) => {
        setError(e instanceof ApiError || e instanceof Error ? e.message : 'Ошибка загрузки')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = cases.filter((c) => {
    const needle = q.trim().toLowerCase()
    if (!needle) return true
    return c.title.toLowerCase().includes(needle) || c.description.toLowerCase().includes(needle)
  })

  const createCase = async (e?: FormEvent) => {
    e?.preventDefault()
    const title = newTitle.trim()
    if (!title) {
      setCreateError('Укажите название кейса')
      return
    }
    setCreating(true)
    setCreateError(null)
    try {
      const created = await api.createDevCase({ title })
      setCreateOpen(false)
      setNewTitle('')
      navigate(`/dev/cases/${created.id}`)
    } catch (err: unknown) {
      setCreateError(err instanceof ApiError || err instanceof Error ? err.message : 'Не удалось создать кейс')
    } finally {
      setCreating(false)
    }
  }

  const openCreate = () => {
    setNewTitle('')
    setCreateError(null)
    setCreateOpen(true)
  }

  if (!authLoading && user && !user.can_dev_panel) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="page-stack">
      <PageHeader
        section="Разработка"
        title="Кейсы"
        icon={Gift}
        subtitle={`${cases.length} кейсов · прокрутка для лидеров`}
        actions={
          <button type="button" className="btn-primary btn-sm" onClick={openCreate} disabled={creating}>
            <Plus size={16} />
            Создать
          </button>
        }
      />

      <ModalViewport open={createOpen} onBackdropClick={() => setCreateOpen(false)}>
        <form
          onSubmit={(e) => void createCase(e)}
          className="glass-card modal-pop modal-card modal-card--sm relative z-10 w-full p-5 space-y-3"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="text-lg font-bold m-0 mb-1">Новый кейс</h2>
          <input
            className="control w-full"
            placeholder="Название"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            autoFocus
          />
          {createError && (
            <p className="text-red-400/90 text-sm m-0" role="alert">
              {createError}
            </p>
          )}
          <div className="flex gap-2 justify-end pt-1">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setCreateOpen(false)
                setCreateError(null)
              }}
            >
              Отмена
            </button>
            <button type="submit" className="btn-primary" disabled={creating || !newTitle.trim()}>
              {creating ? 'Создание…' : 'Создать'}
            </button>
          </div>
        </form>
      </ModalViewport>

      <PageToolbarRow>
        <PageSearch variant="row" value={q} onChange={setQ} placeholder="Поиск кейсов…" />
        <PageToolbarActions>
          <button type="button" className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Обновить
          </button>
        </PageToolbarActions>
      </PageToolbarRow>

      {error && <div className="glass-card glass-card-pad text-red-400 text-sm">{error}</div>}

      {loading ? (
        <div className="page-loading">Загрузка…</div>
      ) : filtered.length === 0 ? (
        <div className="glass-card glass-card-pad text-white/50 text-sm">Кейсов пока нет</div>
      ) : (
        <div className="case-list">
          {filtered.map((item) => (
            <Link key={item.id} to={`/dev/cases/${item.id}`} className="case-list-card glass-card">
              <div className="case-list-card-cover">
                {item.cover_image_url ? (
                  <img src={item.cover_image_url} alt="" />
                ) : (
                  <Gift size={28} className="text-white/25" />
                )}
              </div>
              <div className="case-list-card-body">
                <div className="case-list-card-title">{item.title}</div>
                {item.description && <div className="case-list-card-desc">{item.description}</div>}
                <div className="case-list-card-meta">
                  <span>{item.prize_count} призов</span>
                  {!item.is_active && <span className="case-list-badge case-list-badge--off">выкл</span>}
                  {item.can_spin && <span className="case-list-badge case-list-badge--ok">готов к спину</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
