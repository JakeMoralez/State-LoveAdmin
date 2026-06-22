import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ClipboardList, type LucideIcon } from 'lucide-react'
import { api, STATUS_LABELS, type Project, type StaffMember, type TaskDetail } from '../api'
import { pickDefaultCreateSphere } from '../components/CreateSphereField'
import { PageHeader } from '../components/PageHeader'
import { SphereTabs, useWorkSphereQuery } from '../components/SphereTabs'
import { TaskCard, TaskCardPreview, TaskListRow } from '../components/tasks/TaskCard'
import { TaskCreateModal, type TaskCreatePayload } from '../components/tasks/TaskCreateModal'
import { TaskDrawer } from '../components/tasks/TaskDrawer'
import { TasksToolbar, type TaskFilters } from '../components/tasks/TasksToolbar'
import { useAuth } from '../context/AuthContext'
import { COMPACT_QUERY, matchesMediaQuery } from '../hooks/useMediaQuery'
import { cn } from '../lib/utils'

const KANBAN_STATUSES = ['backlog', 'todo', 'in_progress', 'review', 'done']

const TASKS_VIEW_KEY = 'sl-tasks-view'

function getInitialTaskView(): 'kanban' | 'list' {
  if (typeof window === 'undefined') return 'kanban'
  const saved = sessionStorage.getItem(TASKS_VIEW_KEY)
  if (saved === 'kanban' || saved === 'list') return saved
  if (matchesMediaQuery(COMPACT_QUERY)) return 'list'
  return 'kanban'
}

interface TasksWorkspaceProps {
  projectId?: number
  spheres?: string[]
  apiSpheres?: string[]
  createSphere?: string
  onCreateSphereChange?: (id: string) => void
  onSpheresChange?: (next: string[]) => void
  workSpheres?: import('../api').WorkSphere[]
  title?: string
  subtitle?: string
  section?: string
  headerIcon?: LucideIcon
  headerBack?: { href: string; label: string }
  taskPathPrefix?: string
  taskIdParam?: string
}

