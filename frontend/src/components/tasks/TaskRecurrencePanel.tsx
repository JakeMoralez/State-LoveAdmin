import { useCallback, useEffect, useState } from 'react'
import { Pause, Play, RefreshCw, Trash2 } from 'lucide-react'
import { api, type TaskRecurrence } from '../../api'
import { RECURRENCE_FREQ_OPTIONS, TASK_AUDIENCE_LABELS, type TaskAudience } from '../../lib/taskAudiences'
import { Alert } from '../ui/Alert'

interface TaskRecurrencePanelProps {
  sphere: string
  canManage: boolean
  onChanged?: () => void
}

function freqLabel(freq: string) {
  return RECURRENCE_FREQ_OPTIONS.find((o) => o.value === freq)?.label || freq
}

export function TaskRecurrencePanel({ sphere, canManage, onChanged }: TaskRecurrencePanelProps) {
  const [items, setItems] = useState<TaskRecurrence[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  const load = useCallback(async () => {
    if (!canManage) return
    setError(null)
    try {
      const res = await api.taskRecurrences(sphere)
      setItems(res.recurrences)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить шаблоны')
    }
  }, [canManage, sphere])

  useEffect(() => {
    void load()
  }, [load])

  if (!canManage) return null

  const toggleActive = async (row: TaskRecurrence) => {
    setBusyId(row.id)
    try {
      await api.updateTaskRecurrence(row.id, { active: !row.active })
      await load()
      onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (row: TaskRecurrence) => {
    if (!confirm(`Удалить шаблон «${row.title}»?`)) return
    setBusyId(row.id)
    try {
      await api.deleteTaskRecurrence(row.id)
      await load()
      onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-white/85">Шаблоны повтора</h3>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()}>
          <RefreshCw size={14} />
        </button>
      </div>
      {error ? <Alert>{error}</Alert> : null}
      {items.length === 0 ? (
        <p className="text-xs text-white/40">Пока нет повторяющихся задач в этой сфере.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-white/6 pb-2 last:border-0"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{row.title}</div>
                <div className="text-xs text-white/45">
                  {freqLabel(row.freq)}
                  {row.audience
                    ? ` · ${TASK_AUDIENCE_LABELS[row.audience as TaskAudience] || row.audience}`
                    : ''}
                  {row.active ? '' : ' · пауза'}
                  {row.next_run_at ? ` · след. ${row.next_run_at.slice(0, 16).replace('T', ' ')}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={busyId === row.id}
                  onClick={() => void toggleActive(row)}
                  title={row.active ? 'Пауза' : 'Включить'}
                >
                  {row.active ? <Pause size={14} /> : <Play size={14} />}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busyId === row.id}
                  onClick={() => void remove(row)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
