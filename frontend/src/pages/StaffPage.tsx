import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Settings, UserPlus, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, ApiError, type StaffMember, type StaffMemberDetail } from '../api'
import { PageHeader } from '../components/PageHeader'
import { PageSearch } from '../components/ui/PageSearch'
import { StaffProfileModal } from '../components/staff/StaffProfileModal'
import { useAuth } from '../context/AuthContext'
import { staffLabel } from '../lib/staff'

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

export function StaffPage() {
  const { user, refresh } = useAuth()
  const [members, setMembers] = useState<StaffMember[]>([])
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('index')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [settingsMember, setSettingsMember] = useState<StaffMemberDetail | null>(null)
  const [settingsLoadingVkId, setSettingsLoadingVkId] = useState<number | null>(null)
  const [settingsError, setSettingsError] = useState<string | null>(null)

  const canAssign = (user?.access_level ?? 0) >= 3

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
        return staffLabel(a).localeCompare(staffLabel(b), 'ru') * dir
      }
      if (sortKey === 'nickname') {
        return staffLabel(a).localeCompare(staffLabel(b), 'ru') * dir
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

  const openSettings = async (member: StaffMember) => {
    setSettingsError(null)
    setSettingsLoadingVkId(member.vk_id)
    try {
      const detail = await api.staffMember(member.vk_id)
      setSettingsMember(detail)
    } catch (e: unknown) {
      setSettingsError(e instanceof ApiError || e instanceof Error ? e.message : 'Не удалось открыть настройки')
    } finally {
      setSettingsLoadingVkId(null)
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        section="Команда"
        title="Следящие"
        icon={Users}
        subtitle={`${total} человек в реестре · ник — профиль, ⚙ — настройки`}
        shrink
        actions={
          canAssign ? (
            <Link to="/assign?type=staff" className="btn btn-gold btn-sm no-underline">
              <UserPlus className="h-4 w-4" />
              Назначить
            </Link>
          ) : undefined
        }
      />

      <PageSearch
        className="staff-page-search"
        value={q}
        onChange={setQ}
        placeholder="Поиск по нику, VK или Discord…"
      />

      {settingsError && (
        <p className="staff-settings-toast shrink-0" role="alert">
          {settingsError}
        </p>
      )}

      {loading ? (
        <div className="page-loading">Загрузка…</div>
      ) : (
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

          {sorted.length === 0 ? (
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
                    <Link
                      to={`/staff/${m.vk_id}`}
                      className="staff-nick staff-nick-btn staff-nick-link no-underline"
                    >
                      {staffLabel(m)}
                    </Link>
                    <button
                      type="button"
                      className="staff-settings-btn"
                      title="Настройки"
                      aria-label={`Настройки: ${staffLabel(m)}`}
                      disabled={settingsLoadingVkId === m.vk_id}
                      onClick={() => void openSettings(m)}
                    >
                      <Settings
                        size={15}
                        className={settingsLoadingVkId === m.vk_id ? 'animate-spin' : undefined}
                      />
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
      )}

      <StaffProfileModal
        member={settingsMember}
        open={settingsMember != null}
        onClose={() => setSettingsMember(null)}
        onSaved={(result) => {
          if (result?.removed) setSettingsMember(null)
          loadStaff()
          if (settingsMember?.vk_id === user?.vk_id) {
            void refresh()
          }
        }}
        permissions={
          settingsMember?.permissions ?? {
            edit_nickname: false,
            edit_access_level: false,
            edit_ca_access: false,
            edit_spheres: false,
            edit_sphere: false,
            edit_discord: false,
            edit_forum_account: false,
            revoke_staff_access: false,
            max_access_level: 0,
          }
        }
      />
    </div>
  )
}
