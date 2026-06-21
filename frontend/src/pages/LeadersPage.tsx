import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Settings, Shield } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, ApiError, type LeaderMember, type LeaderMemberDetail } from '../api'
import { PageHeader } from '../components/PageHeader'
import { PageSearch } from '../components/ui/PageSearch'
import { LeaderProfileModal } from '../components/staff/LeaderProfileModal'
import { staffLabel } from '../lib/staff'

type SortKey = 'index' | 'nickname' | 'position'
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

export function LeadersPage() {
  const [members, setMembers] = useState<LeaderMember[]>([])
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('index')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [settingsMember, setSettingsMember] = useState<LeaderMemberDetail | null>(null)
  const [settingsLoadingVkId, setSettingsLoadingVkId] = useState<number | null>(null)
  const [settingsError, setSettingsError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    api
      .leaders({ q: q || undefined })
      .then((res) => {
        setMembers(res.members)
        setTotal(res.total)
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
        return staffLabel(a).localeCompare(staffLabel(b), 'ru') * dir
      }
      return (a.position || '—').localeCompare(b.position || '—', 'ru') * dir
    })

    return list
  }, [members, sortKey, sortDir])

  const columns: { key: SortKey; label: string; className: string }[] = [
    { key: 'index', label: '#', className: 'staff-col-num' },
    { key: 'nickname', label: 'Ник', className: 'staff-col-nick' },
    { key: 'position', label: 'Должность', className: 'staff-col-position' },
  ]

  const openSettings = async (member: LeaderMember) => {
    setSettingsError(null)
    setSettingsLoadingVkId(member.vk_id)
    try {
      const detail = await api.leaderMember(member.vk_id)
      setSettingsMember(detail)
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
        title="Руководство"
        icon={Shield}
        subtitle={`${total} в реестре · ник — профиль, ⚙ — настройки`}
        shrink
      />

      <PageSearch
        className="leaders-page-search"
        value={q}
        onChange={setQ}
        placeholder="Поиск по нику, должности или заметке…"
      />

      {settingsError && (
        <p className="staff-settings-toast shrink-0" role="alert">
          {settingsError}
        </p>
      )}

      {loading ? (
        <div className="page-loading">Загрузка…</div>
      ) : (
        <div className="staff-registry leaders-registry">
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
            <div className="staff-registry-empty">Никого не найдено</div>
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
                    <Link
                      to={`/leaders/${m.vk_id}`}
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
                    <span className="staff-badges">🛡</span>
                  </div>
                  <div className="staff-col-position staff-col-readonly">{m.position || '—'}</div>
                </div>
              ))}
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
