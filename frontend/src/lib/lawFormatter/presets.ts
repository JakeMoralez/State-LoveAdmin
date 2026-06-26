import type { LawFormatBold, LawFormatOptions, LawFormatPreset } from './types'

export const DEFAULT_LAW_FORMAT_BOLD: LawFormatBold = {
  section: true,
  chapter: true,
  article: true,
  part: false,
  listItem: false,
  punishment: true,
  note: true,
  exception: true,
}

export const DEFAULT_LAW_FORMAT_OPTIONS: LawFormatOptions = {
  font: 'verdana',
  colors: {
    chapter: 'rgb(184, 49, 47)',
    section: 'rgb(184, 49, 47)',
    article: 'rgb(184, 49, 47)',
    part: 'rgb(184, 49, 47)',
    listItem: 'rgb(209, 72, 65)',
    punishment: 'rgb(230, 126, 34)',
    note: 'rgb(127, 140, 141)',
  },
  sizes: {
    title: 6,
    tocTitle: 5,
    chapter: 5,
  },
  header: {
    enabled: true,
    imageUrl: 'https://i.imgur.com/ud5mcqy.png',
    imageWidth: '300px',
    title: 'ПРОЦЕССУАЛЬНЫЙ КОДЕКС ШТАТА ЛАВ',
    subtitle: '',
  },
  generateToc: true,
  skipInputToc: true,
  chapterTitleUppercase: true,
  articleStyle: 'split',
  bold: { ...DEFAULT_LAW_FORMAT_BOLD },
  hrBeforeChapter: true,
}

export const LAW_FORMAT_PRESETS: LawFormatPreset[] = [
  {
    id: 'pksh-love',
    name: 'ПКШ / кодекс (стандарт)',
    description: 'Красные заголовки, Verdana, оглавление и шапка с логотипом',
    options: { ...DEFAULT_LAW_FORMAT_OPTIONS },
  },
  {
    id: 'gos-code',
    name: 'Кодекс гос. структур',
    description: 'С разделами и подзаголовком документа',
    options: {
      ...DEFAULT_LAW_FORMAT_OPTIONS,
      header: {
        ...DEFAULT_LAW_FORMAT_OPTIONS.header,
        title: 'ПРОЦЕССУАЛЬНЫЙ КОДЕКС ШТАТА ЛАВ',
        subtitle: 'КОДЕКС ГОСУДАРСТВЕННЫХ СТРУКТУР ШТАТА ЛАВ',
      },
    },
  },
  {
    id: 'pksh-no-header',
    name: 'Кодекс без шапки',
    description: 'Только оглавление и тело, без картинки и титула',
    options: {
      ...DEFAULT_LAW_FORMAT_OPTIONS,
      header: { ...DEFAULT_LAW_FORMAT_OPTIONS.header, enabled: false },
    },
  },
  {
    id: 'minimal',
    name: 'Минимальный',
    description: 'Без шапки и оглавления, только разметка статей',
    options: {
      ...DEFAULT_LAW_FORMAT_OPTIONS,
      header: { ...DEFAULT_LAW_FORMAT_OPTIONS.header, enabled: false },
      generateToc: false,
    },
  },
]

export const LAW_FORMAT_STORAGE_KEY = 'forum-law-format-options-v3'

export type LawFormatSavedState = {
  presetId: string
  options: LawFormatOptions
}

function readStorageRaw(): string | null {
  return (
    localStorage.getItem(LAW_FORMAT_STORAGE_KEY) ??
    localStorage.getItem('forum-law-format-options-v2') ??
    localStorage.getItem('forum-law-format-options-v1')
  )
}

export function loadSavedLawFormat(): LawFormatSavedState | null {
  try {
    const raw = readStorageRaw()
    if (!raw) return null
    const parsed = JSON.parse(raw) as
      | (LawFormatOptions & { boldLabels?: boolean })
      | { presetId?: string; options?: LawFormatOptions & { boldLabels?: boolean } }

    if (parsed && typeof parsed === 'object' && 'options' in parsed && parsed.options) {
      const presetId =
        typeof parsed.presetId === 'string' &&
        LAW_FORMAT_PRESETS.some((preset) => preset.id === parsed.presetId)
          ? parsed.presetId
          : LAW_FORMAT_PRESETS[0].id
      return { presetId, options: normalizeOptions(parsed.options) }
    }

    return {
      presetId: LAW_FORMAT_PRESETS[0].id,
      options: normalizeOptions(parsed as LawFormatOptions & { boldLabels?: boolean }),
    }
  } catch {
    return null
  }
}

export function loadSavedOptions(): LawFormatOptions | null {
  return loadSavedLawFormat()?.options ?? null
}

function normalizeBold(parsed: LawFormatOptions & { boldLabels?: boolean }): LawFormatBold {
  if (parsed.bold) return { ...DEFAULT_LAW_FORMAT_BOLD, ...parsed.bold }
  const all = parsed.boldLabels ?? true
  return {
    section: all,
    chapter: all,
    article: all,
    part: all,
    listItem: all,
    punishment: all,
    note: all,
    exception: all,
  }
}

function normalizeOptions(parsed: LawFormatOptions & { boldLabels?: boolean }): LawFormatOptions {
  return {
    ...DEFAULT_LAW_FORMAT_OPTIONS,
    ...parsed,
    colors: { ...DEFAULT_LAW_FORMAT_OPTIONS.colors, ...parsed.colors },
    header: {
      ...DEFAULT_LAW_FORMAT_OPTIONS.header,
      ...parsed.header,
      subtitle: parsed.header.subtitle ?? '',
    },
    bold: normalizeBold(parsed),
    hrBeforeChapter: parsed.hrBeforeChapter ?? true,
  }
}

export function saveLawFormat(presetId: string, options: LawFormatOptions): void {
  const payload: LawFormatSavedState = { presetId, options }
  localStorage.setItem(LAW_FORMAT_STORAGE_KEY, JSON.stringify(payload))
}

export function saveOptions(options: LawFormatOptions): void {
  saveLawFormat(LAW_FORMAT_PRESETS[0].id, options)
}
