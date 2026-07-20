export const SPHERE_OPTIONS = [
  { value: 'central_apparatus', label: 'Центральный аппарат' },
  { value: 'justice', label: 'Министерство Юстиции' },
  { value: 'defense', label: 'Министерство Обороны' },
  { value: 'health', label: 'Министерство Здравоохранения' },
  { value: 'gov_structures', label: 'Государственные структуры' },
  { value: 'illegal_structures', label: 'Нелегальные структуры' },
  { value: 'server', label: 'Сервер' },
] as const

export type SphereKey = (typeof SPHERE_OPTIONS)[number]['value']

export const MINISTRY_SPHERE_KEYS: SphereKey[] = [
  'central_apparatus',
  'justice',
  'defense',
  'health',
]

export const STRUCTURE_SPHERE_KEYS: SphereKey[] = ['gov_structures', 'illegal_structures']

export const CURATOR_SPHERE_KEYS: SphereKey[] = ['server']

const LABEL_BY_KEY = Object.fromEntries(SPHERE_OPTIONS.map((o) => [o.value, o.label])) as Record<
  SphereKey,
  string
>

export function allowedSphereKeysForLevel(level: number): SphereKey[] {
  if (level >= 7) return [...CURATOR_SPHERE_KEYS]
  if (level >= 5) return [...STRUCTURE_SPHERE_KEYS]
  return [...MINISTRY_SPHERE_KEYS]
}

/** Сферы, которые актор может выдавать и снимать у других. */
export function effectiveGrantableSphereKeys(actorLevel: number, actorSpheres: string[]): string[] {
  const grantable = new Set(actorSpheres)
  if (actorLevel >= 7) {
    for (const key of CURATOR_SPHERE_KEYS) grantable.add(key)
  } else if (actorLevel >= 5) {
    for (const key of STRUCTURE_SPHERE_KEYS) grantable.add(key)
  }
  return [...grantable]
}

export function sphereOptionsForLevel(level: number) {
  const allowed = new Set(allowedSphereKeysForLevel(level))
  return SPHERE_OPTIONS.filter((o) => allowed.has(o.value))
}

export function filterSpheresForLevel(spheres: string[], level: number): string[] {
  const allowed = new Set(allowedSphereKeysForLevel(level))
  return spheres.filter((s) => allowed.has(s as SphereKey))
}

export function sphereFieldLabel(level: number): string {
  if (level >= 7) return 'Сервер'
  if (level >= 5) return 'Структуры'
  return 'Сферы'
}

export function sphereFieldHint(level: number): string {
  if (level >= 7) {
    return 'Для куратора и выше — только сервер, тег сферы в ник не добавляется.'
  }
  if (level >= 5) {
    return 'Можно выбрать несколько. «Государственные структуры» (Гос) перебивает остальные теги.'
  }
  return 'Можно выбрать несколько. «Центральный аппарат» даёт доступ к порталу.'
}

export function formatSpheresDisplay(spheres: string[] | undefined | null): string {
  if (!spheres?.length) return '—'
  return spheres.map((k) => LABEL_BY_KEY[k as SphereKey] ?? k).join(', ')
}

export function toggleSphere(spheres: string[], key: SphereKey): string[] {
  if (spheres.includes(key)) {
    return spheres.filter((s) => s !== key)
  }
  return [...spheres, key]
}
