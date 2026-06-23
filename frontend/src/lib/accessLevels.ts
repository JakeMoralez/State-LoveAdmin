import type { SelectOption } from '../components/ui/Select'

/** Краткие названия (как в боте / AccessLevel.NAMES). */
export const ACCESS_LEVEL_SHORT: Record<number, string> = {
  1: 'ПГС',
  2: 'Следящий',
  3: 'ЗГС',
  4: 'ГС',
  5: 'ЗГС ГОС',
  6: 'ГС ГОС',
  7: 'Куратор',
  8: 'ЗГА',
  9: 'ГА',
  10: 'Разработчик',
}

/** Полные названия ролей (колонка «Доступ» в реестре). */
export const ACCESS_ROLE_TITLES: Record<number, string> = {
  1: 'Помощник Главного Следящего',
  2: 'Следящий',
  3: 'Зам. Главного следящего сферы',
  4: 'Главный следящий сферы',
  5: 'Зам. Главного следящего структуры',
  6: 'Главный следящий структуры',
  7: 'Куратор',
  8: 'Зам. Главного Администратора',
  9: 'Главный Администратор',
  10: 'Разработчик',
}

export function accessLevelShort(level: number): string {
  return ACCESS_LEVEL_SHORT[level] ?? `Уровень ${level}`
}

export function accessRoleTitle(level: number): string {
  return ACCESS_ROLE_TITLES[level] ?? accessLevelShort(level)
}

/** Все уровни доступа — подписи как в колонке «Доступ» реестра. */
export const ACCESS_LEVEL_OPTIONS: SelectOption[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(
  (level) => ({
    value: String(level),
    label: accessRoleTitle(level),
  }),
)

export function mergeAccessLevelOptions(
  _fromApi?: { value: number; label: string }[],
): SelectOption[] {
  return ACCESS_LEVEL_OPTIONS
}

/** Назначение и правка реестра «Руководство» — Следящий (2+), не свой профиль; разработчик — любые. */
export const LEADER_REGISTRY_MANAGE_MIN_LEVEL = 2

export function canEditLeadershipRegistry(
  actorLevel: number,
  actorVkId: number,
  targetVkId: number,
): boolean {
  if (actorLevel >= 10) return true
  return actorLevel >= LEADER_REGISTRY_MANAGE_MIN_LEVEL && actorVkId !== targetVkId
}

export function canRemoveFromLeadershipRegistry(
  actorLevel: number,
  actorVkId: number,
  targetVkId: number,
): boolean {
  if (actorVkId === targetVkId) return false
  return actorLevel >= LEADER_REGISTRY_MANAGE_MIN_LEVEL || actorLevel >= 10
}

export function canOpenLeaderSettings(
  actorLevel: number,
  actorVkId: number,
  targetVkId: number,
): boolean {
  if (actorVkId === targetVkId) return true
  return canEditLeadershipRegistry(actorLevel, actorVkId, targetVkId)
}

/** @deprecated use canEditLeadershipRegistry */
export function canManageLeadershipRegistry(
  actorLevel: number,
  actorVkId: number,
  targetVkId: number,
): boolean {
  return canEditLeadershipRegistry(actorLevel, actorVkId, targetVkId)
}
