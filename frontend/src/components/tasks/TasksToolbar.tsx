import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ChevronDown, Filter, LayoutGrid, List, RotateCcw } from 'lucide-react'
import { PRIORITY_LABELS, type Project, type StaffMember } from '../../api'
import { staffLabel } from '../../lib/staff'
import { cn } from '../../lib/utils'
import { Select } from '../ui/Select'

export interface TaskFilters {
  mine: boolean
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
      Number(Boolean(filters.assigneeVkId)) +
      Number(Boolean(filters.priority)) +
      Number(Boolean(filters.projectId)),
    [filters],
  )

  const reset = () =>
    onChange({
      mine: false,
      assigneeVkId: '',
      priority: '',
      projectId: hideProjectFilter ? filters.projectId : '',
    })

  return (
    <div className="tasks-toolbar shrink-0">
      <div className="tasks-toolbar-row">
        {onCreate && (
          <button type="button" onClick={onCreate} className="btn btn-gold tasks-toolbar-create">
            <Plus size={16} />
            Задача
          </button>
        )}

        <button
          type="button"
          className={cn('tasks-filter-toggle', (open || activeCount > 0) && 'tasks-filter-toggle--active')}
          onClick={() => setOpen((v) => !v)}
        >
          <Filter size={15} />
          Фильтры
          {activeCount > 0 && <span className="tasks-filter-count">{activeCount}</span>}
          <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} />
        </button>

        <span className="tasks-count text-sm text-white/40">
          {shown} из {total}
        </span>

        <div className="view-toggle tasks-view-toggle flex rounded-xl border border-white/10 bg-black/20 p-0.5">
          <button
            type="button"
            className={cn('px-2.5 py-1.5 rounded-lg border-0 bg-transparent cursor-pointer', filters.view === 'kanban' && 'view-toggle-active')}
            onClick={() => onChange({ view: 'kanban' })}
            title="Канбан"
          >
            <LayoutGrid size={15} />
          </button>
          <button
            type="button"
            className={cn('px-2.5 py-1.5 rounded-lg border-0 bg-transparent cursor-pointer', filters.view === 'list' && 'view-toggle-active')}
            onClick={() => onChange({ view: 'list' })}
            title="Список"
          >
            <List size={15} />
          </button>
        </div>
      </div>

      {open && (
        <div className="tasks-filters-panel">
          <button
            type="button"
            className={cn('filter-chip', filters.mine && 'active')}
            onClick={() => onChange({ mine: !filters.mine, assigneeVkId: '' })}
          >
            Мои
          </button>
          <div className="w-full sm:w-44">
            <Select value={filters.assigneeVkId} onChange={(v) => onChange({ assigneeVkId: v, mine: false })} options={assigneeOptions} />
          </div>
          <div className="w-full sm:w-40">
            <Select
              value={filters.priority}
              onChange={(v) => onChange({ priority: v })}
              options={[
                { value: '', label: 'Все приоритеты' },
                ...Object.entries(PRIORITY_LABELS).map(([value, label]) => ({ value, label })),
              ]}
            />
          </div>
          {!hideProjectFilter && (
            <div className="w-full sm:w-48">
              <Select value={filters.projectId} onChange={(v) => onChange({ projectId: v })} options={projectOptions} />
            </div>
          )}
          <button type="button" className="filter-chip" onClick={reset}>
            <RotateCcw size={14} />
            Сброс
          </button>
        </div>
      )}
    </div>
  )
}
