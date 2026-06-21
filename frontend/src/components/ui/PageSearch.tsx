import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface PageSearchProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  /** Standalone bar (default) or slot inside PageToolbarRow */
  variant?: 'bar' | 'row'
}

export function PageSearch({
  value,
  onChange,
  placeholder = 'Поиск…',
  className,
  variant = 'bar',
}: PageSearchProps) {
  const input = (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="control page-toolbar-search"
    />
  )

  if (variant === 'row') {
    return <div className={cn('page-toolbar-search-slot', className)}>{input}</div>
  }

  return <div className={cn('page-toolbar shrink-0', className)}>{input}</div>
}

export function PageToolbarRow({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={cn('page-toolbar-row shrink-0', className)}>{children}</div>
}

export function PageToolbarActions({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={cn('page-toolbar-actions', className)}>{children}</div>
}
