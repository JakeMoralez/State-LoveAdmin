import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ClipboardCheck, Columns3, RefreshCw, Settings, UserRound } from 'lucide-react'
import { ApiError, api } from '../api'
import { ChecklistSettingsModal } from '../components/checklist/ChecklistSettingsModal'
import { ChecklistCellEditor } from '../components/checklist/ChecklistCellEditor'

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
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem('sl-checklist-view') as ViewMode) || 'all',
  )

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
    <div className="content-fixed">
      <div className="page-header shrink-0">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <ClipboardCheck size={22} className="text-[var(--accent-gold)]" />
            Чеклист недели
          </h1>
          {data?.is_locked && (
            <p className="text-xs text-amber-400/80 m-0 mt-1">
              Прошлая неделя зафиксирована — состав и задачи не меняются
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data?.can_edit_all && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setSettingsTab('tasks')
                setSettingsOpen(true)
              }}
            >
              <Settings size={14} />
              Настройки
            </button>
          )}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setWeek((w) => addDays(w, -7))}>
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm text-white/55 min-w-[160px] text-center">
            {data ? formatWeekRu(data.week_start, data.week_end) : week}
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setWeek((w) => addDays(w, 7))}>
            <ChevronRight size={16} />
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="page-loading">Загрузка…</div>
      ) : error ? (
        <div className="glass-card p-6 max-w-lg">
          <p className="text-red-400 mb-3">{error}</p>
          <button type="button" className="btn btn-gold btn-sm" onClick={load}>
            Повторить
          </button>
        </div>
      ) : !data ? (
        <div className="text-white/40">Нет данных</div>
      ) : data.members.length === 0 ? (
        <div className="glass-card p-6 max-w-xl">
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
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="checklist-toolbar shrink-0">
            <div className="checklist-view-toggle">
              <button
                type="button"
                className={`checklist-view-btn ${viewMode === 'all' ? 'checklist-view-btn--active' : ''}`}
                onClick={() => setMode('all')}
              >
                <Columns3 size={14} />
                Все колонки
              </button>
              <button
                type="button"
                className={`checklist-view-btn ${viewMode === 'single' ? 'checklist-view-btn--active' : ''}`}
                onClick={() => setMode('single')}
              >
                <UserRound size={14} />
                По одному
              </button>
            </div>

            {viewMode === 'single' && (
              <div className="checklist-member-switch ll-scroll">
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
                      <span className="min-w-0 truncate">{m.display_name}</span>
                      {isSelf && <span className="checklist-member-pill-tag">я</span>}
                      {m.access_level_name && (
                        <span className="checklist-member-pill-level">{m.access_level_name}</span>
                      )}
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
            )}
          </div>

          {viewMode === 'single' && activeMember && (
            <p className="text-xs text-white/40 m-0 shrink-0 truncate" title={activeMember.display_name}>
              {activeMember.vk_id === data.current_vk_id
                ? 'Ваша колонка — заполняйте ячейки за неделю.'
                : data.can_edit_all
                  ? `Колонка: ${activeMember.display_name}`
                  : 'Просмотр колонки другого следящего (только чтение).'}
            </p>
          )}

          <div className="flex-1 min-h-0 overflow-auto ll-scroll">
            {grouped.map((day) => (
              <section key={day.day_offset} className="mb-6">
                <h2 className="checklist-day-head">{day.day_label}</h2>
                <div className={`checklist-board ${viewMode === 'all' ? 'checklist-board--wide' : ''}`}>
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
