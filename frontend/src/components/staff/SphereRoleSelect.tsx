import { Select } from '../ui/Select'
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
  title,
  on,
  disabled,
  onClick,
}: {
  label: string
  title: string
  on: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cn('sphere-role-chip', on && 'sphere-role-chip--on')}
      aria-pressed={on}
      aria-label={title}
      title={title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
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
  const primaryChip =
    accessLevel <= 2
      ? { label: 'Следящий', title: 'Следящий' }
      : { label: 'Должность', title: 'Должность по сфере' }
  const extraChip =
    accessLevel <= 2
      ? { label: 'Старший', title: 'Старший следящий' }
      : { label: 'Дополнительно следит', title: 'Дополнительные обязанности следящего' }

  const canToggle = (key: string) => {
    if (disabled) return false
    if (locked.includes(key)) return false
    if (grantable && !grantable.includes(key)) return false
    return true
  }

  const togglePrimary = (key: SphereKey) => {
    const nextSpheres = withLocked(toggleSphere(spheres, key), locked)
    const nextSenior = nextSpheres.includes(key)
      ? seniorSpheres
      : seniorSpheres.filter((item) => item !== key)
    onChange(emit(nextSpheres, nextSenior))
  }

  const toggleExtra = (key: SphereKey) => {
    const nextSenior = toggleSphere(seniorSpheres, key)
    const nextSpheres = accessLevel === 2 && nextSenior.includes(key) && !spheres.includes(key)
      ? withLocked([...spheres, key], locked)
      : withLocked(spheres, locked)
    onChange(emit(nextSpheres, nextSenior))
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
    const activateRow = () => {
      if (toggleDisabled) return
      if (chips.primary) togglePrimary(key)
      else if (chips.extra) toggleExtra(key)
    }
    if (accessLevel === 2) {
      const state = extraOn ? 'senior' : primaryOn ? 'ordinary' : 'none'
      return <div key={key} className={cn('sphere-role-row', rowOn && 'sphere-role-row--on')}>
        <span className="sphere-role-name">{opt.label}</span>
        <Select className="sphere-assignment-select" aria-label={`Назначение: ${opt.label}`} value={state} disabled={toggleDisabled}
          options={[{value:'none',label:'Не назначен'},{value:'ordinary',label:'Следящий'},{value:'senior',label:'Старший следящий'}]}
          onChange={(value) => {
            const next = value === 'none' ? spheres.filter(s => s !== key) : [...new Set([...spheres, key])]
            const seniors = value === 'senior' ? [...new Set([...seniorSpheres, key])] : seniorSpheres.filter(s => s !== key)
            onChange(emit(withLocked(next, locked), seniors))
          }} />
      </div>
    }
    return (
      <div
        key={opt.value}
        className={cn(
          'sphere-role-row',
          rowOn && 'sphere-role-row--on',
          toggleDisabled && 'sphere-role-row--disabled',
        )}
        onClick={activateRow}
      >
        <span className="sphere-role-name">{opt.label}</span>
        <span className="sphere-role-chips">
          {chips.primary ? (
            <RoleChip
              label={primaryChip.label}
              title={primaryChip.title}
              on={primaryOn}
              disabled={toggleDisabled}
              onClick={() => togglePrimary(key)}
            />
          ) : null}
          {chips.extra ? (
            <RoleChip
              label={extraChip.label}
              title={extraChip.title}
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
      <p className="staff-profile-hint m-0 mt-2">{accessLevel === 2
        ? 'Полномочия старшего действуют только в выбранной сфере. Ограничения по уровню доступа сохраняются.'
        : 'Дополнительные обязанности выбираются отдельно от основной должности и не означают старшинство.'}</p>
      {locked.length > 0 && (
        <p className="staff-profile-hint m-0 mt-2">Серые сферы можно менять только у руководства выше вас.</p>
      )}
    </div>
  )
}
