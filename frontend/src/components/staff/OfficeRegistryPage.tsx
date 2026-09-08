import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Settings, UserPlus, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ApiError, type LeaderMember, type LeaderMemberDetail } from '../../api'
import { PageHeader } from '../PageHeader'
import { PageSearch, PageToolbarRow } from '../ui/PageSearch'
import { Alert } from '../ui/Alert'
import { Select } from '../ui/Select'
import { LeaderProfileModal } from './LeaderProfileModal'
import { useAuth } from '../../context/AuthContext'
import { canOpenLeaderSettings } from '../../lib/accessLevels'
import { inferLeadershipFromNickname, resolveLeadershipSphere } from '../../lib/leaderNickname'
import { SPHERE_OPTIONS, formatSpheresDisplay } from '../../lib/spheres'
import { staffLabel } from '../../lib/staff'
import { PageSkeleton } from '../ui/LoadingState'

function memberSphere(m: LeaderMember): string | null {
  const nick = m.bot_nickname || m.nickname
  const org = inferLeadershipFromNickname(nick).orgTag?.toLowerCase()
  if (
    m.is_judge ||
    org === 'judge' ||
    org === 'speaker' ||
    org === 'vice-speaker'
  ) {
    return 'central_apparatus'
  }
  return m.sphere ?? resolveLeadershipSphere(nick)
}

function memberPosition(m: LeaderMember): string {
  return (
    m.position?.trim() ||
    inferLeadershipFromNickname(m.bot_nickname || m.nickname).position ||
    ''
  )
}

type OfficeTab = 'active' | 'inactive'
type SortKey = 'index' | 'nickname' | 'position' | 'sphere'
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

