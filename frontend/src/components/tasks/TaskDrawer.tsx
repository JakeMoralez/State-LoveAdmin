import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Link2, Paperclip, Trash2, X } from 'lucide-react'
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  api,
  type Project,
  type StaffMember,
  type TaskDetail,
} from '../../api'
import { useAuth } from '../../context/AuthContext'
import { normalizeLabels, type TaskLabel } from '../../lib/labels'
import { cn, statusBadgeClass } from '../../lib/utils'
import { TaskTypePicker } from './TaskTypePicker'
import { DatePicker } from '../ui/DatePicker'
import { ImageUploadButton, isImageUrl } from '../ui/ImageUpload'
import { LabelInput } from '../ui/LabelInput'
import { MessageComposer } from '../ui/MessageComposer'
import { MultiAssigneePicker } from '../ui/MultiAssigneePicker'
import { Select } from '../ui/Select'

type DrawerTab = 'details' | 'comments'

function assigneeIdsFromTask(task: TaskDetail): number[] {
  if (task.assignee_vk_ids?.length) return task.assignee_vk_ids
  if (task.assignee_vk_id) return [task.assignee_vk_id]
  return []
}

export function TaskDrawer({
  taskId,
  staff,
  projects,
  onClose,
  onUpdate,
}: {
  taskId: number
  staff: StaffMember[]
  projects: Project[]
  onClose: () => void
  onUpdate: () => void
}) {
  const { user } = useAuth()
  const canDelete = (user?.access_level ?? 0) >= 3

  const [tab, setTab] = useState<DrawerTab>('details')
  const [task, setTask] = useState<TaskDetail | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('todo')
  const [priority, setPriority] = useState('medium')
  const [taskType, setTaskType] = useState('assignment')
  const [assigneeVkIds, setAssigneeVkIds] = useState<number[]>([])
  const [projectId, setProjectId] = useState('')
  const [dueDate, setDueDate] = useState<string | null>(null)
  const [labels, setLabels] = useState<TaskLabel[]>([])
  const [attachUrl, setAttachUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const load = () => api.task(taskId).then(setTask)

  useEffect(() => {
    load()
  }, [taskId])

  useEffect(() => {
    if (!task) return
    setTitle(task.title)
    setDescription(task.description || '')
    setStatus(task.status || 'todo')
    setPriority(task.priority || 'medium')
    setTaskType(task.task_type || 'assignment')
    setAssigneeVkIds(assigneeIdsFromTask(task))
    setProjectId(task.project_id ? String(task.project_id) : '')
    setDueDate(task.due_date || null)
    setLabels(normalizeLabels(task.labels))
  }, [task])

  const dirty = useMemo(() => {
    if (!task) return false
    const origIds = assigneeIdsFromTask(task)
    return (
      title !== task.title ||
      description !== (task.description || '') ||
      status !== (task.status || 'todo') ||
      priority !== (task.priority || 'medium') ||
      taskType !== (task.task_type || 'assignment') ||
      JSON.stringify(assigneeVkIds) !== JSON.stringify(origIds) ||
      projectId !== (task.project_id ? String(task.project_id) : '') ||
      dueDate !== (task.due_date || null) ||
      JSON.stringify(labels) !== JSON.stringify(normalizeLabels(task.labels))
    )
  }, [task, title, description, status, priority, taskType, assigneeVkIds, projectId, dueDate, labels])

  const tryClose = () => {
    if (dirty && !window.confirm('Есть несохранённые изменения. Закрыть без сохранения?')) return
    onClose()
  }

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await api.updateTask(taskId, {
        title,
        description,
        status,
        priority,
        task_type: taskType,
        assignee_vk_ids: assigneeVkIds,
        assignee_vk_id: assigneeVkIds[0] ?? null,
        project_id: projectId ? parseInt(projectId, 10) : null,
        due_date: dueDate,
        labels,
      })
      await load()
      onUpdate()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  const removeTask = async () => {
    if (!window.confirm('Удалить задачу безвозвратно?')) return
    setDeleting(true)
    setError('')
    try {
      await api.deleteTask(taskId)
      onUpdate()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось удалить')
    } finally {
      setDeleting(false)
    }
  }

  const sendComment = async (body: string) => {
    await api.addComment(taskId, body)
    await load()
    onUpdate()
  }

  const addAttachment = async () => {
    if (!attachUrl.trim()) return
    try {
      await api.addAttachment(taskId, attachUrl.trim())
      setAttachUrl('')
      await load()
      onUpdate()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка вложения')
    }
  }

  const removeAttachment = async (attachmentId: number) => {
    try {
      await api.deleteAttachment(taskId, attachmentId)
      await load()
      onUpdate()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось удалить вложение')
    }
  }

  if (!task) {
    return (
      <div className="fixed inset-0 z-50 flex justify-end">
        <div className="absolute inset-0 bg-black/50 overlay-backdrop" onClick={onClose} />
        <div className="drawer-panel items-center justify-center page-loading">Загрузка…</div>
      </div>
    )
  }

  const commentCount = task.comments.length

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 cursor-pointer bg-black/50 overlay-backdrop" onClick={tryClose} />
      <div className="drawer-panel">
        <div className="flex shrink-0 items-center justify-between border-b border-white/8 px-6 py-4">
          <div className="min-w-0">
            <p className="text-caption">Задача #{task.id}</p>
            <h2 className="text-lg font-bold mt-0.5 truncate">{task.title}</h2>
            {task.project_title && task.project_id && (
              <Link to={`/projects/${task.project_id}`} className="text-xs link-gold">
                {task.project_title}
              </Link>
            )}
          </div>
          <div className="flex items-center gap-1">
            {canDelete && (
              <button
                type="button"
                onClick={removeTask}
                disabled={deleting}
                className="btn-icon h-9 w-9 text-red-400/80 hover:text-red-300"
                title="Удалить задачу"
              >
                <Trash2 size={17} />
              </button>
            )}
            <button type="button" onClick={tryClose} className="btn-icon h-9 w-9">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="drawer-tabs shrink-0">
          {(['details', 'comments'] as DrawerTab[]).map((key) => (
            <button
              key={key}
              type="button"
              className={`drawer-tab ${tab === key ? 'drawer-tab-active' : ''}`}
              onClick={() => setTab(key)}
            >
              {key === 'details' ? 'Детали' : `Комментарии (${commentCount})`}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
          {tab === 'details' && (
            <div className="min-h-0 flex-1 overflow-y-auto p-6 ll-scroll space-y-4">
              <div>
                <label className="text-caption mb-1.5 block">Название</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className="control" />
              </div>
              <div>
                <label className="text-caption mb-1.5 block">Описание</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="control h-auto min-h-[100px] resize-none py-2"
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

              <div>
                <label className="text-caption mb-1.5 block">Тип</label>
                <TaskTypePicker value={taskType} onChange={setTaskType} />
              </div>

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
                <LabelInput value={labels} onChange={setLabels} />
              </div>

              <div className="task-attachments-block">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-caption m-0">Вложения</label>
                  {task.attachments.length > 0 && (
                    <span className="text-xs text-white/35">{task.attachments.length}</span>
                  )}
                </div>

                {task.attachments.length === 0 ? (
                  <p className="task-attachments-empty">Нет вложений</p>
                ) : (
                  <div className="task-attachments-grid">
                    {task.attachments.map((a) => (
                      <div key={a.id} className="task-attachment-card">
                        {isImageUrl(a.url) ? (
                          <a href={a.url} target="_blank" rel="noreferrer" className="task-attachment-thumb">
                            <img src={a.url} alt={a.title || 'скрин'} />
                          </a>
                        ) : (
                          <a
                            href={a.url}
                            target="_blank"
                            rel="noreferrer"
                            className="task-attachment-link"
                          >
                            <Paperclip size={14} />
                            <span className="truncate">{a.title || a.url}</span>
                          </a>
                        )}
                        <button
                          type="button"
                          className="task-attachment-remove"
                          onClick={() => removeAttachment(a.id)}
                          title="Удалить"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="task-attachments-add">
                  <div className="attach-field">
                    <input
                      value={attachUrl}
                      onChange={(e) => setAttachUrl(e.target.value)}
                      placeholder="Вставьте ссылку…"
                      className="attach-field-input"
                      onKeyDown={(e) => e.key === 'Enter' && addAttachment()}
                    />
                    <div className="attach-field-actions">
                      <button
                        type="button"
                        onClick={addAttachment}
                        className="attach-field-btn"
                        title="Добавить ссылку"
                      >
                        <Link2 size={16} />
                      </button>
                      <ImageUploadButton
                        iconOnly
                        label="Загрузить скрин"
                        onUploaded={async (url, name) => {
                          await api.addAttachment(taskId, url, name)
                          await load()
                          onUpdate()
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}

              <button type="button" onClick={save} disabled={saving || !dirty} className="btn btn-gold w-full">
                {saving ? 'Сохранение…' : 'Сохранить'}
              </button>
            </div>
          )}

          {tab === 'comments' && (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto p-6 pb-3 ll-scroll">
                <div className="space-y-2">
                  {task.comments.length === 0 ? (
                    <p className="py-8 text-center text-sm text-white/35">Комментариев пока нет</p>
                  ) : (
                    task.comments.map((c) => (
                      <div key={c.id} className="glass-card p-3 text-sm">
                        <div className="mb-1 flex justify-between text-caption">
                          <span className="font-medium text-white/70">{c.author_name || `id${c.author_vk_id}`}</span>
                          <span>{new Date(c.created_at).toLocaleString('ru-RU')}</span>
                        </div>
                        {isImageUrl(c.body) ? (
                          <a href={c.body} target="_blank" rel="noreferrer">
                            <img src={c.body} alt="" className="max-h-48 rounded-lg border border-white/10" />
                          </a>
                        ) : (
                          <p className="whitespace-pre-wrap">{c.body}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="msg-composer-foot shrink-0">
                <MessageComposer
                  placeholder="Сообщение…"
                  onSend={async (body) => {
                    try {
                      await sendComment(body)
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Ошибка комментария')
                      throw e
                    }
                  }}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
