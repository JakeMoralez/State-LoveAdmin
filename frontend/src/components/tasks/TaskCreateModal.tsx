import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  TASK_FORM_STATUSES,
  type Project,
  type StaffMember,
  type WorkSphere,
} from '../../api'
import type { TaskLabel } from '../../lib/labels'
import {
  GOV_STRUCTURES_SPHERE,
  RECURRENCE_FREQ_OPTIONS,
  TASK_AUDIENCE_OPTIONS,
  WEEKDAY_OPTIONS,
} from '../../lib/taskAudiences'
import { cn, statusBadgeClass } from '../../lib/utils'
import { CreateSphereField } from '../CreateSphereField'
import { DatePicker } from '../ui/DatePicker'
import { LabelInput } from '../ui/LabelInput'
import { MultiAssigneePicker } from '../ui/MultiAssigneePicker'
import { Select } from '../ui/Select'
import { ModalViewport } from '../ui/ModalViewport'
import { Alert } from '../ui/Alert'
import { FieldReq } from '../ui/FormField'

export interface TaskCreatePayload {
  title: string
  description?: string
  status?: string
  priority?: string
  assignee_vk_id?: number | null
  assignee_vk_ids?: number[]
  project_id?: number | null
  due_date?: string | null
  labels?: TaskLabel[]
  audience?: string | null
  expand_cohort?: boolean
  recurrence?: {
    freq: string
    interval?: number
    by_weekday?: number[]
    by_monthday?: number[]
    specific_dates?: string[]
    due_offset_days?: number
    ends_on?: string | null
    spawn_now?: boolean
  } | null
}

interface TaskCreateModalProps {
  open: boolean
  onClose: () => void
  onCreate: (payload: TaskCreatePayload) => Promise<void>
  staff: StaffMember[]
  projects: Project[]
  defaultProjectId?: number | null
  defaultStatus?: string
  workSpheres?: WorkSphere[]
  createSphereIds?: string[]
  createSphere?: string
  onCreateSphereChange?: (id: string) => void
  canManageGovAudiences?: boolean
  defaultAudience?: string | null
}

