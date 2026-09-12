import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ChevronDown, Filter, LayoutGrid, List, RotateCcw } from 'lucide-react'
import { PRIORITY_LABELS, type Project, type StaffMember } from '../../api'
import { staffLabel } from '../../lib/staff'
import { cn } from '../../lib/utils'
import { Select } from '../ui/Select'

export interface TaskFilters {
  mine: boolean
  overdue: boolean
  assigneeVkId: string
  priority: string
  projectId: string
  view: 'kanban' | 'list'
}

interface TasksToolbarProps {
  filters: TaskFilters
  onChange: (patch: Partial<TaskFilters>) => void
  staff: StaffMember[]
  projects: Project[]
  shown: number
  total: number
  hideProjectFilter?: boolean
  onCreate?: () => void
}

export function TasksToolbar({
  filters,
  onChange,
  staff,
  projects,
  shown,
  total,
  hideProjectFilter,
  onCreate,
}: TasksToolbarProps) {
  const [open, setOpen] = useState(false)

  const assigneeOptions = [
    { value: '', label: 'Все исполнители' },
    { value: 'none', label: 'Без исполнителя' },
    ...staff.map((s) => ({ value: String(s.vk_id), label: staffLabel(s) })),
  ]

  const projectOptions = [
    { value: '', label: 'Все проекты' },
    ...projects.map((p) => ({ value: String(p.id), label: p.title })),
  ]

  const activeCount = useMemo(
    () =>
      Number(filters.mine) +
      Number(filters.overdue) +
      Number(Boolean(filters.assigneeVkId)) +
      Number(Boolean(filters.priority)) +
      Number(Boolean(filters.projectId)),
    [filters],
  )

  const reset = () =>
    onChange({
      mine: false,
      overdue: false,
      assigneeVkId: '',
      priority: '',
      projectId: hideProjectFilter ? filters.projectId : '',
    })

  return (
    <div className="tasks-toolbar-panel shrink-0">
      <div className="tasks-toolbar-panel-row">
        {onCreate && (
          <button type="button" onClick={onCreate} className="btn-primary btn-sm tasks-toolbar-create shrink-0">
            <Plus size={16} aria-hidden />
            Задача
          </button>
        )}

          <button
            type="button"
            className={cn('btn-secondary btn-sm tasks-filter-toggle', open && 'tasks-filter-toggle--open')}
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            <Filter size={14} aria-hidden />
            Фильтры
            {activeCount > 0 && <span className="tasks-filter-count">{activeCount}</span>}
            <ChevronDown size={14} className={cn('tasks-filter-chevron', open && 'tasks-filter-chevron--open')} aria-hidden />
          </button>

        <span className="tasks-count">
          {shown} из {total}
        </span>

        <div className="tasks-view-toggle" role="group" aria-label="Вид списка">
          <button
            type="button"
            className={cn('tasks-view-btn', filters.view === 'kanban' && 'tasks-view-btn--active')}
            onClick={() => onChange({ view: 'kanban' })}
            title="Канбан"
            aria-label="Канбан"
            aria-pressed={filters.view === 'kanban'}
          >
            <LayoutGrid size={14} aria-hidden />
          </button>
          <button
            type="button"
            className={cn('tasks-view-btn', filters.view === 'list' && 'tasks-view-btn--active')}
            onClick={() => onChange({ view: 'list' })}
            title="Список"
            aria-label="Список"
            aria-pressed={filters.view === 'list'}
          >
            <List size={14} aria-hidden />
          </button>
        </div>
      </div>

      {open && (
        <div className="tasks-filters-panel">
          <button
            type="button"
            className={cn('btn-secondary btn-sm tasks-filter-mine', filters.mine && 'tasks-filter-mine--active')}
            onClick={() => onChange({ mine: !filters.mine, assigneeVkId: '' })}
          >
            Мои
          </button>
          <button
            type="button"
            className={cn('btn-secondary btn-sm tasks-filter-mine', filters.overdue && 'tasks-filter-mine--active')}
            onClick={() => onChange({ overdue: !filters.overdue })}
          >
            Просроченные
          </button>
          <div className="tasks-filter-field">
            <Select
              size="sm"
              value={filters.assigneeVkId}
              onChange={(v) => onChange({ assigneeVkId: v, mine: false })}
              options={assigneeOptions}
              aria-label="Исполнитель"
            />
          </div>
          <div className="tasks-filter-field">
            <Select
              size="sm"
              value={filters.priority}
              onChange={(v) => onChange({ priority: v })}
              aria-label="Приоритет"
              options={[
                { value: '', label: 'Все приоритеты' },
                ...Object.entries(PRIORITY_LABELS).map(([value, label]) => ({ value, label })),
              ]}
            />
          </div>
          {!hideProjectFilter && (
            <div className="tasks-filter-field">
              <Select
                size="sm"
                value={filters.projectId}
                onChange={(v) => onChange({ projectId: v })}
                options={projectOptions}
                aria-label="Проект"
              />
            </div>
          )}
          <button type="button" className="btn-ghost btn-sm tasks-filter-reset" onClick={reset}>
            <RotateCcw size={14} aria-hidden />
            Сброс
          </button>
        </div>
      )}
    </div>
  )
}
