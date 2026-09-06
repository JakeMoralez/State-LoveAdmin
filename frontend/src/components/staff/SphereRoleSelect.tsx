import {
  sphereOptionsForLevel,
  toggleSphere,
  type SphereKey,
} from '../../lib/spheres'
import { cn } from '../../lib/utils'

export function usesSphereRoles(accessLevel: number): boolean {
  return accessLevel >= 2 && accessLevel < 8
}

type SphereRoleChange = {
  spheres: string[]
  seniorSpheres: string[]
  isSenior: boolean
}

function emit(spheres: string[], seniorSpheres: string[]): SphereRoleChange {
  return { spheres, seniorSpheres, isSenior: seniorSpheres.length > 0 }
}

function withLocked(next: string[], locked: string[]): string[] {
  let value = next
  for (const sphereId of locked) {
    if (!value.includes(sphereId)) value = [...value, sphereId]
  }
  return value
}

function RoleChip({
  label,
  on,
  disabled,
  onClick,
}: {
  label: string
  on: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cn('sphere-role-chip', on && 'sphere-role-chip--on')}
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

export function SphereRoleSelect({
  spheres,
  seniorSpheres,
  onChange,
  disabled,
  accessLevel,
  lockedSpheres,
  grantableSpheres,
}: {
  spheres: string[]
  seniorSpheres: string[]
  onChange: (next: SphereRoleChange) => void
  disabled?: boolean
  accessLevel: number
  lockedSpheres?: string[]
  grantableSpheres?: string[]
}) {
  const locked = lockedSpheres ?? []
  const grantable = grantableSpheres
  const splitLists = accessLevel >= 5
  const primaryOptions = sphereOptionsForLevel(accessLevel)
  const extraOptions = splitLists ? sphereOptionsForLevel(2) : primaryOptions
  const primaryChip = accessLevel <= 2 ? 'След.' : 'Должность'
  const extraChip = accessLevel <= 2 ? 'Ст. След.' : 'След.'

  const canToggle = (key: string) => {
    if (disabled) return false
    if (locked.includes(key)) return false
    if (grantable && grantable.length > 0 && !grantable.includes(key)) return false
    return true
  }

  const togglePrimary = (key: SphereKey) => {
    onChange(emit(withLocked(toggleSphere(spheres, key), locked), seniorSpheres))
  }

  const toggleExtra = (key: SphereKey) => {
    onChange(emit(spheres, toggleSphere(seniorSpheres, key)))
  }

  const renderRow = (
    opt: { value: string; label: string },
    chips: { primary?: boolean; extra?: boolean },
  ) => {
    const key = opt.value as SphereKey
    const primaryOn = chips.primary ? spheres.includes(key) : false
    const extraOn = chips.extra ? seniorSpheres.includes(key) : false
    const rowOn = primaryOn || extraOn
    const toggleDisabled = !canToggle(key)
    return (
      <div
        key={opt.value}
        className={cn(
          'sphere-role-row',
          rowOn && 'sphere-role-row--on',
          toggleDisabled && 'sphere-role-row--disabled',
        )}
      >
        <span className="sphere-role-name">{opt.label}</span>
        <span className="sphere-role-chips">
          {chips.primary ? (
            <RoleChip
              label={primaryChip}
              on={primaryOn}
              disabled={toggleDisabled}
              onClick={() => togglePrimary(key)}
            />
          ) : null}
          {chips.extra ? (
            <RoleChip
              label={extraChip}
              on={extraOn}
              disabled={toggleDisabled}
              onClick={() => toggleExtra(key)}
            />
          ) : null}
        </span>
      </div>
    )
  }

  return (
    <div className="sphere-role-select">
      {splitLists ? (
        <>
          <div className="sphere-role-list">{primaryOptions.map((opt) => renderRow(opt, { primary: true }))}</div>
          <div className="sphere-role-list">{extraOptions.map((opt) => renderRow(opt, { extra: true }))}</div>
        </>
      ) : (
        <div className="sphere-role-list">
          {primaryOptions.map((opt) => renderRow(opt, { primary: true, extra: true }))}
        </div>
      )}
      {locked.length > 0 && (
        <p className="staff-profile-hint m-0 mt-2">Серые сферы можно менять только у руководства выше вас.</p>
      )}
    </div>
  )
}
