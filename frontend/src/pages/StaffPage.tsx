import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { api, type StaffMember } from '../api'
import { StaffProfileModal } from '../components/staff/StaffProfileModal'
import { useAuth } from '../context/AuthContext'

type SortKey = 'index' | 'nickname' | 'role' | 'sphere'
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

function canManageStaffFields(user: { access_level?: number; panel_role?: string } | null): boolean {
  if (!user) return false
  const level = user.access_level ?? 0
  return level >= 7 || user.panel_role === 'owner' || user.panel_role === 'lead'
}

export function StaffPage() {
  const { user } = useAuth()
  const [members, setMembers] = useState<StaffMember[]>([])
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('index')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [profileMember, setProfileMember] = useState<StaffMember | null>(null)

  const canManageStaff = canManageStaffFields(user)
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
      return (a.sphere || '—').localeCompare(b.sphere || '—', 'ru') * dir
    })

    return list
  }, [members, sortKey, sortDir])

  const columns: { key: SortKey; label: string; className: string }[] = [
    { key: 'index', label: '#', className: 'staff-col-num' },
    { key: 'nickname', label: 'Ник', className: 'staff-col-nick' },
    { key: 'role', label: 'Доступ', className: 'staff-col-role' },
    { key: 'sphere', label: 'Сфера', className: 'staff-col-sphere' },
  ]

  const openProfile = (member: StaffMember) => setProfileMember(member)

  const profileCanEditDiscord =
    profileMember != null &&
    (canManageDiscord || profileMember.vk_id === user?.vk_id)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Следящие</h1>
          <p className="page-subtitle">
            {total} человек в реестре · нажмите на ник, чтобы открыть профиль
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
                  <button
                    type="button"
                    className="staff-nick staff-nick-btn link-gold"
                    onClick={() => openProfile(m)}
                  >
                    {m.display_name || m.nickname}
                  </button>
                  {m.badges.length > 0 && (
                    <span className="staff-badges">{m.badges.join(' ')}</span>
                  )}
                </div>
                <div className="staff-col-role">{m.access_role_title || m.access_level_name}</div>
                <div className="staff-col-sphere">{m.sphere || '—'}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <StaffProfileModal
        member={profileMember}
        open={profileMember != null}
        onClose={() => setProfileMember(null)}
        onSaved={loadStaff}
        canEditSphere={canManageStaff}
        canEditDiscord={profileCanEditDiscord}
      />
    </div>
  )
}
