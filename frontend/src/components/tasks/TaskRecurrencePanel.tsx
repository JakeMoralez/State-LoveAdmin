import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pause, Play, Plus, RefreshCw, Repeat, Trash2, Users } from 'lucide-react'
import { api, type TaskRecurrence, type WorkSphere } from '../../api'
import {
  RECURRENCE_FREQ_OPTIONS,
  TASK_AUDIENCE_LABELS,
  WEEKDAY_OPTIONS,
  type TaskAudience,
} from '../../lib/taskAudiences'
import { formatSpheresDisplay } from '../../lib/spheres'
import { Alert } from '../ui/Alert'
import { cn } from '../../lib/utils'

interface TaskRecurrencePanelProps {
  /** undefined / пусто = все доступные сферы пользователя */
  spheres?: string[]
  workSpheres?: WorkSphere[]
  canManage: boolean
  revision?: number
  onChanged?: () => void
  onCreate?: () => void
  /** Скрыть дублирующую кнопку создания (есть в тулбаре) */
  hideCreateButton?: boolean
}

function freqLabel(freq: string) {
  return RECURRENCE_FREQ_OPTIONS.find((o) => o.value === freq)?.label || freq
}

function scheduleHint(row: TaskRecurrence): string {
  const parts: string[] = [freqLabel(row.freq)]
  if (row.freq === 'weekly' && row.by_weekday?.length) {
    const days = WEEKDAY_OPTIONS.filter((d) => row.by_weekday!.includes(d.value))
      .map((d) => d.label)
      .join(', ')
    if (days) parts.push(days)
  }
  if (row.freq === 'monthly' && row.by_monthday?.length) {
    parts.push(`числа ${row.by_monthday.join(', ')}`)
  }
  if (row.freq === 'dates' && row.specific_dates?.length) {
    parts.push(row.specific_dates.slice(0, 3).join(', ') + (row.specific_dates.length > 3 ? '…' : ''))
  }
  if (row.audience) {
    parts.push(TASK_AUDIENCE_LABELS[row.audience as TaskAudience] || row.audience)
  }
  return parts.join(' · ')
}

function formatNextRun(iso: string | null | undefined): string | null {
  if (!iso) return null
  return iso.slice(0, 16).replace('T', ' ')
}

function assigneeCount(row: TaskRecurrence): number {
  return row.assignee_vk_ids?.length ?? 0
}

