import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ClipboardCheck, Columns3, RefreshCw, Settings, UserRound } from 'lucide-react'
import { ApiError, api } from '../api'
import { ChecklistSettingsModal } from '../components/checklist/ChecklistSettingsModal'
import { ChecklistCellEditor } from '../components/checklist/ChecklistCellEditor'
import { PageHeader } from '../components/PageHeader'

function mondayOf(d: Date): string {
  const x = new Date(d)
  const day = x.getDay()
  const diff = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + diff)
  const y = x.getFullYear()
  const m = String(x.getMonth() + 1).padStart(2, '0')
  const dayStr = String(x.getDate()).padStart(2, '0')
  return `${y}-${m}-${dayStr}`
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dayStr = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dayStr}`
}

function formatWeekRu(start: string, end: string) {
  const fmt = (iso: string) => {
    const [, mo, day] = iso.split('-')
    return `${day}.${mo}.${iso.slice(0, 4)}`
  }
  return `${fmt(start)} — ${fmt(end)}`
}

type ChecklistData = Awaited<ReturnType<typeof api.checklist>>
type ChecklistRow = ChecklistData['rows'][number]
type ViewMode = 'all' | 'single'

export function ChecklistPage() {
  const [week, setWeek] = useState(() => mondayOf(new Date()))
  const [data, setData] = useState<ChecklistData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'tasks' | 'members'>('tasks')
  const [activeMemberId, setActiveMemberId] = useState<number | null>(null)
  const [enablingSelf, setEnablingSelf] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('sl-checklist-view') as ViewMode | null
    if (saved === 'all' || saved === 'single') return saved
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) return 'single'
    return 'all'
  })

  const setMode = (mode: ViewMode) => {
    setViewMode(mode)
    localStorage.setItem('sl-checklist-view', mode)
  }

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    api
      .checklist(week)
      .then((res) => {
        setData(res)
      })
      .catch((e: unknown) => {
        setData(null)
        if (e instanceof ApiError) {
          if (e.status === 404) {
            setError('Эндпоинт чеклиста не найден — перезапустите backend (API на :8012).')
          } else {
            setError(e.message || `Ошибка ${e.status}`)
          }
        } else {
          setError('Не удалось загрузить чеклист. Проверьте, что API запущен.')
        }
      })
      .finally(() => setLoading(false))
  }, [week])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!data?.members.length) return
    const mine = data.current_vk_id
    const hasMine = mine != null && data.members.some((m) => m.vk_id === mine)
    setActiveMemberId((prev) => {
      if (prev != null && data.members.some((m) => m.vk_id === prev)) return prev
      if (hasMine) return mine!
      return data.members[0].vk_id
    })
  }, [data])

  const grouped = useMemo(() => {
    if (!data) return []
    const days: { day_offset: number; day_label: string; rows: ChecklistRow[] }[] = []
    for (let i = 0; i < 7; i++) {
      days.push({
        day_offset: i,
        day_label: data.rows.find((r) => r.day_offset === i)?.day_label ?? `День ${i}`,
        rows: data.rows.filter((r) => r.day_offset === i),
      })
    }
    return days
  }, [data])

  const activeMember = data?.members.find((m) => m.vk_id === activeMemberId) ?? null
  const hasMyColumn = Boolean(
    data?.current_vk_id && data.members.some((m) => m.vk_id === data.current_vk_id),
  )

  const saveCell = async (
    day_offset: number,
    task_slug: string,
    member_vk_id: number,
    patch: { proof_urls?: string[]; proof_url?: string | null; proof_note?: string; proof_video_url?: string | null },
  ) => {
    await api.updateChecklistCell({
      week,
      day_offset,
      task_slug,
      member_vk_id,
      ...patch,
    })
    load()
  }

  const enableMyColumn = async () => {
    setEnablingSelf(true)
    try {
      try {
        await api.checklistMembersOnlyMe()
      } catch (e: unknown) {
        if (e instanceof ApiError && e.status === 404 && data?.current_vk_id) {
          await api.updateChecklistMembers({ vk_ids: [data.current_vk_id] })
        } else {
          throw e
        }
      }
      load()
    } catch (e: unknown) {
      window.alert(e instanceof ApiError || e instanceof Error ? e.message : 'Не удалось включить колонку')
    } finally {
      setEnablingSelf(false)
    }
  }

  return (
    <div className="content-fixed page-stack page-stack--checklist">
      <PageHeader
        section="Работа"
        title="Чеклист недели"
        icon={ClipboardCheck}
        className="page-header--checklist"
        shrink
        hint={
          data?.is_locked
            ? 'Прошлая неделя зафиксирована — состав и задачи не меняются'
            : undefined
        }
      />

      <div className="checklist-control-panel shrink-0">
        <div className="checklist-control-row checklist-control-row--primary">
          <div className="checklist-control-start">
            {!loading && !error && data && data.members.length > 0 && (
              <div className="checklist-mode-bar">
                {data.can_edit_all && (
                  <>
                    <button
                      type="button"
                      className="checklist-mode-btn checklist-mode-btn--icon"
                      title="Настройки"
                      aria-label="Настройки"
                      onClick={() => {
                        setSettingsTab('tasks')
                        setSettingsOpen(true)
                      }}
                    >
                      <Settings size={14} />
                    </button>
                    <span className="checklist-mode-divider" aria-hidden />
                  </>
                )}
                <button
                  type="button"
                  className={`checklist-mode-btn ${viewMode === 'all' ? 'checklist-mode-btn--active' : ''}`}
                  onClick={() => setMode('all')}
                  title="Все колонки"
                >
                  <Columns3 size={14} />
                  Все
                </button>
                <button
                  type="button"
                  className={`checklist-mode-btn ${viewMode === 'single' ? 'checklist-mode-btn--active' : ''}`}
                  onClick={() => setMode('single')}
                  title="По одному следящему"
                >
                  <UserRound size={14} />
                  Один
                </button>
              </div>
            )}
            {data?.can_edit_all && (!data || data.members.length === 0) && !loading && !error && (
              <button
                type="button"
                className="checklist-mode-btn checklist-mode-btn--icon checklist-mode-bar--solo"
                title="Настройки"
                aria-label="Настройки"
                onClick={() => {
                  setSettingsTab('tasks')
                  setSettingsOpen(true)
                }}
              >
                <Settings size={14} />
              </button>
            )}
          </div>

          <div className="checklist-control-center">
            <div className="checklist-week-nav">
              <button
                type="button"
                className="checklist-week-btn"
                aria-label="Предыдущая неделя"
                onClick={() => setWeek((w) => addDays(w, -7))}
              >
                <ChevronLeft size={15} />
              </button>
              <span className="checklist-week-label">
                {data ? formatWeekRu(data.week_start, data.week_end) : week}
              </span>
              <button
                type="button"
                className="checklist-week-btn"
                aria-label="Следующая неделя"
                onClick={() => setWeek((w) => addDays(w, 7))}
              >
                <ChevronRight size={15} />
              </button>
              <button
                type="button"
                className="checklist-week-btn"
                aria-label="Обновить"
                onClick={load}
                disabled={loading}
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
        </div>

        {!loading && !error && data && data.members.length > 0 && viewMode === 'single' && (
          <div className="checklist-control-row checklist-control-row--members">
            <div className="checklist-member-bar ll-scroll">
              {data.members.map((m) => {
                const isSelf = m.vk_id === data.current_vk_id
                const active = m.vk_id === activeMemberId
                return (
                  <button
                    key={m.vk_id}
                    type="button"
                    className={`checklist-member-pill ${active ? 'checklist-member-pill--active' : ''}`}
                    onClick={() => setActiveMemberId(m.vk_id)}
                    title={m.display_name}
                  >
                    <span className="checklist-member-pill-label">{m.display_name}</span>
                    {isSelf && <span className="checklist-member-pill-tag">я</span>}
                  </button>
                )
              })}
              {!data.can_edit_all && !hasMyColumn && (
                <button
                  type="button"
                  className="checklist-member-pill checklist-member-pill--add"
                  onClick={enableMyColumn}
                  disabled={enablingSelf}
                >
                  {enablingSelf ? '…' : '+ Моя колонка'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="page-loading">Загрузка…</div>
      ) : error ? (
        <div className="glass-card modal-card modal-card--sm">
          <p className="text-red-400 mb-3">{error}</p>
          <button type="button" className="btn btn-gold btn-sm" onClick={load}>
            Повторить
          </button>
        </div>
      ) : !data ? (
        <div className="text-white/40">Нет данных</div>
      ) : data.members.length === 0 ? (
        <div className="glass-card modal-card modal-card--md">
          <p className="text-white/70 mb-2">В чеклисте пока никого нет.</p>
          <p className="text-white/45 text-sm mb-4">
            {data.can_edit_all
              ? 'Откройте «Настройки» и заранее выберите колонки следящих.'
              : 'Нажмите «Моя колонка» ниже, чтобы появиться в таблице.'}
          </p>
          {data.can_edit_all ? (
            <button
              type="button"
              className="btn btn-gold btn-sm"
              onClick={() => {
                setSettingsTab('members')
                setSettingsOpen(true)
              }}
            >
              <Settings size={14} />
              Настроить состав
            </button>
          ) : (
            <button type="button" className="btn btn-gold btn-sm" onClick={enableMyColumn} disabled={enablingSelf}>
              {enablingSelf ? 'Включение…' : 'Моя колонка'}
            </button>
          )}
        </div>
      ) : (
        <div className="checklist-body flex min-w-0 flex-1 flex-col">
          <div className="checklist-scroll flex-1 min-h-0 overflow-auto ll-scroll">
            {grouped.map((day) => (
              <section key={day.day_offset} className="checklist-day-section">
                <div className={`checklist-board ${viewMode === 'all' ? 'checklist-board--wide' : 'checklist-board--single'}`}>
                  <div className="checklist-board-day">{day.day_label}</div>
                  <div className="checklist-table-wrap">
                    <table className="checklist-table">
                      <thead>
                        <tr>
                          <th className="checklist-sticky-col">Задача</th>
                          {viewMode === 'all'
                            ? data.members.map((m) => (
                                <th
                                  key={m.vk_id}
                                  className={`checklist-member-col ${m.vk_id === data.current_vk_id ? 'checklist-member-col--self' : ''}`}
                                  title={m.display_name}
                                >
                                  {m.display_name}
                                </th>
                              ))
                            : (
                                <th className="checklist-active-col">{activeMember?.display_name ?? '—'}</th>
                              )}
                        </tr>
                      </thead>
                      <tbody>
                        {day.rows.map((row) => (
                          <tr
                            key={`${row.day_offset}-${row.task_slug}`}
                            className={row.is_header ? 'checklist-row-header' : ''}
                          >
                            <td className="checklist-sticky-col">{row.task_title}</td>
                            {(viewMode === 'all' ? data.members : activeMemberId ? [{ vk_id: activeMemberId }] : []).map(
                              (member) => {
                                const cell = row.cells.find((c) => c.member_vk_id === member.vk_id)
                                return (
                                  <td key={member.vk_id} className="checklist-cell">
                                    {cell ? (
                                <ChecklistCellEditor
                                  cell={cell}
                                  disabled={data.is_locked || row.is_header || cell.can_edit === false}
                                        onSave={(patch) =>
                                          saveCell(row.day_offset, row.task_slug, cell.member_vk_id, patch)
                                        }
                                      />
                                    ) : (
                                      <span className="text-white/15 text-xs">—</span>
                                    )}
                                  </td>
                                )
                              },
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

      <ChecklistSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={load}
        manageOnly
        initialTab={settingsTab}
      />
    </div>
  )
}
