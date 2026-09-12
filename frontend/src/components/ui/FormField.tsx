import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react'
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
  htmlFor?: string
}

const NATIVE_CONTROLS = new Set(['input', 'textarea', 'select', 'button'])

export function FormField({ label, children, className, hint, required, htmlFor }: FormFieldProps) {
  const autoId = useId()
  const id = htmlFor ?? autoId
  const title = label.replace(/\s*\*\s*$/, '')
  const showReq = required || /\*\s*$/.test(label)

  let control = children
  if (isValidElement(children)) {
    const type = children.type
    const canTakeId = typeof type !== 'string' || NATIVE_CONTROLS.has(type)
    if (canTakeId) {
      control = cloneElement(children as ReactElement<{ id?: string }>, {
        id: (children.props as { id?: string }).id ?? id,
      })
    }
  }

  return (
    <div className={cn('form-field', className)}>
      <label className="form-label" htmlFor={id}>
        {title}
        {showReq ? <FieldReq /> : null}
      </label>
      {control}
      {hint && <span className="form-hint">{hint}</span>}
    </div>
  )
}
