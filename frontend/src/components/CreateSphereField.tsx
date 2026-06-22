import type { WorkSphere } from '../api'
import { FormField } from './ui/FormField'
import { Select } from './ui/Select'

export function createSphereOptions(spheres: WorkSphere[], allowedIds: string[]) {
  const ids = allowedIds.length > 0 ? allowedIds : spheres.map((s) => s.id)
  return ids.map((id) => ({
    value: id,
    label: spheres.find((s) => s.id === id)?.label ?? id,
  }))
}

export function pickDefaultCreateSphere(allowedIds: string[], fallback?: string) {
  if (fallback && allowedIds.includes(fallback)) return fallback
  return allowedIds[0] ?? ''
}

interface CreateSphereFieldProps {
  spheres: WorkSphere[]
  allowedIds: string[]
  value: string
  onChange: (id: string) => void
}

/** Выбор целевой сферы при создании (если доступно больше одной). */
export function CreateSphereField({ spheres, allowedIds, value, onChange }: CreateSphereFieldProps) {
  const options = createSphereOptions(spheres, allowedIds)
  if (options.length <= 1) return null

  return (
    <FormField label="Сфера" hint="В какую сферу создать">
      <Select value={value} onChange={onChange} options={options} />
    </FormField>
  )
}
