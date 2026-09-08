import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export function FieldReq() {
  return (
    <span className="field-req" aria-hidden>
      *
    </span>
  )
}

interface FormFieldProps {
  label: string
  children: ReactNode
  className?: string
  hint?: string
  required?: boolean
}

export function FormField({ label, children, className, hint, required }: FormFieldProps) {
  const title = label.replace(/\s*\*\s*$/, '')
  return (
    <div className={cn('form-field', className)}>
      <span className="form-label">
        {title}
        {required || /\*\s*$/.test(label) ? <FieldReq /> : null}
      </span>
      {children}
      {hint && <span className="form-hint">{hint}</span>}
    </div>
  )
}