export function TaskRecurrencePanel({
  spheres,
  workSpheres = [],
  canManage,
  revision = 0,
  onChanged,
  onCreate,
  hideCreateButton = false,
}: TaskRecurrencePanelProps) {
  const [items, setItems] = useState<TaskRecurrence[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'active' | 'paused'>('all')

  const sphereKey = spheres?.length ? [...spheres].sort().join(',') : '__all__'

  const load = useCallback(async () => {
    if (!canManage) {
      setItems([])
      setLoading(false)
      return
    }
    setError(null)
    setLoading(true)
    try {
      const res = await api.taskRecurrences(spheres?.length ? spheres : undefined)
      setItems(res.recurrences)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить шаблоны')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [canManage, sphereKey]) // eslint-disable-line react-hooks/exhaustive-deps -- sphereKey covers spheres

  useEffect(() => {
    void load()
  }, [load, revision])

  const visible = useMemo(() => {
    if (filter === 'active') return items.filter((r) => r.active)
    if (filter === 'paused') return items.filter((r) => !r.active)
    return items
  }, [items, filter])

  const activeCount = items.filter((r) => r.active).length
  const pausedCount = items.length - activeCount

  if (!canManage) {
    return (
      <div className="page-empty-state page-empty-state--card">
        <p className="page-empty-state-title">Нет доступа к шаблонам</p>
        <p className="page-empty-state-hint">Повторяющиеся задачи настраивает ЗГС и выше.</p>
      </div>
    )
  }

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
    if (!confirm(`Удалить шаблон «${row.title}»?\nУже созданные задачи в доске останутся.`)) return
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

  const sphereLabel = (id: string) => {
    const fromWork = workSpheres.find((s) => s.id === id)?.label
    if (fromWork) return fromWork
    return formatSpheresDisplay([id])
  }

  return (
    <section className="tasks-repeats-panel ll-scroll min-h-0 flex-1">
      <div className="tasks-repeats-head">
        <div className="min-w-0">
          <h3 className="tasks-repeats-title">
            <Repeat size={16} aria-hidden />
            Шаблоны повтора
          </h3>
          <p className="tasks-repeats-hint">
            Расписание хранится здесь. Карточка в канбане появляется в день запуска — не сразу при создании.
          </p>
        </div>
        <div className="tasks-repeats-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()} aria-label="Обновить">
            <RefreshCw size={14} aria-hidden />
          </button>
          {!hideCreateButton && onCreate ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={onCreate}>
              <Plus size={14} aria-hidden />
              Шаблон
            </button>
          ) : null}
        </div>
      </div>

      {!loading && items.length > 0 ? (
        <div className="tasks-repeats-stats" role="tablist" aria-label="Фильтр шаблонов">
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'all'}
            className={cn('tasks-repeats-stat', filter === 'all' && 'tasks-repeats-stat--on')}
            onClick={() => setFilter('all')}
          >
            Все <span>{items.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'active'}
            className={cn('tasks-repeats-stat', filter === 'active' && 'tasks-repeats-stat--on')}
            onClick={() => setFilter('active')}
          >
            Активные <span>{activeCount}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'paused'}
            className={cn('tasks-repeats-stat', filter === 'paused' && 'tasks-repeats-stat--on')}
            onClick={() => setFilter('paused')}
          >
            Пауза <span>{pausedCount}</span>
          </button>
        </div>
      ) : null}

      {error ? <Alert>{error}</Alert> : null}

      {loading ? (
        <div className="tasks-repeats-loading" aria-busy="true">
          Загрузка шаблонов…
        </div>
      ) : items.length === 0 ? (
        <div className="page-empty-state page-empty-state--card tasks-repeats-empty">
          <div className="tasks-repeats-empty-icon" aria-hidden>
            <Repeat size={28} />
          </div>
          <p className="page-empty-state-title">Шаблонов пока нет</p>
          <p className="page-empty-state-hint">
            Создайте шаблон с расписанием и исполнителями. В день запуска копия попадёт в доску, а исполнителям
            уйдёт уведомление «Поставлена автозадача».
          </p>
          {onCreate ? (
            <button type="button" className="btn btn-primary btn-sm mt-3" onClick={onCreate}>
              <Plus size={14} aria-hidden />
              Создать шаблон
            </button>
          ) : null}
        </div>
      ) : visible.length === 0 ? (
        <div className="page-empty-state page-empty-state--card">
          <p className="page-empty-state-title">Нет шаблонов в этом фильтре</p>
          <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={() => setFilter('all')}>
            Показать все
          </button>
        </div>
      ) : (
        <ul className="tasks-repeats-list">
          {visible.map((row) => {
            const next = formatNextRun(row.next_run_at)
            const nAssignees = assigneeCount(row)
            return (
              <li key={row.id} className={cn('tasks-repeats-row', !row.active && 'tasks-repeats-row--paused')}>
                <div className="min-w-0 flex-1">
                  <div className="tasks-repeats-row-top">
                    <div className="tasks-repeats-row-title">{row.title}</div>
                    <span
                      className={cn(
                        'tasks-repeats-badge',
                        row.active ? 'tasks-repeats-badge--on' : 'tasks-repeats-badge--off',
                      )}
                    >
                      {row.active ? 'Активен' : 'Пауза'}
                    </span>
                  </div>
                  <div className="tasks-repeats-row-meta">
                    <span className="tasks-repeats-sphere">{sphereLabel(row.sphere)}</span>
                    <span aria-hidden>·</span>
                    <span>{scheduleHint(row)}</span>
                  </div>
                  <div className="tasks-repeats-row-foot">
                    <span className="tasks-repeats-assignees">
                      <Users size={12} aria-hidden />
                      {nAssignees > 0 ? `${nAssignees} исполн.` : 'Без исполнителей'}
                    </span>
                    {next ? (
                      <span className="tasks-repeats-row-next">След.: {next}</span>
                    ) : (
                      <span className="tasks-repeats-row-next tasks-repeats-row-next--muted">Нет запуска</span>
                    )}
                  </div>
                </div>
                <div className="tasks-repeats-row-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busyId === row.id}
                    onClick={() => void toggleActive(row)}
                    aria-label={row.active ? 'Пауза' : 'Включить'}
                    title={row.active ? 'Пауза' : 'Включить'}
                  >
                    {row.active ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
                    <span className="tasks-repeats-action-label">{row.active ? 'Пауза' : 'Вкл.'}</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busyId === row.id}
                    onClick={() => void remove(row)}
                    aria-label="Удалить шаблон"
                    title="Удалить"
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
