import { Minus, Plus } from 'lucide-react'
import { cn } from '../../lib/utils'

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function NumberStepper({
  value,
  onChange,
  min,
  max,
  ariaLabel,
  className,
}: {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  ariaLabel: string
  className?: string
}) {
  const safeValue = clamp(Number.isFinite(value) ? value : min, min, max)

  const step = (delta: number) => {
    onChange(clamp(safeValue + delta, min, max))
  }

  const onInput = (raw: string) => {
    if (raw.trim() === '') return
    const next = Number(raw)
    if (!Number.isFinite(next)) return
    onChange(clamp(Math.trunc(next), min, max))
  }

  return (
    <div className={cn('num-stepper', className)}>
      <button
        type="button"
        className="num-stepper-btn"
        aria-label={`${ariaLabel}: уменьшить`}
        disabled={safeValue <= min}
        onClick={() => step(-1)}
      >
        <Minus size={14} />
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        className="control num-stepper-value"
        value={safeValue}
        aria-label={ariaLabel}
        onChange={(e) => onInput(e.target.value)}
        onBlur={(e) => onInput(e.target.value || String(min))}
      />
      <button
        type="button"
        className="num-stepper-btn"
        aria-label={`${ariaLabel}: увеличить`}
        disabled={safeValue >= max}
        onClick={() => step(1)}
      >
        <Plus size={14} />
      </button>
    </div>
  )
}
