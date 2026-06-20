import { cn } from '../../lib/utils'

interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
  boxClassName?: string
}

export function Checkbox({ checked, onChange, disabled, className, boxClassName }: CheckboxProps) {
  return (
    <>
      <input
        type="checkbox"
        className={cn('ui-checkbox', className)}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={cn('ui-checkbox-box', boxClassName)} aria-hidden />
    </>
  )
}