export function OfficeRegistryPage({
  title,
  icon: Icon,
  badge,
  profilePath,
  assignType,
  list,
  loadOne,
  sphereFilter = false,
}: {
  title: string
  icon: LucideIcon
  badge: string
  profilePath: string
  assignType: string
  list: (params?: { q?: string; inactive?: boolean }) => Promise<{ members: LeaderMember[]; total: number }>
  loadOne: (vkId: number) => Promise<LeaderMemberDetail>
  sphereFilter?: boolean
}) {
  const { user } = useAuth()
  const actorLevel = user?.access_level ?? 0
  const actorVkId = user?.vk_id ?? 0
  const [members, setMembers] = useState<LeaderMember[]>([])
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const [sphere, setSphere] = useState('')
  const [tab, setTab] = useState<OfficeTab>('active')
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('index')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [settingsMember, setSettingsMember] = useState<LeaderMemberDetail | null>(null)
  const [settingsLoadingVkId, setSettingsLoadingVkId] = useState<number | null>(null)
  const [settingsError, setSettingsError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    list({ q: q || undefined, inactive: tab === 'inactive' })
      .then((res) => {
        setMembers(res.members)
        setTotal(res.total)
      })
      .finally(() => setLoading(false))
  }, [q, tab, list])

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
    const rows = members.filter((m) => {
      if (!sphereFilter || !sphere) return true
      const member = memberSphere(m)
      if (sphere === '_none') return !member
      return member === sphere
    })
    const dir = sortDir === 'asc' ? 1 : -1
    rows.sort((a, b) => {
      if (sortKey === 'index' || sortKey === 'nickname') {
        return staffLabel(a).localeCompare(staffLabel(b), 'ru') * dir
      }
      if (sortKey === 'sphere') {
        const as = memberSphere(a)
        const bs = memberSphere(b)
        return formatSpheresDisplay(as ? [as] : []).localeCompare(
          formatSpheresDisplay(bs ? [bs] : []),
          'ru',
        ) * dir
      }
      return (memberPosition(a) || '—').localeCompare(memberPosition(b) || '—', 'ru') * dir
    })
    return rows
  }, [members, sortKey, sortDir, sphere, sphereFilter])

  const columns: { key: SortKey; label: string; className: string }[] = [
    { key: 'index', label: '#', className: 'staff-col-num' },
    { key: 'nickname', label: 'Ник', className: 'staff-col-nick' },
    { key: 'position', label: 'Должность', className: 'staff-col-position' },
    ...(sphereFilter
      ? [{ key: 'sphere' as const, label: 'Сфера', className: 'staff-col-sphere' }]
      : []),
  ]

  const canAssign = actorLevel >= 2

  const openSettings = async (member: LeaderMember) => {
    setSettingsError(null)
    setSettingsLoadingVkId(member.vk_id)
    try {
      setSettingsMember(await loadOne(member.vk_id))
    } catch (e: unknown) {
      setSettingsError(
        e instanceof ApiError || e instanceof Error ? e.message : 'Не удалось открыть настройки',
      )
    } finally {
      setSettingsLoadingVkId(null)
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        section="Команда"
        title={title}
        icon={Icon}
        subtitle={tab === 'inactive' ? `${total} без доступа` : `${total} в реестре`}
        shrink
        actions={
          canAssign ? (
            <Link to={`/assign?type=${assignType}`} className="btn btn-gold btn-sm no-underline">
              <UserPlus className="h-4 w-4" />
              Назначить
            </Link>
          ) : undefined
        }
      />

      <div className="sphere-tabs" role="tablist" aria-label={title}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'active'}
          className={tab === 'active' ? 'sphere-tab sphere-tab--active' : 'sphere-tab'}
          onClick={() => setTab('active')}
        >
          В реестре
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

      {sphereFilter ? (
        <PageToolbarRow className="staff-registry-toolbar leaders-page-search">
          <PageSearch
            variant="row"
            value={q}
            onChange={setQ}
            placeholder="Поиск по нику, должности или заметке…"
          />
          <Select
            className="staff-registry-filter staff-registry-filter--sphere"
            value={sphere}
            onChange={setSphere}
            options={[
              { value: '', label: 'Все сферы' },
              ...SPHERE_OPTIONS.filter((s) => s.value !== 'server').map((s) => ({
                value: s.value,
                label: s.label,
              })),
              { value: '_none', label: 'Без сферы' },
            ]}
          />
        </PageToolbarRow>
      ) : (
        <PageSearch
          className="leaders-page-search"
          value={q}
          onChange={setQ}
          placeholder="Поиск по нику, должности или заметке…"
        />
      )}

      {settingsError && <Alert className="shrink-0">{settingsError}</Alert>}

      {loading ? (
        <PageSkeleton variant="registry" label="Загрузка реестра" />
      ) : (
        <div className={`staff-registry leaders-registry${sphereFilter ? ' leaders-registry--spheres' : ''}`}>
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
          </div>

          {sorted.length === 0 ? (
            <div className="staff-registry-empty">
              {q.trim() || sphere
                ? 'Никого не найдено. Измените поиск или сферу.'
                : tab === 'inactive'
                  ? 'Нет пользователей без доступа'
                  : 'В реестре пока никого нет.'}
            </div>
          ) : (
            <div className="staff-registry-body ll-scroll">
              {sorted.map((m, i) => {
                const rowSphere = memberSphere(m)
                return (
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
                    <Link
                      to={`${profilePath}/${m.vk_id}`}
                      className="staff-nick staff-nick-btn staff-nick-link no-underline"
                    >
                      {staffLabel(m)}
                    </Link>
                    {tab === 'inactive' && canAssign ? (
                      <Link
                        to={`/assign?type=${assignType}&vk_id=${m.vk_id}`}
                        className="staff-settings-btn no-underline"
                        title="Назначить"
                      >
                        <UserPlus size={15} />
                      </Link>
                    ) : null}
                    {canOpenLeaderSettings(actorLevel, actorVkId, m.vk_id) && (
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
                    <span className="staff-badges">{badge}</span>
                  </div>
                  <div className="staff-col-position staff-col-readonly" title={memberPosition(m) || '—'}>
                    {memberPosition(m) || '—'}
                  </div>
                  {sphereFilter ? (
                    <div
                      className="staff-col-sphere staff-col-readonly"
                      title={rowSphere ? formatSpheresDisplay([rowSphere]) : '—'}
                    >
                      {rowSphere ? formatSpheresDisplay([rowSphere]) : '—'}
                    </div>
                  ) : null}
                </div>
              )
              })}
            </div>
          )}
        </div>
      )}

      <LeaderProfileModal
        member={settingsMember}
        open={settingsMember != null}
        onClose={() => setSettingsMember(null)}
        onSaved={(result) => {
          if (result?.removed) setSettingsMember(null)
          load()
        }}
      />
    </div>
  )
}
