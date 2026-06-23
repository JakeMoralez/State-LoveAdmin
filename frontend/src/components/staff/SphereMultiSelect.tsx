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
  lockedSpheres,
  grantableSpheres,
}: {
  value: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
  accessLevel: number
  showHint?: boolean
  lockedSpheres?: string[]
  grantableSpheres?: string[]
}) {
  const options = sphereOptionsForLevel(accessLevel)
  const hint = sphereFieldHint(accessLevel)
  const locked = lockedSpheres ?? []
  const grantable = grantableSpheres

  const applyToggle = (key: SphereKey) => {
    let next = toggleSphere(value, key)
    for (const sphereId of locked) {
      if (!next.includes(sphereId)) next = [...next, sphereId]
    }
    onChange(next)
  }

  const canToggle = (key: string) => {
    if (disabled) return false
    if (locked.includes(key)) return false
    if (grantable && grantable.length > 0 && !grantable.includes(key)) return false
    return true
  }

  return (
    <div className="sphere-multi-select">
      <div className="sphere-multi-select-grid">
        {options.map((opt) => {
          const on = value.includes(opt.value)
          const toggleDisabled = !canToggle(opt.value)
          return (
            <label
              key={opt.value}
              className={cn(
                'sphere-multi-select-item',
                on && 'sphere-multi-select-item--on',
                toggleDisabled && 'sphere-multi-select-item--disabled',
                locked.includes(opt.value) && 'sphere-multi-select-item--locked',
              )}
            >
              <input
                type="checkbox"
                className="ui-checkbox"
                checked={on}
                disabled={toggleDisabled}
                onChange={() => applyToggle(opt.value as SphereKey)}
              />
              <span className="ui-checkbox-box sphere-multi-select-box" aria-hidden />
              <span className="sphere-multi-select-label">{opt.label}</span>
            </label>
          )
        })}
      </div>
      {locked.length > 0 && (
        <p className="staff-profile-hint m-0 mt-2">Серые сферы можно менять только у руководства выше вас.</p>
      )}
      {showHint && <p className="staff-profile-hint">{hint}</p>}
    </div>
  )
}

export { filterSpheresForLevel, sphereFieldLabel }
