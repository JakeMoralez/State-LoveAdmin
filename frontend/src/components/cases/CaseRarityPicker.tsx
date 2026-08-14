import { cn } from '../../lib/utils'
import { RARITY_OPTIONS, normalizeRarity } from './rouletteLayout'

export function CaseRarityPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const current = normalizeRarity(value)

  return (
    <div className="case-rarity-picker" role="radiogroup" aria-label="Редкость приза">
      {RARITY_OPTIONS.map((option) => {
        const active = current === option.value
        return (
          <button
            key={option.value || 'default'}
            type="button"
            role="radio"
            aria-checked={active}
            className={cn(
              'case-rarity-chip',
              option.className,
              active && 'case-rarity-chip--active',
            )}
            onClick={() => onChange(option.value)}
          >
            <span className="case-rarity-chip-swatch" aria-hidden />
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
