import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { api, ApiError, type StaffMember } from '../api'
import { useAuth } from '../context/AuthContext'

type SortKey = 'index' | 'nickname' | 'role' | 'sphere' | 'discord'
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

function discordLabel(member: StaffMember): string {
  if (member.discord_display_name) return member.discord_display_name
  if (member.discord_username) return member.discord_username
  return member.discord_id ?? ''
}

function StaffDiscordCell({
  member,
  canEdit,
  onSaved,
}: {
  member: StaffMember
  canEdit: boolean
  onSaved: (vkId: number, discord_id: string | null) => void
}) {
  const [value, setValue] = useState(member.discord_id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setValue(member.discord_id ?? '')
  }, [member.discord_id])

  const save = async () => {
    const trimmed = value.trim()
    const current = member.discord_id ?? ''
    if (trimmed === current) return

    setSaving(true)
    setError(null)
    try {
      const res = await api.updateStaffDiscord(member.vk_id, trimmed || null)
      onSaved(member.vk_id, res.discord_id)
    } catch (e: unknown) {
      const msg = e instanceof ApiError || e instanceof Error ? e.message : 'Ошибка сохранения'
      setError(msg)
      setValue(current)
    } finally {
      setSaving(false)
    }
  }

  if (!canEdit) {
    if (!member.discord_id) return <span className="staff-discord-empty">—</span>
    return (
      <span className="staff-discord-read" title={member.discord_id}>
        {discordLabel(member)}
        <span className="staff-discord-id">{member.discord_id}</span>
      </span>
    )
  }

  return (
    <div className="staff-discord-edit">
      <input
        type="text"
        inputMode="numeric"
        className="control staff-discord-input"
        placeholder="Discord ID"
        value={value}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur()
          }
        }}
      />
      {error && <span className="staff-discord-error">{error}</span>}
    </div>
  )
}

export function StaffPage() {
  const { user } = useAuth()
  const [members, setMembers] = useState<StaffMember[]>([])
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('index')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const canManageDiscord = Boolean(user?.can_manage_discord_links)

  const loadStaff = useCallback(() => {
    setLoading(true)
    api
      .staff({ q: q || undefined })
      .then((res) => {
        setMembers(res.members)
        setTotal(res.total)
      })
      .finally(() => setLoading(false))
  }, [q])

  useEffect(() => {
    loadStaff()
  }, [loadStaff])

  const handleDiscordSaved = (vkId: number, discord_id: string | null) => {
    setMembers((prev) =>
      prev.map((m) => (m.vk_id === vkId ? { ...m, discord_id, discord_username: null, discord_display_name: null } : m)),
    )
  }

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'index' ? 'asc' : 'asc')
    }
  }

  const sorted = useMemo(() => {
    const list = [...members]
    const dir = sortDir === 'asc' ? 1 : -1

    list.sort((a, b) => {
      if (sortKey === 'index') {
        const lvl = b.access_level - a.access_level
        if (lvl !== 0) return lvl * dir
        return (a.display_name || a.nickname).localeCompare(b.display_name || b.nickname, 'ru') * dir
      }
      if (sortKey === 'nickname') {
        return (a.display_name || a.nickname).localeCompare(b.display_name || b.nickname, 'ru') * dir
      }
      if (sortKey === 'role') {
        const ar = (a.access_role_title || a.access_level_name).localeCompare(
          b.access_role_title || b.access_level_name,
          'ru',
        )
        return ar * dir
      }
      if (sortKey === 'discord') {
        return (a.discord_id || '').localeCompare(b.discord_id || '', 'ru') * dir
      }
      return (a.sphere || '—').localeCompare(b.sphere || '—', 'ru') * dir
    })

    return list
  }, [members, sortKey, sortDir])

  const columns: { key: SortKey; label: string; className: string }[] = [
    { key: 'index', label: '#', className: 'staff-col-num' },
    { key: 'nickname', label: 'Ник', className: 'staff-col-nick' },
    { key: 'role', label: 'Доступ', className: 'staff-col-role' },
    { key: 'sphere', label: 'Сфера', className: 'staff-col-sphere' },
    { key: 'discord', label: 'Discord', className: 'staff-col-discord' },
  ]

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Следящие</h1>
          <p className="page-subtitle">
            {total} человек в реестре
            {canManageDiscord ? ' · можно редактировать Discord ID' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="search"
            placeholder="Поиск по нику, VK или Discord…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="control w-56"
          />
        </div>
      </div>

      <div className="staff-registry">
        <div className="staff-registry-head">
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
        </div>

        {loading ? (
          <div className="staff-registry-empty">Загрузка…</div>
        ) : sorted.length === 0 ? (
          <div className="staff-registry-empty">Никого не найдено</div>
        ) : (
          <div className="staff-registry-body ll-scroll">
            {sorted.map((m, i) => (
              <div key={m.vk_id} className="staff-registry-row">
                <div className="staff-col-num">{sortKey === 'index' ? i + 1 : i + 1}</div>
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
                  {m.badges.length > 0 && (
                    <span className="staff-badges">{m.badges.join(' ')}</span>
                  )}
                </div>
                <div className="staff-col-role">{m.access_role_title || m.access_level_name}</div>
                <div className="staff-col-sphere">{m.sphere || '—'}</div>
                <div className="staff-col-discord">
                  <StaffDiscordCell
                    member={m}
                    canEdit={canManageDiscord}
                    onSaved={handleDiscordSaved}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
