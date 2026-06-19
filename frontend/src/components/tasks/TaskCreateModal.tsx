import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { PRIORITY_LABELS, STATUS_LABELS, type Project, type StaffMember } from '../../api'
import type { TaskLabel } from '../../lib/labels'
import { cn, statusBadgeClass } from '../../lib/utils'
import { DatePicker } from '../ui/DatePicker'
import { LabelInput } from '../ui/LabelInput'
import { MultiAssigneePicker } from '../ui/MultiAssigneePicker'
import { Select } from '../ui/Select'
import { ModalViewport } from '../ui/ModalViewport'

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
}

interface TaskCreateModalProps {
  open: boolean
  onClose: () => void
  onCreate: (payload: TaskCreatePayload) => Promise<void>
  staff: StaffMember[]
  projects: Project[]
  defaultProjectId?: number | null
  defaultStatus?: string
}

export function TaskCreateModal({
  open,
  onClose,
  onCreate,
  staff,
  projects,
  defaultProjectId,
  defaultStatus = 'todo',
}: TaskCreateModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState(defaultStatus)
  const [priority, setPriority] = useState('medium')
  const [assigneeVkIds, setAssigneeVkIds] = useState<number[]>([])
  const [projectId, setProjectId] = useState('')
  const [dueDate, setDueDate] = useState<string | null>(null)
  const [labels, setLabels] = useState<TaskLabel[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setStatus(defaultStatus)
    setProjectId(defaultProjectId ? String(defaultProjectId) : '')
    setError('')
  }, [open, defaultProjectId, defaultStatus])

  if (!open) return null

  const submit = async () => {
    if (!title.trim()) return
    setSaving(true)
    setError('')
    try {
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
      })
      setTitle('')
      setDescription('')
      setPriority('medium')
      setAssigneeVkIds([])
      setDueDate(null)
      setLabels([])
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
        className="glass-card task-create-modal modal-pop relative z-10 flex w-full max-w-lg flex-col shadow-2xl"
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
          <div>
            <label className="text-caption mb-1.5 block">Название *</label>
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
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
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
                  {label}
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
            <label className="text-caption mb-1.5 block">Исполнители</label>
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

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="shrink-0 border-t border-white/8 p-6 pt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-ghost">
            Отмена
          </button>
          <button type="button" onClick={submit} disabled={saving || !title.trim()} className="btn btn-gold">
            {saving ? 'Создание…' : 'Создать'}
          </button>
        </div>
      </div>
    </ModalViewport>
  )
}
