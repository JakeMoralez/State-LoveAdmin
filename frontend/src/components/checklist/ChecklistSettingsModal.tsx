import { useEffect, useState } from 'react'
import { AlertCircle, Plus, Trash2, User, Users, X } from 'lucide-react'
import { ApiError, api, type ChecklistSettings } from '../../api'
import { useAuth } from '../../context/AuthContext'
import { ModalViewport } from '../ui/ModalViewport'

interface ChecklistSettingsModalProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  manageOnly?: boolean
  initialTab?: 'tasks' | 'members'
  sphere?: string
}

const DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

type TaskRow = { slug: string; title: string; is_header: boolean; days_of_week: number[] }

function formatError(e: unknown): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof Error) return e.message
  return 'Ошибка сохранения'
}

function formatDaysShort(days: number[]) {
  if (days.length === 7) return 'каждый день'
  return days.map((d) => DAY_LABELS[d]).join(', ')
}

export function ChecklistSettingsModal({
  open,
  onClose,
  onSaved,
  manageOnly = false,
  initialTab = 'tasks',
  sphere,
}: ChecklistSettingsModalProps) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [canManage, setCanManage] = useState(false)
  const [tab, setTab] = useState<'tasks' | 'members'>('tasks')
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [candidates, setCandidates] = useState<ChecklistSettings['candidates']>([])
  const [hasMyColumn, setHasMyColumn] = useState(false)
  const [templateNote, setTemplateNote] = useState('')

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    setTab(initialTab)
    api
      .checklistSettings(sphere)
      .then((s) => {
        setCanManage(Boolean(s.can_manage))
        setTasks(
          s.tasks.map((t) => ({
            slug: t.slug,
            title: t.title,
            is_header: t.is_header,
            days_of_week: t.days_of_week?.length ? t.days_of_week : [...ALL_DAYS],
          })),
        )
        setCandidates(s.candidates)
        setHasMyColumn(s.members.some((m) => m.vk_id === s.current_vk_id))
        setTemplateNote(s.template_note ?? '')
      })
      .catch((e: unknown) => setError(formatError(e)))
      .finally(() => setLoading(false))
  }, [open, initialTab, sphere])

  const selectedIds = candidates.filter((c) => c.in_checklist).map((c) => c.vk_id)
  const selectedCount = selectedIds.length

  const toggleMember = (vkId: number) => {
    setCandidates((prev) =>
      prev.map((c) => (c.vk_id === vkId ? { ...c, in_checklist: !c.in_checklist } : c)),
    )
  }

  const selectAll = () => setCandidates((prev) => prev.map((c) => ({ ...c, in_checklist: true })))
  const selectNone = () => setCandidates((prev) => prev.map((c) => ({ ...c, in_checklist: false })))
  const selectOnlyMe = () => {
    if (!user) return
    setCandidates((prev) => prev.map((c) => ({ ...c, in_checklist: c.vk_id === user.vk_id })))
  }

  const addTask = () => {
    setTasks((prev) => [
      ...prev,
      { slug: `task-${Date.now()}`, title: 'Новая задача', is_header: false, days_of_week: [...ALL_DAYS] },
    ])
  }

  const toggleTaskDay = (index: number, day: number) => {
    setTasks((prev) =>
      prev.map((row, j) => {
        if (j !== index) return row
        const has = row.days_of_week.includes(day)
        const next = has ? row.days_of_week.filter((d) => d !== day) : [...row.days_of_week, day]
        return { ...row, days_of_week: next.length ? next.sort((a, b) => a - b) : [...ALL_DAYS] }
      }),
    )
  }

  const saveTasks = async () => {
    if (tasks.length === 0) {
      setError('Нужна хотя бы одна задача')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.updateChecklistTasks(
        {
          tasks: tasks.map((t) => ({
            slug: t.slug,
            title: t.title.trim() || 'Задача',
            is_header: t.is_header,
            days_of_week: t.days_of_week.length ? t.days_of_week : [...ALL_DAYS],
          })),
        },
        sphere,
      )
      onSaved()
      onClose()
    } catch (e: unknown) {
      setError(formatError(e))
    } finally {
      setSaving(false)
    }
  }

  const saveMembers = async () => {
    if (selectedCount === 0) {
      setError('Выберите хотя бы одну колонку')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.updateChecklistMembers({ vk_ids: selectedIds }, sphere)
      onSaved()
      onClose()
    } catch (e: unknown) {
      setError(formatError(e))
    } finally {
      setSaving(false)
    }
  }

  const enableMyColumn = async () => {
    if (!user) return
    setSaving(true)
    setError(null)
    try {
      try {
        await api.checklistMembersOnlyMe(sphere)
      } catch (e: unknown) {
        if (e instanceof ApiError && e.status === 404) {
          await api.updateChecklistMembers({ vk_ids: [user.vk_id] }, sphere)
        } else {
          throw e
        }
      }
      setHasMyColumn(true)
      onSaved()
      onClose()
    } catch (e: unknown) {
      setError(formatError(e))
    } finally {
      setSaving(false)
    }
  }

  const handleSave = () => {
    if (canManage) {
      if (tab === 'tasks') void saveTasks()
      else void saveMembers()
    } else {
      void enableMyColumn()
    }
  }

  if (!open) return null
  if (manageOnly && !loading && !canManage) return null

  return (
    <ModalViewport open={open} onBackdropClick={onClose}>
      <div
        className="glass-card checklist-settings modal-pop relative z-10 flex w-full max-w-2xl flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
          <div>
            <h2 className="m-0 text-lg font-semibold">
              {canManage ? 'Настройки чеклиста' : 'Моя колонка'}
            </h2>
            <p className="m-0 mt-1 text-xs text-white/40">
              {canManage ? 'Шаблон для новых недель' : 'Задачи и состав настраивает ЗГС ЦА+'}
            </p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        </div>

        {canManage && (
          <div className="drawer-tabs px-6">
            <button
              type="button"
              className={`drawer-tab ${tab === 'tasks' ? 'drawer-tab-active' : ''}`}
              onClick={() => setTab('tasks')}
            >
              Задачи ({tasks.length})
            </button>
            <button
              type="button"
              className={`drawer-tab ${tab === 'members' ? 'drawer-tab-active' : ''}`}
              onClick={() => setTab('members')}
            >
              Колонки ({selectedCount})
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 ll-scroll">
          {loading ? (
            <p className="text-white/40">Загрузка…</p>
          ) : !canManage ? (
            <div className="checklist-self-setup">
              <div className="checklist-self-icon">
                <User size={28} className="text-[var(--accent-gold)]" />
              </div>
              <p className="text-white/80 text-sm leading-relaxed m-0">
                В чеклисте будет одна колонка с вашим именем. Вы заполняете только её.
              </p>
              {hasMyColumn ? (
                <p className="text-[var(--accent-gold)] text-sm m-0 mt-3">Ваша колонка уже включена.</p>
              ) : (
                <p className="text-white/45 text-xs m-0 mt-3">
                  Нажмите «Включить мою колонку», чтобы появиться в таблице.
                </p>
              )}
            </div>
          ) : tab === 'tasks' ? (
            <div className="checklist-tasks-editor">
              {templateNote && <p className="checklist-template-note">{templateNote}</p>}
              <div className="checklist-tasks-list">
                {tasks.map((t, i) => (
                  <div key={t.slug} className={`checklist-task-card ${t.is_header ? 'checklist-task-card--header' : ''}`}>
                    <div className="checklist-task-card-top">
                      <label className="ui-checkbox-label">
                        <input
                          type="checkbox"
                          className="ui-checkbox"
                          checked={t.is_header}
                          onChange={(e) =>
                            setTasks((prev) =>
                              prev.map((row, j) => (j === i ? { ...row, is_header: e.target.checked } : row)),
                            )
                          }
                        />
                        <span className="ui-checkbox-box" />
                        <span className="text-xs text-white/50">Раздел</span>
                      </label>
                      <button
                        type="button"
                        className="btn-icon text-red-400/80 hover:text-red-400 shrink-0"
                        onClick={() => setTasks((prev) => prev.filter((_, j) => j !== i))}
                        disabled={tasks.length <= 1}
                        aria-label="Удалить"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <input
                      value={t.title}
                      onChange={(e) =>
                        setTasks((prev) => prev.map((row, j) => (j === i ? { ...row, title: e.target.value } : row)))
                      }
                      className="control checklist-task-title-input"
                      placeholder="Название задачи"
                    />
                    {!t.is_header && (
                      <div className="checklist-task-days">
                        <span className="checklist-task-days-label">Дни:</span>
                        <div className="checklist-day-chips">
                          {DAY_LABELS.map((label, day) => {
                            const on = t.days_of_week.includes(day)
                            return (
                              <button
                                key={day}
                                type="button"
                                className={`checklist-day-chip ${on ? 'checklist-day-chip--on' : ''}`}
                                onClick={() => toggleTaskDay(i, day)}
                              >
                                {label}
                              </button>
                            )
                          })}
                        </div>
                        <span className="checklist-task-days-hint">{formatDaysShort(t.days_of_week)}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={addTask}>
                <Plus size={14} />
                Добавить задачу
              </button>
            </div>
          ) : (
            <div>
              <div className="checklist-members-actions">
                <button type="button" className="checklist-members-action" onClick={selectOnlyMe}>
                  <User size={13} />
                  Только я
                </button>
                <button type="button" className="checklist-members-action" onClick={selectAll}>
                  <Users size={13} />
                  Все
                </button>
                <button type="button" className="checklist-members-action" onClick={selectNone}>
                  Снять
                </button>
              </div>

              {candidates.length === 0 ? (
                <p className="text-white/50 text-sm mt-4">Нет следящих с доступом ЦА.</p>
              ) : (
                <ul className="checklist-members-list mt-3">
                  {candidates.map((c) => (
                    <li key={c.vk_id}>
                      <label
                        className={`checklist-member-row ${c.in_checklist ? 'checklist-member-row--on' : ''} ${c.is_self ? 'checklist-member-row--self' : ''}`}
                      >
                        <input
                          type="checkbox"
                          className="ui-checkbox"
                          checked={c.in_checklist}
                          onChange={() => toggleMember(c.vk_id)}
                        />
                        <span className="ui-checkbox-box" />
                        <span className="flex-1 font-medium truncate">
                          {c.display_name}
                          {c.is_self && <span className="text-[var(--accent-gold)] text-xs ml-1.5">(вы)</span>}
                        </span>
                        <span className="checklist-member-meta shrink-0">
                          <span className="text-xs text-white/35">{c.access_level_name}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {error && (
            <div className="checklist-settings-error mt-4" role="alert">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-white/[0.06] px-6 py-4">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Отмена
          </button>
          {canManage ? (
            <button
              type="button"
              className="btn btn-gold"
              onClick={handleSave}
              disabled={saving || loading}
            >
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-gold"
              onClick={handleSave}
              disabled={saving || loading || hasMyColumn}
            >
              {saving ? 'Сохранение…' : hasMyColumn ? 'Уже включено' : 'Включить мою колонку'}
            </button>
          )}
        </div>
      </div>
    </ModalViewport>
  )
}
