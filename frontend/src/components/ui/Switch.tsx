import { cn } from '../../lib/utils'

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  id?: string
  className?: string
  'aria-label'?: string
}

/** On/off для режима секции (не multi-select). */
export function Switch({
  checked,
  onChange,
  disabled,
  id,
  className,
  'aria-label': ariaLabel,
}: SwitchProps) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      className={cn('ui-switch', checked && 'ui-switch--on', className)}
      onClick={() => onChange(!checked)}
    >
      <span className="ui-switch-thumb" aria-hidden />
    </button>
  )
}
