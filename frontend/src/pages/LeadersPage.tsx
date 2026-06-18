import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, Shield, Trash2 } from 'lucide-react'
import { api, ApiError, type LeaderMember } from '../api'
import { useAuth } from '../context/AuthContext'

type SortKey = 'index' | 'nickname' | 'faction'
type SortDir = 'asc' | 'desc'

const DEFAULT_AVATAR = 'https://vk.com/images/camera_100.png'

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown size={14} className="staff-sort-icon staff-sort-icon--idle" />
  return dir === 'asc' ? (
    <ArrowUp size={14} className="staff-sort-icon" />
  ) : (
    <ArrowDown size={14} className="staff-sort-icon" />
  )
}

function LeaderFactionCell({
  member,
  canEdit,
  onSaved,
}: {
  member: LeaderMember
  canEdit: boolean
  onSaved: (vkId: number, faction: string) => void
}) {
  const [value, setValue] = useState(member.faction ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setValue(member.faction ?? '')
  }, [member.faction])

  const save = async () => {
    const trimmed = value.trim()
    const current = (member.faction ?? '').trim()
    if (trimmed === current) return

    setSaving(true)
    setError(null)
    try {
      await api.updateLeaderFaction(member.vk_id, trimmed)
      onSaved(member.vk_id, trimmed)
    } catch (e: unknown) {
      const msg = e instanceof ApiError || e instanceof Error ? e.message : 'Ошибка сохранения'
      setError(msg)
      setValue(current)
    } finally {
      setSaving(false)
    }
  }

  if (!canEdit) {
    return <span>{member.faction || '—'}</span>
  }

  return (
    <div className="staff-discord-edit">
      <input
        type="text"
        className="control staff-discord-input w-full"
        placeholder="Фракция / организация"
        value={value}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
      />
      {error && <span className="staff-discord-error">{error}</span>}
    </div>
  )
}

export function LeadersPage() {
  const { user } = useAuth()
  const [members, setMembers] = useState<LeaderMember[]>([])
  const [total, setTotal] = useState(0)
  const [warning, setWarning] = useState<string | null>(null)
  const [canManage, setCanManage] = useState(false)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('index')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const [addRef, setAddRef] = useState('')
  const [addFaction, setAddFaction] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<number | null>(null)

  const canManageLeaders = canManage || Boolean(user?.can_manage_leaders)

  const load = useCallback(() => {
    setLoading(true)
    api
      .leaders({ q: q || undefined })
      .then((res) => {
        setMembers(res.members)
        setTotal(res.total)
        setWarning(res.warning ?? null)
        setCanManage(Boolean(res.can_manage))
      })
      .finally(() => setLoading(false))
  }, [q])

  useEffect(() => {
    load()
  }, [load])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = useMemo(() => {
    const list = [...members]
    const dir = sortDir === 'asc' ? 1 : -1

    list.sort((a, b) => {
      if (sortKey === 'index' || sortKey === 'nickname') {
        return (a.display_name || a.nickname).localeCompare(b.display_name || b.nickname, 'ru') * dir
      }
      return (a.faction || '—').localeCompare(b.faction || '—', 'ru') * dir
    })

    return list
  }, [members, sortKey, sortDir])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const ref = addRef.trim()
    if (!ref) return

    setAdding(true)
    setAddError(null)
    try {
      const isNumeric = /^\d+$/.test(ref)
      await api.addLeader({
        vk_id: isNumeric ? parseInt(ref, 10) : undefined,
        vk_ref: isNumeric ? undefined : ref,
        faction: addFaction.trim(),
      })
      setAddRef('')
      setAddFaction('')
      load()
    } catch (err: unknown) {
      setAddError(err instanceof ApiError || err instanceof Error ? err.message : 'Не удалось добавить')
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (vkId: number) => {
    if (!window.confirm('Снять лидера из реестра?')) return
    setRemovingId(vkId)
    try {
      await api.removeLeader(vkId)
      setMembers((prev) => prev.filter((m) => m.vk_id !== vkId))
      setTotal((t) => Math.max(0, t - 1))
    } catch (err: unknown) {
      window.alert(err instanceof ApiError || err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setRemovingId(null)
    }
  }

  const handleFactionSaved = (vkId: number, faction: string) => {
    setMembers((prev) =>
      prev.map((m) => (m.vk_id === vkId ? { ...m, faction: faction || null } : m)),
    )
  }

  const columns: { key: SortKey; label: string; className: string }[] = [
    { key: 'index', label: '#', className: 'staff-col-num' },
    { key: 'nickname', label: 'Ник', className: 'staff-col-nick' },
    { key: 'faction', label: 'Фракция / заметка', className: 'staff-col-sphere' },
  ]

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Shield size={22} className="text-[var(--accent-gold)]" />
            Лидеры
          </h1>
          <p className="page-subtitle">
            {total} в реестре · без следящих
            {canManageLeaders ? ' · можно добавлять и редактировать' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="search"
            placeholder="Поиск по нику или фракции…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="control w-56"
          />
        </div>
      </div>

      {canManageLeaders && (
        <form onSubmit={handleAdd} className="glass-card p-4 mb-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-white/45 block mb-1">VK ID или ссылка</label>
            <input
              type="text"
              className="control w-full"
              placeholder="123456789 или vk.com/id123456789"
              value={addRef}
              disabled={adding}
              onChange={(e) => setAddRef(e.target.value)}
            />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs text-white/45 block mb-1">Фракция (необязательно)</label>
            <input
              type="text"
              className="control w-full"
              placeholder="LSPD, EMS…"
              value={addFaction}
              disabled={adding}
              onChange={(e) => setAddFaction(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-gold btn-sm shrink-0" disabled={adding || !addRef.trim()}>
            <Plus size={14} />
            {adding ? 'Добавление…' : 'Добавить лидера'}
          </button>
          {addError && <p className="w-full text-sm text-red-400 m-0">{addError}</p>}
        </form>
      )}

      {warning && (
        <div className="glass-card p-4 mb-4 max-w-2xl text-amber-400/90 text-sm">{warning}</div>
      )}

      <div className={`staff-registry leaders-registry ${canManageLeaders ? 'leaders-registry--manage' : ''}`}>
        <div className="staff-registry-head leaders-registry-head">
          {columns.map((col) => (
            <button
              key={col.key}
              type="button"
              className={`staff-registry-th ${col.className}`}
              onClick={() => toggleSort(col.key)}
            >
              <span>{col.label}</span>
              <SortIcon active={sortKey === col.key} dir={sortDir} />
            </button>
          ))}
          {canManageLeaders && (
            <div className="staff-registry-th leaders-col-actions">
              <span>Действия</span>
            </div>
          )}
        </div>

        {loading ? (
          <div className="staff-registry-empty">Загрузка…</div>
        ) : sorted.length === 0 ? (
          <div className="staff-registry-empty">
            {canManageLeaders ? 'Добавьте первого лидера через форму выше' : 'Никого не найдено'}
          </div>
        ) : (
          <div className="staff-registry-body ll-scroll">
            {sorted.map((m, i) => (
              <div key={m.vk_id} className="staff-registry-row leaders-registry-row">
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
                  <span className="staff-badges">🛡</span>
                </div>
                <div className="staff-col-sphere">
                  <LeaderFactionCell
                    member={m}
                    canEdit={canManageLeaders}
                    onSaved={handleFactionSaved}
                  />
                </div>
                {canManageLeaders && (
                  <div className="leaders-col-actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm text-red-400/90"
                      disabled={removingId === m.vk_id}
                      onClick={() => void handleRemove(m.vk_id)}
                      title="Снять лидера"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
