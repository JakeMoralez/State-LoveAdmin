import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface FormFieldProps {
  label: string
  children: ReactNode
  className?: string
  hint?: string
}

export function FormField({ label, children, className, hint }: FormFieldProps) {
  return (
    <div className={cn('form-field', className)}>
      <span className="form-label">{label}</span>
      {children}
      {hint && <span className="form-hint">{hint}</span>}
    </div>
  )
}
