import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Settings, UserPlus, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, ApiError, type StaffMember, type StaffMemberDetail } from '../api'
import { PageHeader } from '../components/PageHeader'
import { PageSearch, PageToolbarRow } from '../components/ui/PageSearch'
import { Alert } from '../components/ui/Alert'
import { Select } from '../components/ui/Select'
import { StaffProfileModal } from '../components/staff/StaffProfileModal'
import { useAuth } from '../context/AuthContext'
import { ACCESS_LEVEL_OPTIONS } from '../lib/accessLevels'
import { SPHERE_OPTIONS } from '../lib/spheres'
import { staffLabel } from '../lib/staff'

type StaffTab = 'active' | 'inactive'
type SortKey = 'index' | 'nickname' | 'role' | 'sphere'
type SortDir = 'asc' | 'desc'

const DEFAULT_AVATAR = 'https://vk.com/images/camera_100.png'

function staffSortRank(m: StaffMember): number {
  let rank = m.access_level * 10
  if (m.access_level === 2 && m.is_senior) rank += 1
  return rank
}

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
  const [levelFilter, setLevelFilter] = useState('')
  const [sphereFilter, setSphereFilter] = useState('')
  const [tab, setTab] = useState<StaffTab>('active')
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('index')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [settingsMember, setSettingsMember] = useState<StaffMemberDetail | null>(null)
  const [settingsLoadingVkId, setSettingsLoadingVkId] = useState<number | null>(null)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)

  const canAssign = (user?.access_level ?? 0) >= 3

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setListError(null)
    const req = tab === 'inactive' ? api.staffInactive({ q: q || undefined }) : api.staff({ q: q || undefined })
    req
      .then((res) => {
        if (cancelled) return
        setMembers(res.members)
        setTotal(res.total)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setMembers([])
        setTotal(0)
        setListError(e instanceof ApiError || e instanceof Error ? e.message : 'Не удалось загрузить реестр')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [q, reloadTick, tab])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = useMemo(() => {
    const list = members.filter((m) => {
      if (levelFilter && String(m.access_level) !== levelFilter) return false
      if (sphereFilter && !(m.spheres ?? []).includes(sphereFilter) && m.sphere !== sphereFilter) {
        return false
      }
      return true
    })
    const dir = sortDir === 'asc' ? 1 : -1

    list.sort((a, b) => {
      if (sortKey === 'index') {
        const rankDiff = staffSortRank(b) - staffSortRank(a)
        if (rankDiff !== 0) return rankDiff * dir
        return staffLabel(a).localeCompare(staffLabel(b), 'ru') * dir
      }
      if (sortKey === 'nickname') {
        return staffLabel(a).localeCompare(staffLabel(b), 'ru') * dir
      }
      if (sortKey === 'role') {
        const rankDiff = staffSortRank(b) - staffSortRank(a)
        if (rankDiff !== 0) return rankDiff * dir
        const ar = (a.access_role_title || a.access_level_name).localeCompare(
          b.access_role_title || b.access_level_name,
          'ru',
        )
        return ar * dir
      }
      return (a.sphere || '—').localeCompare(b.sphere || '—', 'ru') * dir
    })

    return list
  }, [members, sortKey, sortDir, levelFilter, sphereFilter])

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
        subtitle={
          tab === 'inactive'
            ? `${total} без доступа`
            : `${total} человек в реестре`
        }
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

      <div className="sphere-tabs" role="tablist" aria-label="Реестр следящих">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'active'}
          className={tab === 'active' ? 'sphere-tab sphere-tab--active' : 'sphere-tab'}
          onClick={() => setTab('active')}
        >
          В составе
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'inactive'}
          className={tab === 'inactive' ? 'sphere-tab sphere-tab--active' : 'sphere-tab'}
          onClick={() => setTab('inactive')}
        >
          Без доступа
        </button>
      </div>

      <PageToolbarRow className="staff-registry-toolbar">
        <PageSearch
          variant="row"
          value={q}
          onChange={setQ}
          placeholder="Поиск по нику, VK, Discord или заметке…"
        />
        <Select
          className="staff-registry-filter"
          value={levelFilter}
          onChange={setLevelFilter}
          options={[{ value: '', label: 'Все уровни' }, ...ACCESS_LEVEL_OPTIONS]}
        />
        <Select
          className="staff-registry-filter staff-registry-filter--sphere"
          value={sphereFilter}
          onChange={setSphereFilter}
          options={[
            { value: '', label: 'Все сферы' },
            ...SPHERE_OPTIONS.map((s) => ({ value: s.value, label: s.label })),
          ]}
        />
      </PageToolbarRow>

      {listError && <Alert className="shrink-0">{listError}</Alert>}
      {settingsError && <Alert className="shrink-0">{settingsError}</Alert>}

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
            <div className="staff-registry-empty">
              {q.trim() || levelFilter || sphereFilter
                ? 'Никого не найдено. Измените поиск или фильтры.'
                : tab === 'inactive'
                  ? 'Нет пользователей без доступа'
                  : 'В реестре пока никого нет.'}
            </div>
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
                    {tab === 'inactive' ? (
                      canAssign ? (
                        <Link
                          to={`/assign?type=staff&vk_id=${m.vk_id}`}
                          className="staff-settings-btn no-underline"
                          title="Назначить"
                          aria-label={`Назначить: ${staffLabel(m)}`}
                        >
                          <UserPlus size={15} />
                        </Link>
                      ) : null
                    ) : (
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
                    )}
                    {m.badges.length > 0 && (
                      <span className="staff-badges">{m.badges.join(' ')}</span>
                    )}
                  </div>
                  <div className="staff-col-role" title={m.access_role_title || m.access_level_name}>
                    {m.access_role_title || m.access_level_name}
                  </div>
                  <div className="staff-col-sphere" title={m.sphere || '—'}>
                    {m.sphere || '—'}
                  </div>
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
          setReloadTick((n) => n + 1)
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
