import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export type AlertVariant = 'danger' | 'success' | 'warning' | 'info'

export function Alert({
  variant = 'danger',
  children,
  className,
}: {
  variant?: AlertVariant
  children: ReactNode
  className?: string
}) {
  return (
    <p className={cn('sl-alert', `sl-alert--${variant}`, className)} role="alert">
      {children}
    </p>
  )
}
