import {
  BANK_ICON_CATALOG,
  bankIconEntry,
  bankIconId,
  bankIconLabel,
  bankIconLucide,
  DEFAULT_BANK_ICON,
} from './bankIconCatalog'

export { BANK_ICON_CATALOG, DEFAULT_BANK_ICON, bankIconId, bankIconLabel, bankIconLucide }

/** @deprecated use BANK_ICON_CATALOG — subset kept for compatibility */
export const BANK_ICON_PRESETS = BANK_ICON_CATALOG.filter((entry) => entry.featured)

export function bankIconDef(raw?: string | null) {
  const entry = bankIconEntry(raw)
  return {
    id: entry.id,
    lucide: entry.lucide,
    label: entry.label,
  }
}

/** @deprecated use bankIconId — kept for API field name `emoji` storing icon id */
export function bankEmoji(emoji?: string | null): string {
  return bankIconId(emoji)
}

export function bankCountLabel(count: number): string {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod100 >= 11 && mod100 <= 14) return `${count} банков`
  if (mod10 === 1) return `${count} банк`
  if (mod10 >= 2 && mod10 <= 4) return `${count} банка`
  return `${count} банков`
}
