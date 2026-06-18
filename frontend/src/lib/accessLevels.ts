import type { SelectOption } from '../components/ui/Select'

/** Все уровни доступа — не зависят от ответа API (dev-вход всегда полный). */
export const ACCESS_LEVEL_OPTIONS: SelectOption[] = [
  { value: '1', label: 'ПГС' },
  { value: '2', label: 'Следящий' },
  { value: '3', label: 'ЗГС' },
  { value: '4', label: 'ГС' },
  { value: '5', label: 'ЗГС ГОС' },
  { value: '6', label: 'ГС ГОС' },
  { value: '7', label: 'Куратор' },
  { value: '8', label: 'ЗГА' },
  { value: '9', label: 'ГА' },
  { value: '10', label: 'Разработчик' },
]

export function mergeAccessLevelOptions(
  fromApi?: { value: number; label: string }[],
): SelectOption[] {
  if (!fromApi?.length) return ACCESS_LEVEL_OPTIONS
  const byValue = new Map(fromApi.map((l) => [String(l.value), l.label]))
  return ACCESS_LEVEL_OPTIONS.map((opt) => ({
    value: opt.value,
    label: byValue.get(opt.value) ?? opt.label,
  }))
}
