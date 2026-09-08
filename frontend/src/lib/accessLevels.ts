import type { SelectOption } from '../components/ui/Select'

/** Краткие названия (как в боте / AccessLevel.NAMES). */
export const ACCESS_LEVEL_SHORT: Record<number, string> = {
  1: 'ПГС',
  2: 'Следящий',
  3: 'ЗГС',
  4: 'ГС',
  5: 'Следящий структуры',
  6: 'ЗГС ГОС',
  7: 'ГС ГОС',
  8: 'Куратор',
  9: 'ЗГА',
  10: 'ГА',
  11: 'Разработчик',
}

/** Полные названия ролей (колонка «Доступ» в реестре). */
export const ACCESS_ROLE_TITLES: Record<number, string> = {
  1: 'Помощник следящих',
  2: 'Следящий',
  3: 'Зам. Главного следящего сферы',
  4: 'Главный следящий сферы',
  5: 'Следящий структуры',
  6: 'Зам. Главного следящего структуры',
  7: 'Главный следящий структуры',
  8: 'Куратор',
  9: 'Зам. Главного Администратора',
  10: 'Главный Администратор',
  11: 'Разработчик',
}

export function accessLevelShort(level: number): string {
  return ACCESS_LEVEL_SHORT[level] ?? `Уровень ${level}`
}

export function accessRoleTitle(level: number): string {
  return ACCESS_ROLE_TITLES[level] ?? accessLevelShort(level)
}

/** Все уровни доступа — подписи как в колонке «Доступ» реестра. */
export const ACCESS_LEVEL_OPTIONS: SelectOption[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(
  (level) => ({
    value: String(level),
    label: `${level} · ${accessRoleTitle(level)}`,
  }),
)

export function mergeAccessLevelOptions(
  _fromApi?: { value: number; label: string }[],
): SelectOption[] {
  return ACCESS_LEVEL_OPTIONS
}

/**
 * Все уровни 1–11 всегда в списке.
 * Выше лимита выдачи — disabled (видно, но не выбрать).
 * Разработчик / owner / ур.≥10 (миграция со старой шкалы) — всё доступно.
 */
export function grantableAccessLevelOptions(
  actorLevel: number,
  opts?: { isDeveloper?: boolean; allowEqual?: boolean },
): SelectOption[] {
  const isDev =
    Boolean(opts?.isDeveloper) || actorLevel >= 11 || actorLevel >= 10
  let max: number
  if (isDev) {
    max = 11
  } else if (opts?.allowEqual) {
    max = Math.min(Math.max(0, actorLevel), 11)
  } else {
    max = Math.min(Math.max(0, actorLevel - 1), 11)
  }
  return ACCESS_LEVEL_OPTIONS.map((opt) => ({
    ...opt,
    disabled: parseInt(opt.value, 10) > max,
  }))
}

/** Назначение нового следящего (/assign staff, /reg) — Следящий структуры (5)+. */
export const ASSIGN_STAFF_MIN_LEVEL = 5
export const LEADER_REGISTRY_MANAGE_MIN_LEVEL = 2

export function canEditLeadershipRegistry(
  actorLevel: number,
  actorVkId: number,
  targetVkId: number,
): boolean {
  if (actorLevel >= 11) return true
  return actorLevel >= LEADER_REGISTRY_MANAGE_MIN_LEVEL && actorVkId !== targetVkId
}

export function canRemoveFromLeadershipRegistry(
  actorLevel: number,
  actorVkId: number,
  targetVkId: number,
): boolean {
  if (actorVkId === targetVkId) return false
  return actorLevel >= LEADER_REGISTRY_MANAGE_MIN_LEVEL || actorLevel >= 11
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