export function TaskCreateModal({
  open,
  onClose,
  onCreate,
  staff,
  projects,
  defaultProjectId,
  defaultStatus = 'todo',
  workSpheres = [],
  createSphereIds = [],
  createSphere = '',
  onCreateSphereChange,
  canManageGovAudiences = false,
  defaultAudience = null,
}: TaskCreateModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState(defaultStatus)
  const [priority, setPriority] = useState('medium')
  const [assigneeVkIds, setAssigneeVkIds] = useState<number[]>([])
  const [projectId, setProjectId] = useState('')
  const [dueDate, setDueDate] = useState<string | null>(null)
  const [labels, setLabels] = useState<TaskLabel[]>([])
  const [audience, setAudience] = useState<string>(defaultAudience || 'supervisors')
  const [repeat, setRepeat] = useState(false)
  const [freq, setFreq] = useState('weekly')
  const [weekdays, setWeekdays] = useState<number[]>([0, 1, 2, 3, 4])
  const [monthdays, setMonthdays] = useState<string>('1,15')
  const [specificDates, setSpecificDates] = useState('')
  const [endsOn, setEndsOn] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isGov = createSphere === GOV_STRUCTURES_SPHERE

  const audienceOptions = useMemo(
    () => TASK_AUDIENCE_OPTIONS.map((o) => ({ value: o.id, label: o.label })),
    [],
  )

  useEffect(() => {
    if (!open) return
    setStatus(defaultStatus)
    setProjectId(defaultProjectId ? String(defaultProjectId) : '')
    setAudience(defaultAudience || 'supervisors')
    setRepeat(false)
    setError('')
  }, [open, defaultProjectId, defaultStatus, createSphere, defaultAudience])

  if (!open) return null

  const toggleWeekday = (day: number) => {
    setWeekdays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()))
  }

  const submit = async () => {
    if (!title.trim()) return
    if (isGov && !audience) {
      setError('Выберите категорию')
      return
    }
    if (isGov && !canManageGovAudiences) {
      setError('Категорийные задачи создаёт ЗГС+')
      return
    }
    setSaving(true)
    setError('')
    try {
      const monthdayNums = monthdays
        .split(/[,;\s]+/)
        .map((s) => parseInt(s, 10))
        .filter((n) => n >= 1 && n <= 31)
      const dates = specificDates
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)

      await onCreate({
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        priority,
        assignee_vk_ids: assigneeVkIds,
        assignee_vk_id: assigneeVkIds[0] ?? null,
        project_id: projectId ? parseInt(projectId, 10) : null,
        due_date: dueDate,
        labels: labels.length ? labels : undefined,
        audience: isGov ? audience : null,
        expand_cohort: isGov,
        recurrence: repeat
          ? {
              freq,
              by_weekday: freq === 'weekly' ? weekdays : [],
              by_monthday: freq === 'monthly' ? monthdayNums : [],
              specific_dates: freq === 'dates' ? dates : [],
              ends_on: endsOn,
              spawn_now: true,
            }
          : null,
      })
      setTitle('')
      setDescription('')
      setPriority('medium')
      setAssigneeVkIds([])
      setDueDate(null)
      setLabels([])
      setRepeat(false)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать задачу')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalViewport open={open} onBackdropClick={onClose}>
      <div
        className="glass-card task-create-modal task-create-modal--wide modal-pop relative z-10 flex w-full flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 p-6 pb-4">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-lg font-bold">Новая задача</h2>
            <button type="button" onClick={onClose} className="btn-icon h-9 w-9">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4 ll-scroll space-y-4">
          {workSpheres.length > 0 && createSphere && onCreateSphereChange && (
            <CreateSphereField
              spheres={workSpheres}
              allowedIds={createSphereIds}
              value={createSphere}
              onChange={onCreateSphereChange}
            />
          )}

          {isGov && (
            <div>
              <label className="text-caption mb-1.5 block">
                Категория
                <FieldReq />
              </label>
              <Select value={audience} onChange={setAudience} options={audienceOptions} />
              <p className="mt-1 text-xs text-white/40">
                Исполнители подставятся из когорты (можно дополнить вручную ниже).
              </p>
            </div>
          )}

          <div>
            <label className="text-caption mb-1.5 block">
              Название
              <FieldReq />
            </label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="control"
              placeholder="Название задачи"
            />
          </div>
          <div>
            <label className="text-caption mb-1.5 block">Описание</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="control h-auto resize-none py-2"
            />
          </div>

          <div>
            <label className="text-caption mb-1.5 block">Статус</label>
            <div className="status-chip-row">
              {TASK_FORM_STATUSES.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={cn(
                    'status-chip',
                    statusBadgeClass(value),
                    status === value && 'status-chip--active',
                  )}
                  onClick={() => setStatus(value)}
                >
                  {STATUS_LABELS[value]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-caption mb-1.5 block">Приоритет</label>
              <Select
                value={priority}
                onChange={setPriority}
                options={Object.entries(PRIORITY_LABELS).map(([value, label]) => ({ value, label }))}
              />
            </div>
            <div>
              <label className="text-caption mb-1.5 block">Проект</label>
              <Select
                value={projectId}
                onChange={setProjectId}
                placeholder="Без проекта"
                options={[
                  { value: '', label: 'Без проекта' },
                  ...projects.map((p) => ({ value: String(p.id), label: p.title })),
                ]}
              />
            </div>
          </div>

          <div>
            <label className="text-caption mb-1.5 block">
              {isGov ? 'Доп. исполнители' : 'Исполнители'}
            </label>
            <MultiAssigneePicker value={assigneeVkIds} onChange={setAssigneeVkIds} staff={staff} />
          </div>

          <div>
            <label className="text-caption mb-1.5 block">Срок</label>
            <DatePicker value={dueDate} onChange={setDueDate} />
          </div>

          <div>
            <label className="text-caption mb-1.5 block">Метки</label>
            <LabelInput value={labels} onChange={setLabels} placeholder="Своя метка…" />
          </div>

          {(isGov ? canManageGovAudiences : true) && (
            <div className="space-y-3 rounded-lg border border-white/10 p-3">
              <label className="flex items-center gap-2 text-sm text-white/80">
                <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
                Повторять задачу
              </label>
              {repeat && (
                <>
                  <Select
                    value={freq}
                    onChange={setFreq}
                    options={RECURRENCE_FREQ_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                  />
                  {freq === 'weekly' && (
                    <div className="flex flex-wrap gap-1.5">
                      {WEEKDAY_OPTIONS.map((d) => (
                        <button
                          key={d.value}
                          type="button"
                          className={cn('status-chip', weekdays.includes(d.value) && 'status-chip--active')}
                          onClick={() => toggleWeekday(d.value)}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {freq === 'monthly' && (
                    <div>
                      <label className="text-caption mb-1.5 block">Числа месяца (через запятую)</label>
                      <input
                        className="control"
                        value={monthdays}
                        onChange={(e) => setMonthdays(e.target.value)}
                        placeholder="1,15"
                      />
                    </div>
                  )}
                  {freq === 'dates' && (
                    <div>
                      <label className="text-caption mb-1.5 block">Даты YYYY-MM-DD</label>
                      <input
                        className="control"
                        value={specificDates}
                        onChange={(e) => setSpecificDates(e.target.value)}
                        placeholder="2026-09-20, 2026-10-01"
                      />
                    </div>
                  )}
                  <div>
                    <label className="text-caption mb-1.5 block">До даты (опц.)</label>
                    <DatePicker value={endsOn} onChange={setEndsOn} />
                  </div>
                </>
              )}
            </div>
          )}

          {error && <Alert>{error}</Alert>}
        </div>

        <div className="shrink-0 border-t border-white/8 p-6 pt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-ghost">
            Отмена
          </button>
          <button type="button" onClick={submit} disabled={saving || !title.trim()} className="btn btn-gold">
            {saving ? 'Создание…' : repeat ? 'Создать повтор' : 'Создать'}
          </button>
        </div>
      </div>
    </ModalViewport>
  )
}
