export type BankIconCategory =
  | 'featured'
  | 'gov'
  | 'work'
  | 'edu'
  | 'people'
  | 'events'
  | 'security'
  | 'finance'
  | 'life'

export interface BankIconEntry {
  id: string
  lucide: string
  label: string
  category: BankIconCategory
  featured?: boolean
}

export const BANK_ICON_CATEGORIES: { id: BankIconCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'featured', label: 'Популярные' },
  { id: 'gov', label: 'Государство' },
  { id: 'work', label: 'Работа' },
  { id: 'edu', label: 'Обучение' },
  { id: 'people', label: 'Люди' },
  { id: 'events', label: 'События' },
  { id: 'security', label: 'Безопасность' },
  { id: 'finance', label: 'Финансы' },
  { id: 'life', label: 'Быт' },
]

export const BANK_ICON_CATALOG: BankIconEntry[] = [
  { id: 'library', lucide: 'library', label: 'Библиотека', category: 'featured', featured: true },
  { id: 'scroll', lucide: 'scroll-text', label: 'Свод', category: 'featured', featured: true },
  { id: 'scale', lucide: 'scale', label: 'Право', category: 'featured', featured: true },
  { id: 'target', lucide: 'target', label: 'Цель', category: 'featured', featured: true },
  { id: 'briefcase', lucide: 'briefcase', label: 'Дело', category: 'featured', featured: true },
  { id: 'landmark', lucide: 'landmark', label: 'Государство', category: 'featured', featured: true },
  { id: 'clipboard', lucide: 'clipboard-list', label: 'Список', category: 'featured', featured: true },
  { id: 'help', lucide: 'help-circle', label: 'Вопросы', category: 'featured', featured: true },
  { id: 'shield', lucide: 'shield', label: 'Защита', category: 'featured', featured: true },
  { id: 'news', lucide: 'newspaper', label: 'Новости', category: 'featured', featured: true },

  { id: 'gavel', lucide: 'gavel', label: 'Суд', category: 'gov' },
  { id: 'building-2', lucide: 'building-2', label: 'Здание', category: 'gov' },
  { id: 'castle', lucide: 'castle', label: 'Резиденция', category: 'gov' },
  { id: 'flag', lucide: 'flag', label: 'Флаг', category: 'gov' },
  { id: 'crown', lucide: 'crown', label: 'Власть', category: 'gov' },
  { id: 'vote', lucide: 'vote', label: 'Голосование', category: 'gov' },
  { id: 'hand-coins', lucide: 'hand-coins', label: 'Бюджет', category: 'gov' },
  { id: 'stamp', lucide: 'stamp', label: 'Указ', category: 'gov' },
  { id: 'file-badge', lucide: 'file-badge', label: 'Документ', category: 'gov' },
  { id: 'map-pin-house', lucide: 'map-pin-house', label: 'Регион', category: 'gov' },

  { id: 'folder-kanban', lucide: 'folder-kanban', label: 'Проекты', category: 'work' },
  { id: 'calendar-check', lucide: 'calendar-check', label: 'Дедлайн', category: 'work' },
  { id: 'presentation', lucide: 'presentation', label: 'Доклад', category: 'work' },
  { id: 'handshake', lucide: 'handshake', label: 'Соглашение', category: 'work' },
  { id: 'clipboard-check', lucide: 'clipboard-check', label: 'Проверка', category: 'work' },
  { id: 'list-checks', lucide: 'list-checks', label: 'Задачи', category: 'work' },
  { id: 'workflow', lucide: 'workflow', label: 'Процесс', category: 'work' },
  { id: 'building', lucide: 'building', label: 'Офис', category: 'work' },
  { id: 'hammer', lucide: 'hammer', label: 'Стройка', category: 'work' },
  { id: 'wrench', lucide: 'wrench', label: 'Ремонт', category: 'work' },

  { id: 'book-open', lucide: 'book-open', label: 'Учебник', category: 'edu' },
  { id: 'graduation-cap', lucide: 'graduation-cap', label: 'Экзамен', category: 'edu' },
  { id: 'microscope', lucide: 'microscope', label: 'Наука', category: 'edu' },
  { id: 'lightbulb', lucide: 'lightbulb', label: 'Идея', category: 'edu' },
  { id: 'brain', lucide: 'brain', label: 'Знания', category: 'edu' },
  { id: 'notebook-pen', lucide: 'notebook-pen', label: 'Конспект', category: 'edu' },
  { id: 'school', lucide: 'school', label: 'Школа', category: 'edu' },

  { id: 'users', lucide: 'users', label: 'Команда', category: 'people' },
  { id: 'heart-handshake', lucide: 'heart-handshake', label: 'Партнёрство', category: 'people' },
  { id: 'messages-square', lucide: 'messages-square', label: 'Общение', category: 'people' },
  { id: 'megaphone', lucide: 'megaphone', label: 'Объявление', category: 'people' },
  { id: 'user-check', lucide: 'user-check', label: 'Кандидат', category: 'people' },
  { id: 'speech', lucide: 'speech', label: 'Речь', category: 'people' },
  { id: 'user-round-cog', lucide: 'user-round-cog', label: 'Кадры', category: 'people' },
  { id: 'contact', lucide: 'contact', label: 'Контакт', category: 'people' },

  { id: 'calendar-days', lucide: 'calendar-days', label: 'Календарь', category: 'events' },
  { id: 'party-popper', lucide: 'party-popper', label: 'Праздник', category: 'events' },
  { id: 'trophy', lucide: 'trophy', label: 'Победа', category: 'events' },
  { id: 'medal', lucide: 'medal', label: 'Награда', category: 'events' },
  { id: 'star', lucide: 'star', label: 'Звезда', category: 'events' },
  { id: 'sparkles', lucide: 'sparkles', label: 'Торжество', category: 'events' },
  { id: 'cake', lucide: 'cake', label: 'Юбилей', category: 'events' },
  { id: 'bell-ring', lucide: 'bell-ring', label: 'Созыв', category: 'events' },

  { id: 'shield-alert', lucide: 'shield-alert', label: 'Тревога', category: 'security' },
  { id: 'siren', lucide: 'siren', label: 'ЧП', category: 'security' },
  { id: 'lock', lucide: 'lock', label: 'Доступ', category: 'security' },
  { id: 'eye', lucide: 'eye', label: 'Наблюдение', category: 'security' },
  { id: 'badge-check', lucide: 'badge-check', label: 'Верификация', category: 'security' },
  { id: 'shield-ban', lucide: 'shield-ban', label: 'Запрет', category: 'security' },

  { id: 'wallet', lucide: 'wallet', label: 'Кошелёк', category: 'finance' },
  { id: 'banknote', lucide: 'banknote', label: 'Выплата', category: 'finance' },
  { id: 'piggy-bank', lucide: 'piggy-bank', label: 'Накопления', category: 'finance' },
  { id: 'chart-line', lucide: 'chart-line', label: 'Отчёт', category: 'finance' },
  { id: 'coins', lucide: 'coins', label: 'Монеты', category: 'finance' },
  { id: 'receipt', lucide: 'receipt', label: 'Чек', category: 'finance' },

  { id: 'flame', lucide: 'flame', label: 'Срочно', category: 'life' },
  { id: 'zap', lucide: 'zap', label: 'Энергия', category: 'life' },
  { id: 'coffee', lucide: 'coffee', label: 'Пауза', category: 'life' },
  { id: 'gift', lucide: 'gift', label: 'Подарок', category: 'life' },
  { id: 'camera', lucide: 'camera', label: 'Фото', category: 'life' },
  { id: 'music', lucide: 'music', label: 'Музыка', category: 'life' },
  { id: 'gamepad-2', lucide: 'gamepad-2', label: 'Игра', category: 'life' },
  { id: 'car', lucide: 'car', label: 'Авто', category: 'life' },
  { id: 'plane', lucide: 'plane', label: 'Перелёт', category: 'life' },
  { id: 'train', lucide: 'train', label: 'Поезд', category: 'life' },
  { id: 'ship', lucide: 'ship', label: 'Флот', category: 'life' },
  { id: 'map-pin', lucide: 'map-pin', label: 'Локация', category: 'life' },
  { id: 'home', lucide: 'home', label: 'Дом', category: 'life' },
  { id: 'tree-pine', lucide: 'tree-pine', label: 'Природа', category: 'life' },
  { id: 'sun', lucide: 'sun', label: 'День', category: 'life' },
  { id: 'moon', lucide: 'moon', label: 'Ночь', category: 'life' },
  { id: 'cloud-rain', lucide: 'cloud-rain', label: 'Погода', category: 'life' },
  { id: 'utensils', lucide: 'utensils', label: 'Кухня', category: 'life' },
  { id: 'heart', lucide: 'heart', label: 'Забота', category: 'life' },
  { id: 'stethoscope', lucide: 'stethoscope', label: 'Медицина', category: 'life' },
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

const ICON_BY_ID = Object.fromEntries(BANK_ICON_CATALOG.map((entry) => [entry.id, entry])) as Record<
  string,
  BankIconEntry
>

export const DEFAULT_BANK_ICON = 'library'

export function bankIconEntry(raw?: string | null): BankIconEntry {
  const id = bankIconId(raw)
  return ICON_BY_ID[id] ?? ICON_BY_ID[DEFAULT_BANK_ICON]
}

export function bankIconId(raw?: string | null): string {
  const trimmed = raw?.trim()
  if (!trimmed) return DEFAULT_BANK_ICON
  if (LEGACY_EMOJI_TO_ICON[trimmed]) return LEGACY_EMOJI_TO_ICON[trimmed]
  if (ICON_BY_ID[trimmed]) return trimmed
  if (ICON_BY_ID[trimmed.replace(/_/g, '-')]) return trimmed.replace(/_/g, '-')
  return DEFAULT_BANK_ICON
}

export function bankIconLabel(raw?: string | null): string {
  return bankIconEntry(raw).label
}

export function bankIconLucide(raw?: string | null): string {
  return bankIconEntry(raw).lucide
}
