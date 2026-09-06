import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { RefreshCw, Shield } from 'lucide-react'
import { api, ApiError, type LeadershipCandidate } from '../api'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/ui/Alert'
import { PageSearch, PageToolbarActions, PageToolbarRow } from '../components/ui/PageSearch'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

const DEFAULT_AVATAR = 'https://vk.com/images/camera_100.png'

export function DevLeadershipPage() {
  const { user, loading: authLoading } = useAuth()
  const { toast } = useToast()
  const [members, setMembers] = useState<LeadershipCandidate[]>([])
  const [total, setTotal] = useState(0)
  const [leadersCount, setLeadersCount] = useState(0)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyVkId, setBusyVkId] = useState<number | null>(null)
  const [onlyLeaders, setOnlyLeaders] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    api
      .devLeadership({ q: q || undefined })
      .then((res) => {
        setMembers(res.members)
        setTotal(res.total)
        setLeadersCount(res.leaders_count)
      })
      .catch((e: unknown) => {
        setError(e instanceof ApiError || e instanceof Error ? e.message : 'Ошибка загрузки')
      })
      .finally(() => setLoading(false))
  }, [q])

  useEffect(() => {
    load()
  }, [load])

  const visible = useMemo(() => {
    if (!onlyLeaders) return members
    return members.filter((m) => m.is_leader)
  }, [members, onlyLeaders])

  const patch = async (member: LeadershipCandidate, isLeader: boolean) => {
    setBusyVkId(member.vk_id)
    try {
      await api.updateDevLeadership(member.vk_id, { is_leader: isLeader })
      setMembers((prev) =>
        prev.map((m) => (m.vk_id === member.vk_id ? { ...m, is_leader: isLeader } : m)),
      )
      setLeadersCount((c) => {
        const was = member.is_leader
        if (was === isLeader) return c
        return isLeader ? c + 1 : Math.max(0, c - 1)
      })
    } catch (e: unknown) {
      toast(e instanceof ApiError || e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setBusyVkId(null)
    }
  }

  if (!authLoading && user && !user.can_dev_panel) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="page-stack">
      <PageHeader
        section="Разработка"
        title="Флаги руководства"
        icon={Shield}
        subtitle={`${total} пользователей в БД (без следящих) · ${leadersCount} в реестре «Руководство»`}
      />

      <PageToolbarRow>
        <PageSearch variant="row" value={q} onChange={setQ} placeholder="Поиск по нику или VK…" />
        <label className="ui-checkbox-label text-sm text-white/55 shrink-0">
          <input
            type="checkbox"
            className="ui-checkbox"
            checked={onlyLeaders}
            onChange={(e) => setOnlyLeaders(e.target.checked)}
          />
          <span className="ui-checkbox-box" />
          Только с флагом
        </label>
        <PageToolbarActions>
          <button type="button" className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Обновить
          </button>
        </PageToolbarActions>
      </PageToolbarRow>

      {error && <Alert>{error}</Alert>}

      {loading ? (
        <div className="page-loading">Загрузка…</div>
      ) : (
        <div className="staff-registry dev-leadership-table">
          <div className="staff-registry-head dev-leadership-head">
            <div className="staff-registry-th staff-col-num">#</div>
            <div className="staff-registry-th staff-col-nick">Ник</div>
            <div className="staff-registry-th dev-leadership-flag-col">Руководство</div>
          </div>

          {visible.length === 0 ? (
            <div className="staff-registry-empty">
              {q.trim() ? 'Никого не найдено. Измените поиск.' : 'Кандидатов пока нет.'}
            </div>
          ) : (
            <div className="staff-registry-body ll-scroll dev-leadership-body">
              {visible.map((m, i) => (
                <div key={m.vk_id} className="staff-registry-row dev-leadership-row">
                  <div className="staff-col-num">{i + 1}</div>
                  <div className="staff-col-nick">
                    <span className="staff-avatar-wrap">
                      <img
                        src={m.avatar_url || DEFAULT_AVATAR}
                        alt=""
                        className="staff-avatar"
                        loading="lazy"
                      />
                    </span>
                    <a
                      href={`https://vk.com/id${m.vk_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="staff-nick staff-nick-link no-underline"
                    >
                      {m.display_name || m.nickname}
                    </a>
                  </div>
                  <div className="dev-leadership-flag-col">
                    <label className="ui-checkbox-label dev-leader-toggle">
                      <input
                        type="checkbox"
                        className="ui-checkbox"
                        checked={m.is_leader}
                        disabled={busyVkId === m.vk_id}
                        onChange={(e) => void patch(m, e.target.checked)}
                      />
                      <span className="ui-checkbox-box" />
                      <span>{m.is_leader ? 'В реестре' : 'Нет'}</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
