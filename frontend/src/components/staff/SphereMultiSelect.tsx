import {
  filterSpheresForLevel,
  sphereFieldHint,
  sphereFieldLabel,
  sphereOptionsForLevel,
  toggleSphere,
  type SphereKey,
} from '../../lib/spheres'
import { cn } from '../../lib/utils'

export function SphereMultiSelect({
  value,
  onChange,
  disabled,
  accessLevel,
  showHint = true,
}: {
  value: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
  accessLevel: number
  showHint?: boolean
}) {
  const options = sphereOptionsForLevel(accessLevel)
  const hint = sphereFieldHint(accessLevel)

  return (
    <div className="sphere-multi-select">
      <div className="sphere-multi-select-grid">
        {options.map((opt) => {
          const on = value.includes(opt.value)
          return (
            <label
              key={opt.value}
              className={cn(
                'sphere-multi-select-item',
                on && 'sphere-multi-select-item--on',
                disabled && 'sphere-multi-select-item--disabled',
              )}
            >
              <input
                type="checkbox"
                className="ui-checkbox"
                checked={on}
                disabled={disabled}
                onChange={() => onChange(toggleSphere(value, opt.value as SphereKey))}
              />
              <span className="ui-checkbox-box sphere-multi-select-box" aria-hidden />
              <span className="sphere-multi-select-label">{opt.label}</span>
            </label>
          )
        })}
      </div>
      {showHint && <p className="staff-profile-hint">{hint}</p>}
    </div>
  )
}

export { filterSpheresForLevel, sphereFieldLabel }
