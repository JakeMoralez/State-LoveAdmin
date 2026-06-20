import { cn } from '../../lib/utils'

interface NumberInputProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  className?: string
  disabled?: boolean
}

export function NumberInput({ value, onChange, min, max, step, className, disabled }: NumberInputProps) {
  return (
    <input
      type="number"
      className={cn('control number-input', className)}
      value={Number.isFinite(value) ? value : ''}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onChange={(e) => {
        const raw = e.target.value
        onChange(raw === '' ? 0 : Number(raw))
      }}
    />
  )
}
