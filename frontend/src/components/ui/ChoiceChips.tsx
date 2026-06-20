import { cn } from '../../lib/utils'

interface ChoiceChipsProps {
  options: Record<string, string>
  value: string[]
  onChange: (value: string[]) => void
  emptyLabel?: string
}

export function ChoiceChips({ options, value, onChange, emptyLabel }: ChoiceChipsProps) {
  const toggle = (key: string) => {
    onChange(value.includes(key) ? value.filter((x) => x !== key) : [...value, key])
  }

  return (
    <div className="choice-chips">
      {emptyLabel && value.length === 0 && (
        <span className="choice-chips-empty">{emptyLabel}</span>
      )}
      {Object.entries(options).map(([key, label]) => {
        const active = value.includes(key)
        return (
          <button
            key={key}
            type="button"
            className={cn('choice-chip', active && 'choice-chip--active')}
            aria-pressed={active}
            onClick={() => toggle(key)}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
