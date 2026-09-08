import type { CSSProperties } from 'react'
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

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={cn('sl-skeleton', className)} style={style} aria-hidden />
}

export type PageSkeletonVariant =
  | 'registry'
  | 'cards'
  | 'dashboard'
  | 'checklist'
  | 'detail'
  | 'table'
  | 'kanban'
  | 'list'
  | 'form'

function sk(i: number): CSSProperties {
  return { '--sk': i } as CSSProperties
}

export function PageSkeleton({
  variant = 'registry',
  label = 'Загрузка',
  className,
}: {
  variant?: PageSkeletonVariant
  label?: string
  className?: string
}) {
  if (variant === 'list') {
    return (
      <div
        className={cn('page-skeleton tasks-loading tasks-loading--list', className)}
        aria-busy="true"
        aria-label={label}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="tasks-loading-list-row page-skeleton-in" style={sk(i)}>
            <Skeleton className="tasks-loading-list-title" />
            <Skeleton className="tasks-loading-list-meta" />
          </div>
        ))}
      </div>
    )
  }

  if (variant === 'kanban') {
    return (
      <div
        className={cn(
          'page-skeleton tasks-loading tasks-loading--kanban tasks-kanban-view flex min-h-0 flex-1 flex-col',
          className,
        )}
        aria-busy="true"
        aria-label={label}
      >
        <div className="kanban-board min-h-0 flex-1">
          {[2, 3, 2].map((cardCount, col) => (
            <div key={col} className="kanban-column tasks-loading-column" style={sk(col)}>
              <div className="kanban-column-head">
                <Skeleton className="tasks-loading-col-title" />
              </div>
              <div className="kanban-drop">
                {Array.from({ length: cardCount }).map((_, i) => (
                  <div key={i} className="tasks-loading-card page-skeleton-in" style={sk(col * 2 + i)}>
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

  if (variant === 'cards') {
    return (
      <div className={cn('page-skeleton page-skeleton--cards', className)} aria-busy="true" aria-label={label}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="page-skeleton-card page-skeleton-card--tile page-skeleton-in" style={sk(i)}>
            <Skeleton className="page-skeleton-icon" />
            <Skeleton className="page-skeleton-line page-skeleton-line--title" />
            <Skeleton className="page-skeleton-line" />
            <Skeleton className="page-skeleton-line page-skeleton-line--short" />
          </div>
        ))}
      </div>
    )
  }

  if (variant === 'dashboard') {
    return (
      <div className={cn('page-skeleton page-skeleton--dashboard', className)} aria-busy="true" aria-label={label}>
        <div className="page-skeleton-stats">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="page-skeleton-card page-skeleton-stat page-skeleton-in" style={sk(i)}>
              <Skeleton className="page-skeleton-line page-skeleton-line--stat" />
              <Skeleton className="page-skeleton-line page-skeleton-line--short" />
            </div>
          ))}
        </div>
        <div className="page-skeleton-card page-skeleton-panel">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="page-skeleton-list-row page-skeleton-in" style={sk(i + 4)}>
              <Skeleton className="page-skeleton-line page-skeleton-line--title" />
              <Skeleton className="page-skeleton-line page-skeleton-line--meta" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (variant === 'checklist') {
    return (
      <div className={cn('page-skeleton page-skeleton--checklist', className)} aria-busy="true" aria-label={label}>
        <div className="page-skeleton-pills">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="page-skeleton-pill page-skeleton-in" style={sk(i)} />
          ))}
        </div>
        <div className="page-skeleton-card page-skeleton-grid">
          {Array.from({ length: 28 }).map((_, i) => (
            <Skeleton key={i} className="page-skeleton-cell page-skeleton-in" style={sk(i)} />
          ))}
        </div>
      </div>
    )
  }

  if (variant === 'detail') {
    return (
      <div className={cn('page-skeleton page-skeleton--detail', className)} aria-busy="true" aria-label={label}>
        <div className="page-skeleton-card page-skeleton-hero page-skeleton-in" style={sk(0)}>
          <Skeleton className="page-skeleton-avatar page-skeleton-avatar--lg" />
          <div className="page-skeleton-hero-copy">
            <Skeleton className="page-skeleton-line page-skeleton-line--title" />
            <Skeleton className="page-skeleton-line page-skeleton-line--meta" />
          </div>
        </div>
        <div className="page-skeleton-card page-skeleton-panel">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="page-skeleton-field page-skeleton-in" style={sk(i + 1)}>
              <Skeleton className="page-skeleton-line page-skeleton-line--label" />
              <Skeleton className="page-skeleton-line page-skeleton-line--title" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (variant === 'table') {
    return (
      <div className={cn('page-skeleton page-skeleton--table', className)} aria-busy="true" aria-label={label}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="page-skeleton-table-row page-skeleton-in" style={sk(i)}>
            <Skeleton className="page-skeleton-line page-skeleton-line--stamp" />
            <Skeleton className="page-skeleton-line page-skeleton-line--title" />
          </div>
        ))}
      </div>
    )
  }

  if (variant === 'form') {
    return (
      <div className={cn('page-skeleton page-skeleton--form', className)} aria-busy="true" aria-label={label}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="page-skeleton-field page-skeleton-in" style={sk(i)}>
            <Skeleton className="page-skeleton-line page-skeleton-line--label" />
            <Skeleton className="page-skeleton-control" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={cn('page-skeleton page-skeleton--registry', className)} aria-busy="true" aria-label={label}>
      <div className="page-skeleton-registry-head page-skeleton-in" style={sk(0)}>
        <Skeleton className="page-skeleton-line page-skeleton-line--th" />
        <Skeleton className="page-skeleton-line page-skeleton-line--th" />
        <Skeleton className="page-skeleton-line page-skeleton-line--th" />
        <Skeleton className="page-skeleton-line page-skeleton-line--th" />
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="page-skeleton-registry-row page-skeleton-in" style={sk(i + 1)}>
          <Skeleton className="page-skeleton-line page-skeleton-line--num" />
          <div className="page-skeleton-nick">
            <Skeleton className="page-skeleton-avatar" />
            <Skeleton className="page-skeleton-line page-skeleton-line--title" />
          </div>
          <Skeleton className="page-skeleton-line page-skeleton-line--meta" />
          <Skeleton className="page-skeleton-line page-skeleton-line--meta" />
        </div>
      ))}
    </div>
  )
}

export function TasksLoadingSkeleton({ view }: { view: 'kanban' | 'list' }) {
  return <PageSkeleton variant={view} label="Загрузка задач" />
}
