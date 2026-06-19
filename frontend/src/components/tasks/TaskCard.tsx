import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AlertTriangle, FolderKanban, GripVertical, MessageSquare } from 'lucide-react'
import { type CSSProperties, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { PRIORITY_LABELS, STATUS_LABELS, type Task, type TaskDetail } from '../../api'
import { normalizeLabels } from '../../lib/labels'
import { cn, formatDueDate, isOverdue, priorityBadgeClass, statusBadgeClass, TASK_TYPE_LABELS, taskTypeBadgeClass } from '../../lib/utils'

const DEFAULT_AVATAR = 'https://vk.com/images/camera_100.png'

function assigneeLine(task: Task): string {
  if (task.assignee_names?.length) return task.assignee_names.join(', ')
  if (task.assignee_name) return task.assignee_name
  const ids = task.assignee_vk_ids?.length
    ? task.assignee_vk_ids
    : task.assignee_vk_id
      ? [task.assignee_vk_id]
      : []
  if (!ids.length) return 'Не назначен'
  return ids.map((id) => `id${id}`).join(', ')
}

function commentMeta(task: Task) {
  const detail = task as TaskDetail
  const count = task.comment_count ?? detail.comments?.length ?? 0
  const avatar = task.last_comment_author_avatar_url
  const name = task.last_comment_author_name
  return { count, avatar, name }
}

function TaskCardContent({ task }: { task: Task }) {
  const overdue = isOverdue(task.due_date) && task.status !== 'done' && task.status !== 'cancelled'
  const priority = task.priority || 'medium'
  const labels = normalizeLabels(task.labels)
  const { count: commentCount, avatar, name } = commentMeta(task)

  return (
    <>
      <div className="mb-1 flex min-w-0 items-start justify-between gap-2">
        <span className="line-clamp-2 min-w-0 break-words text-sm font-medium leading-snug">{task.title}</span>
        <span className="shrink-0 text-[10px] text-white/30">#{task.id}</span>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {task.task_type && task.task_type !== 'assignment' && (
          <span className={cn('badge-pill text-[10px]', taskTypeBadgeClass(task.task_type))}>
            {TASK_TYPE_LABELS[task.task_type] || task.task_type}
          </span>
        )}
        <span className={cn('badge-pill text-[10px]', priorityBadgeClass(priority))}>
          {PRIORITY_LABELS[priority] || priority}
        </span>
        {task.project_title && (
          <span className="badge-pill text-[10px] badge-gold inline-flex items-center gap-1">
            <FolderKanban size={10} />
            {task.project_title}
          </span>
        )}
        {labels.slice(0, 3).map((label) => (
          <span
            key={label.name}
            className="task-label-chip task-label-chip--sm"
            style={{ '--label-color': label.color } as CSSProperties}
          >
            {label.name}
          </span>
        ))}
      </div>

      {task.due_date && (
        <div className={cn('mt-2 flex items-center gap-1 text-xs', overdue ? 'text-red-400' : 'text-white/40')}>
          {overdue && <AlertTriangle size={12} />}
          {formatDueDate(task.due_date)}
        </div>
      )}

      <div className="mt-2 flex min-w-0 items-center justify-between gap-2 text-xs text-white/40">
        <span className="min-w-0 flex-1 truncate">{assigneeLine(task)}</span>
        {commentCount > 0 && (
          <span className="flex shrink-0 items-center gap-1.5" title={name ? `Последний: ${name}` : undefined}>
            {avatar && (
              <img
                src={avatar || DEFAULT_AVATAR}
                alt=""
                className="h-5 w-5 rounded-full border border-white/10 object-cover"
              />
            )}
            <MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </div>
    </>
  )
}

export function TaskCardPreview({ task }: { task: TaskDetail }) {
  const priority = task.priority || 'medium'
  return (
    <div className={cn('task-card cursor-grabbing opacity-95', `task-card--${priority}`)}>
      <TaskCardContent task={task} />
    </div>
  )
}

export function TaskCard({
  task,
  onSelect,
  selected,
}: {
  task: TaskDetail
  onSelect: (t: TaskDetail, e: MouseEvent) => void
  selected?: boolean
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id! })

  const priority = task.priority || 'medium'
  const style = {
    transform: isDragging ? undefined : CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'task-card flex min-w-0 gap-2 overflow-hidden',
        `task-card--${priority}`,
        isDragging && 'opacity-40',
        selected && 'task-card--selected',
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="shrink-0 border-0 bg-transparent p-0 text-white/25 cursor-grab"
        aria-label="Перетащить"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} />
      </button>
      <button
        type="button"
        className="min-w-0 flex-1 border-0 bg-transparent p-0 text-left text-inherit"
        onClick={(e) => onSelect(task, e)}
      >
        <TaskCardContent task={task} />
      </button>
    </div>
  )
}

export function TaskListRow({ task, onSelect }: { task: TaskDetail; onSelect: (t: TaskDetail) => void }) {
  const { count: commentCount, avatar } = commentMeta(task)
  return (
    <button
      type="button"
      onClick={() => onSelect(task)}
      className="task-list-row glass-card p-4 w-full text-left text-white hover:bg-white/[0.02] border-0 cursor-pointer flex justify-between items-center gap-4"
    >
      <div className="min-w-0">
        <div className="font-medium text-sm truncate">{task.title}</div>
        {task.project_title && (
          <Link
            to={`/projects/${task.project_id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-[var(--accent-gold)]/80 no-underline hover:underline mt-0.5 inline-flex items-center gap-1"
          >
            <FolderKanban size={11} />
            {task.project_title}
          </Link>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {commentCount > 0 && (
          <span className="flex items-center gap-1 text-xs text-white/40">
            {avatar && (
              <img src={avatar} alt="" className="h-5 w-5 rounded-full border border-white/10 object-cover" />
            )}
            <MessageSquare size={12} />
            {commentCount}
          </span>
        )}
        <span className={cn('badge-pill', statusBadgeClass(task.status))}>
          {STATUS_LABELS[task.status || 'todo']}
        </span>
        <span className={cn('badge-pill', priorityBadgeClass(task.priority))}>
          {PRIORITY_LABELS[task.priority || 'medium']}
        </span>
      </div>
    </button>
  )
}
