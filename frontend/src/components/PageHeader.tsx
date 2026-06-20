import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../lib/utils'

export interface PageHeaderProps {
  section: string
  title: string
  icon?: LucideIcon
  subtitle?: ReactNode
  hint?: ReactNode
  actions?: ReactNode
  back?: { href: string; label: string }
  className?: string
  shrink?: boolean
}

export function PageHeader({
  section,
  title,
  icon: Icon,
  subtitle,
  hint,
  actions,
  back,
  className,
  shrink,
}: PageHeaderProps) {
  return (
    <div className={cn('page-header', shrink && 'shrink-0', className)}>
      <div className="page-header-main">
        {back && (
          <Link to={back.href} className="page-header-back">
            ← {back.label}
          </Link>
        )}
        <div className="page-header-eyebrow">{section}</div>
        <h1 className="page-title">
          {Icon && <Icon size={22} className="page-title-icon" aria-hidden />}
          <span>{title}</span>
        </h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
        {hint && <div className="page-header-hint">{hint}</div>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  )
}
