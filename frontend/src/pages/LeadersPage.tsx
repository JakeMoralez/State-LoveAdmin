import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Shield } from 'lucide-react'
import { api, type LeaderMember } from '../api'

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

export function LeadersPage() {
  const [members, setMembers] = useState<LeaderMember[]>([])
  const [total, setTotal] = useState(0)
  const [warning, setWarning] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('index')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const load = useCallback(() => {
    setLoading(true)
    api
      .leaders({ q: q || undefined })
      .then((res) => {
        setMembers(res.members)
        setTotal(res.total)
        setWarning(res.warning ?? null)
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
      if (sortKey === 'index') {
        return (a.display_name || a.nickname).localeCompare(b.display_name || b.nickname, 'ru') * dir
      }
      if (sortKey === 'nickname') {
        return (a.display_name || a.nickname).localeCompare(b.display_name || b.nickname, 'ru') * dir
      }
      return (a.faction || '—').localeCompare(b.faction || '—', 'ru') * dir
    })

    return list
  }, [members, sortKey, sortDir])

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
            {total} лидеров в реестре · без следящих · из БД бота
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

      {warning && (
        <div className="glass-card p-4 mb-4 max-w-2xl text-amber-400/90 text-sm">{warning}</div>
      )}

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

        {loading ? (
          <div className="staff-registry-empty">Загрузка…</div>
        ) : sorted.length === 0 ? (
          <div className="staff-registry-empty">
            {warning ? 'Список недоступен' : 'Никого не найдено'}
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
                  {m.is_leader_flag && <span className="staff-badges">🛡</span>}
                </div>
                <div className="staff-col-sphere">{m.faction || '—'}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