export function TasksWorkspace({
  projectId,
  spheres,
  apiSpheres,
  createSphere,
  onCreateSphereChange,
  onSpheresChange,
  workSpheres,
  title = 'Задачи',
  subtitle,
  section = 'Работа',
  headerIcon: HeaderIcon = ClipboardList,
  headerBack,
  taskPathPrefix = '/tasks',
  taskIdParam,
}: TasksWorkspaceProps) {
  const navigate = useNavigate()

  const [filters, setFilters] = useState<TaskFilters>(() => ({
    mine: false,
    assigneeVkId: '',
    priority: '',
    projectId: projectId ? String(projectId) : '',
    view: getInitialTaskView(),
  }))
  const [listTasks, setListTasks] = useState<TaskDetail[]>([])
  const [columns, setColumns] = useState<Record<string, TaskDetail[]>>({})
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const apiParams = useMemo(() => {
    const p: Parameters<typeof api.tasks>[0] = { view: filters.view }
    if (projectId != null) p.project_id = projectId
    else if (filters.projectId) p.project_id = parseInt(filters.projectId, 10)
    if (filters.mine) p.mine = true
    else if (filters.assigneeVkId && filters.assigneeVkId !== 'none') {
      p.assignee_vk_id = parseInt(filters.assigneeVkId, 10)
    }
    if (filters.priority) p.priority = filters.priority
    if (apiSpheres?.length) p.spheres = apiSpheres
    return p
  }, [filters, projectId, apiSpheres])

  const filterTasks = useCallback((items: TaskDetail[]) => {
    if (filters.assigneeVkId === 'none') {
      return items.filter((t) => {
        const ids = t.assignee_vk_ids?.length
          ? t.assignee_vk_ids
          : t.assignee_vk_id
            ? [t.assignee_vk_id]
            : []
        return ids.length === 0
      })
    }
    return items
  }, [filters.assigneeVkId])

  const load = useCallback(async () => {
    if (workSpheres && workSpheres.length > 0 && !spheres?.length) return
    setLoading(true)
    try {
      const res = await api.tasks(apiParams)
      if (res.view === 'kanban' && res.columns) {
        const next: Record<string, TaskDetail[]> = {}
        for (const [col, items] of Object.entries(res.columns)) {
          next[col] = filterTasks(items)
        }
        setColumns(next)
        setListTasks([])
      } else if (res.tasks) {
        setListTasks(filterTasks(res.tasks))
        setColumns({})
      }
    } finally {
      setLoading(false)
    }
  }, [apiParams, filterTasks, workSpheres, spheres])

  useEffect(() => {
    if (workSpheres && workSpheres.length > 0 && !spheres?.length) return
    load()
  }, [load, workSpheres, spheres])

  useEffect(() => {
    if (!spheres?.length && (workSpheres?.length ?? 0) > 0) return
    api.staff().then((r) => setStaff(r.members))
    api.projects(apiSpheres).then((r) => setProjects(r.projects))
  }, [apiSpheres, spheres, workSpheres])

  const allTasks = useMemo(() => {
    if (filters.view === 'list') return listTasks
    return Object.values(columns).flat()
  }, [filters.view, listTasks, columns])

  const handleSelect = (task: TaskDetail, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(task.id!)) next.delete(task.id!)
        else next.add(task.id!)
        return next
      })
      return
    }
    setSelectedIds(new Set())
    openTask(task)
  }

  const openTask = (task: TaskDetail) => navigate(`${taskPathPrefix}/${task.id}`)
  const closeTask = () => navigate(taskPathPrefix)

  const drawerId = taskIdParam ? parseInt(taskIdParam, 10) : null

  const resolveDropStatus = (overId: string | number): string | null => {
    const key = String(overId)
    if (KANBAN_STATUSES.includes(key)) return key
    const overTask = allTasks.find((t) => t.id === Number(overId))
    if (overTask?.status && KANBAN_STATUSES.includes(overTask.status)) return overTask.status
    return null
  }

  const onDragEnd = async (event: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = event
    if (!over) return
    const id = Number(active.id)
    const newStatus = resolveDropStatus(over.id)
    if (!newStatus) return

    const moveIds = selectedIds.has(id) && selectedIds.size > 1 ? Array.from(selectedIds) : [id]
    const tasksToMove = moveIds
      .map((tid) => allTasks.find((t) => t.id === tid))
      .filter((t): t is TaskDetail => !!t && t.status !== newStatus)
    if (!tasksToMove.length) return

    setColumns((prev) => {
      const next: Record<string, TaskDetail[]> = {}
      for (const col of KANBAN_STATUSES) next[col] = [...(prev[col] || [])]
      const moveSet = new Set(tasksToMove.map((t) => t.id))
      for (const col of KANBAN_STATUSES) {
        next[col] = next[col].filter((t) => !moveSet.has(t.id))
      }
      next[newStatus] = [
        ...tasksToMove.map((t) => ({ ...t, status: newStatus })),
        ...next[newStatus],
      ]
      return next
    })

    try {
      await Promise.all(tasksToMove.map((t) => api.updateTask(t.id!, { status: newStatus })))
      setSelectedIds(new Set())
    } catch {
      load()
    }
  }

  const activeTask = activeId ? allTasks.find((t) => t.id === activeId) : null

  const createTask = async (payload: TaskCreatePayload) => {
    await api.createTask(
      {
        ...payload,
        project_id: payload.project_id ?? projectId ?? null,
      },
      createSphere,
    )
    load()
  }

  return (
    <div className={cn('page-stack page-stack--tasks', filters.view === 'kanban' && 'content-fixed')}>
      <PageHeader
        section={section}
        title={title}
        icon={HeaderIcon}
        subtitle={subtitle}
        back={headerBack}
        shrink
      />

      {workSpheres && workSpheres.length === 0 ? (
        <p className="text-white/40 text-sm">Нет назначенных сфер — обратитесь к ЗГС.</p>
      ) : (
      <>
      {workSpheres && workSpheres.length > 0 && spheres && onSpheresChange && (
        <SphereTabs
          pageKey="tasks"
          spheres={workSpheres}
          selected={spheres}
          onSelectedChange={onSpheresChange}
          className="shrink-0"
        />
      )}

      <TasksToolbar
        filters={filters}
        onChange={(patch) => {
          setFilters((f) => {
            const next = { ...f, ...patch }
            if (patch.view) sessionStorage.setItem(TASKS_VIEW_KEY, patch.view)
            return next
          })
        }}
        staff={staff}
        projects={projects}
        shown={allTasks.length}
        total={allTasks.length}
        hideProjectFilter={projectId != null}
        onCreate={() => setCreateOpen(true)}
      />

      {selectedIds.size > 0 && filters.view === 'kanban' && (
        <div className="bulk-bar shrink-0">
          <span>Выбрано: {selectedIds.size}</span>
          <span className="text-white/35 text-xs">Ctrl+клик · перетащите в колонку</span>
          <button type="button" className="btn btn-ghost btn-sm ml-auto" onClick={() => setSelectedIds(new Set())}>
            Снять
          </button>
        </div>
      )}

      {loading ? (
        <div className="page-loading">Загрузка…</div>
      ) : filters.view === 'list' ? (
        <div className="list-stack">
          {listTasks.length === 0 ? (
            <p className="text-white/40">Задач нет</p>
          ) : (
            listTasks.map((t) => <TaskListRow key={t.id} task={t} onSelect={openTask} />)
          )}
        </div>
      ) : (
        <div className="tasks-kanban-view flex min-h-0 flex-1 flex-col">
          <p className="kanban-scroll-hint shrink-0" aria-hidden>
            Листайте колонки →
          </p>
          <DndContext
          sensors={sensors}
          collisionDetection={rectIntersection}
          onDragStart={(e) => setActiveId(Number(e.active.id))}
          onDragEnd={onDragEnd}
        >
          <div className="kanban-board min-h-0 flex-1">
            {KANBAN_STATUSES.map((status) => (
              <KanbanColumn
                key={status}
                id={status}
                title={STATUS_LABELS[status]}
                tasks={columns[status] || []}
                onSelect={handleSelect}
                selectedIds={selectedIds}
              />
            ))}
          </div>
          <DragOverlay>{activeTask ? <TaskCardPreview task={activeTask} /> : null}</DragOverlay>
        </DndContext>
        </div>
      )}
      </>
      )}

      <TaskCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={createTask}
        staff={staff}
        projects={projects}
        defaultProjectId={projectId}
        workSpheres={workSpheres}
        createSphereIds={spheres ?? []}
        createSphere={createSphere}
        onCreateSphereChange={onCreateSphereChange}
      />

      {drawerId != null && !Number.isNaN(drawerId) && (
        <TaskDrawer
          taskId={drawerId}
          staff={staff}
          projects={projects}
          onClose={closeTask}
          onUpdate={load}
        />
      )}
    </div>
  )
}

