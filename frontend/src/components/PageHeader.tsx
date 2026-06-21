import type { LucideIcon } from 'lucide-react'
import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../lib/utils'

export interface PageHeaderProps {
  section: string
  title: string
  icon?: LucideIcon
  emoji?: string
  leading?: ReactNode
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
  emoji,
  leading,
  subtitle,
  hint,
  actions,
  back,
  className,
  shrink,
}: PageHeaderProps) {
  const titleLeading =
    leading ??
    (emoji ? (
      <span className="page-title-emoji" aria-hidden>
        {emoji}
      </span>
    ) : Icon ? (
      <Icon size={20} strokeWidth={1.75} className="page-title-icon" aria-hidden />
    ) : null)

  return (
    <div className={cn('page-header', back && 'page-header--sub', shrink && 'shrink-0', className)}>
      <div className="page-header-main">
        {back ? (
          <nav className="page-header-crumb" aria-label="Навигация">
            <Link to={back.href} className="page-header-back">
              <ChevronLeft size={16} aria-hidden />
              {back.label}
            </Link>
            <span className="page-header-crumb-sep" aria-hidden>
              /
            </span>
            <span className="page-header-crumb-section">{section}</span>
          </nav>
        ) : (
          <div className="page-header-eyebrow">{section}</div>
        )}

        <div className="page-header-title-block">
          <div className={cn('page-header-heading', !!titleLeading && 'page-header-heading--with-icon')}>
            {titleLeading}
            <h1 className="page-title">{title}</h1>
          </div>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>

        {hint && <div className="page-header-hint">{hint}</div>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  )
}
