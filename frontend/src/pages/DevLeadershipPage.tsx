import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { RefreshCw, Shield } from 'lucide-react'
import { api, ApiError, type LeadershipCandidate } from '../api'
import { useAuth } from '../context/AuthContext'

const DEFAULT_AVATAR = 'https://vk.com/images/camera_100.png'

export function DevLeadershipPage() {
  const { user, loading: authLoading } = useAuth()
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

  const patch = async (member: LeadershipCandidate, patchData: { is_leader: boolean; faction?: string }) => {
    setBusyVkId(member.vk_id)
    try {
      await api.updateDevLeadership(member.vk_id, {
        is_leader: patchData.is_leader,
        faction: patchData.faction ?? member.faction ?? '',
      })
      setMembers((prev) =>
        prev.map((m) =>
          m.vk_id === member.vk_id
            ? {
                ...m,
                is_leader: patchData.is_leader,
                faction: patchData.faction ?? m.faction,
              }
            : m,
        ),
      )
      setLeadersCount((c) => {
        const was = member.is_leader
        const now = patchData.is_leader
        if (was === now) return c
        return now ? c + 1 : Math.max(0, c - 1)
      })
    } catch (e: unknown) {
      window.alert(e instanceof ApiError || e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setBusyVkId(null)
    }
  }

  if (!authLoading && user && !user.can_manage_leaders) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 page-enter">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[var(--accent-gold)] mb-1">
            <Shield size={18} />
            <span className="text-xs font-semibold uppercase tracking-wider">Разработка</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Флаги руководства</h1>
          <p className="text-sm text-white/45 mt-1">
            {total} пользователей в БД (без следящих) · {leadersCount} в реестре «Руководство»
          </p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Обновить
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Поиск по нику, VK или фракции…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="control w-72"
        />
        <label className="flex items-center gap-2 text-sm text-white/55 cursor-pointer">
          <input
            type="checkbox"
            checked={onlyLeaders}
            onChange={(e) => setOnlyLeaders(e.target.checked)}
            className="accent-[var(--accent-gold)]"
          />
          Только с флагом
        </label>
      </div>

      {error && <div className="glass-card p-4 text-red-400 text-sm">{error}</div>}

      <div className="staff-registry dev-leadership-table">
        <div className="staff-registry-head dev-leadership-head">
          <div className="staff-registry-th staff-col-num">#</div>
          <div className="staff-registry-th staff-col-nick">Ник</div>
          <div className="staff-registry-th staff-col-sphere">Фракция</div>
          <div className="staff-registry-th dev-leadership-flag-col">Руководство</div>
        </div>

        {loading && visible.length === 0 ? (
          <div className="staff-registry-empty">Загрузка…</div>
        ) : visible.length === 0 ? (
          <div className="staff-registry-empty">Никого не найдено</div>
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
                    className="staff-nick link-gold"
                  >
                    {m.display_name || m.nickname}
                  </a>
                  <span className="text-[10px] text-white/25 ml-1">#{m.vk_id}</span>
                </div>
                <div className="staff-col-sphere">
                  <input
                    type="text"
                    className="control staff-discord-input w-full"
                    placeholder="Фракция…"
                    value={m.faction ?? ''}
                    disabled={busyVkId === m.vk_id || !m.is_leader}
                    onChange={(e) =>
                      setMembers((prev) =>
                        prev.map((row) =>
                          row.vk_id === m.vk_id ? { ...row, faction: e.target.value } : row,
                        ),
                      )
                    }
                    onBlur={(e) => {
                      if (!m.is_leader) return
                      void patch(m, { is_leader: true, faction: e.target.value.trim() })
                    }}
                  />
                </div>
                <div className="dev-leadership-flag-col">
                  <label className="dev-leader-toggle">
                    <input
                      type="checkbox"
                      checked={m.is_leader}
                      disabled={busyVkId === m.vk_id}
                      onChange={(e) =>
                        void patch(m, { is_leader: e.target.checked, faction: m.faction ?? '' })
                      }
                    />
                    <span>{m.is_leader ? 'Да' : 'Нет'}</span>
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