function KanbanColumn({
  id,
  title,
  tasks,
  onSelect,
  selectedIds,
}: {
  id: string
  title: string
  tasks: TaskDetail[]
  onSelect: (t: TaskDetail, e: React.MouseEvent) => void
  selectedIds: Set<number>
}) {
  const { setNodeRef, isOver } = useDroppable({ id })

  return (
    <div className="kanban-column">
      <div className="kanban-column-head">
        <span className="text-sm font-medium text-white/55">{title}</span>
        <span className="text-xs text-white/30">({tasks.length})</span>
      </div>
      <div ref={setNodeRef} className={cn('kanban-drop', isOver && 'kanban-drop--over')}>
        <SortableContext items={tasks.map((t) => t.id!)} strategy={verticalListSortingStrategy}>
          {tasks.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              onSelect={onSelect}
              selected={selectedIds.has(t.id!)}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  )
}

export function TasksPage() {
  const { taskId } = useParams()
  const { user } = useAuth()
  const workSpheres = user?.work_spheres ?? []
  const { selected: activeSpheres, apiSpheres, setSelected } = useWorkSphereQuery('tasks', workSpheres)
  const [createSphere, setCreateSphere] = useState(() =>
    pickDefaultCreateSphere(activeSpheres, workSpheres[0]?.id),
  )

  useEffect(() => {
    setCreateSphere((prev) => pickDefaultCreateSphere(activeSpheres, prev))
  }, [activeSpheres])

  return (
    <TasksWorkspace
      taskIdParam={taskId}
      spheres={activeSpheres}
      apiSpheres={apiSpheres}
      createSphere={createSphere}
      onCreateSphereChange={setCreateSphere}
      onSpheresChange={setSelected}
      workSpheres={workSpheres}
    />
  )
}
