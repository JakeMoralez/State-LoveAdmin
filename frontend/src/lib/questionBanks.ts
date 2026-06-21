import type { LucideIcon } from 'lucide-react'
import {
  Briefcase,
  ClipboardList,
  HelpCircle,
  Landmark,
  Library,
  Newspaper,
  Scale,
  ScrollText,
  Shield,
  Target,
} from 'lucide-react'

export const DEFAULT_BANK_ICON = 'library'

export const BANK_ICON_PRESETS: { id: string; icon: LucideIcon; label: string }[] = [
  { id: 'library', icon: Library, label: 'Библиотека' },
  { id: 'scroll', icon: ScrollText, label: 'Свод' },
  { id: 'scale', icon: Scale, label: 'Право' },
  { id: 'target', icon: Target, label: 'Цель' },
  { id: 'briefcase', icon: Briefcase, label: 'Дело' },
  { id: 'landmark', icon: Landmark, label: 'Государство' },
  { id: 'clipboard', icon: ClipboardList, label: 'Список' },
  { id: 'help', icon: HelpCircle, label: 'Вопросы' },
  { id: 'shield', icon: Shield, label: 'Защита' },
  { id: 'news', icon: Newspaper, label: 'Новости' },
]

const LEGACY_EMOJI_TO_ICON: Record<string, string> = {
  '📚': 'library',
  '📜': 'scroll',
  '⚖️': 'scale',
  '🎯': 'target',
  '💼': 'briefcase',
  '🏛️': 'landmark',
  '📋': 'clipboard',
  '❓': 'help',
  '🛡️': 'shield',
  '📰': 'news',
}

const ICON_BY_ID = Object.fromEntries(BANK_ICON_PRESETS.map((p) => [p.id, p.icon])) as Record<string, LucideIcon>

export function bankIconId(raw?: string | null): string {
  const trimmed = raw?.trim()
  if (!trimmed) return DEFAULT_BANK_ICON
  if (LEGACY_EMOJI_TO_ICON[trimmed]) return LEGACY_EMOJI_TO_ICON[trimmed]
  if (ICON_BY_ID[trimmed]) return trimmed
  return DEFAULT_BANK_ICON
}

export function bankIconDef(raw?: string | null) {
  const id = bankIconId(raw)
  return {
    id,
    icon: ICON_BY_ID[id] ?? Library,
    label: BANK_ICON_PRESETS.find((p) => p.id === id)?.label ?? 'Банк',
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
