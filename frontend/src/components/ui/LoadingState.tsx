import { cn } from '../../lib/utils'

export function LoadingState({
  label = 'Загрузка…',
  className,
  compact = false,
}: {
  label?: string
  className?: string
  compact?: boolean
}) {
  return (
    <div
      className={cn('sl-loading', compact && 'sl-loading--compact', className)}
      role="status"
      aria-live="polite"
    >
      <div className="sl-loading-spinner" aria-hidden />
      <span className="sl-loading-label">{label}</span>
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('sl-skeleton', className)} aria-hidden />
}

export function TasksLoadingSkeleton({ view }: { view: 'kanban' | 'list' }) {
  if (view === 'list') {
    return (
      <div className="tasks-loading tasks-loading--list" aria-busy="true" aria-label="Загрузка задач">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="tasks-loading-list-row">
            <Skeleton className="tasks-loading-list-title" />
            <Skeleton className="tasks-loading-list-meta" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div
      className="tasks-loading tasks-loading--kanban tasks-kanban-view flex min-h-0 flex-1 flex-col"
      aria-busy="true"
      aria-label="Загрузка задач"
    >
      <div className="kanban-board min-h-0 flex-1">
        {[2, 3, 2].map((cardCount, col) => (
          <div key={col} className="kanban-column tasks-loading-column">
            <div className="kanban-column-head">
              <Skeleton className="tasks-loading-col-title" />
            </div>
            <div className="kanban-drop">
              {Array.from({ length: cardCount }).map((_, i) => (
                <div key={i} className="tasks-loading-card">
                  <Skeleton className="tasks-loading-card-line tasks-loading-card-line--wide" />
                  <Skeleton className="tasks-loading-card-line" />
                  <Skeleton className="tasks-loading-card-line tasks-loading-card-line--short" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
