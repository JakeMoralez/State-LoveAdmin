export { formatLawText } from './format'
export {
  DEFAULT_LAW_FORMAT_OPTIONS,
  LAW_FORMAT_PRESETS,
  LAW_FORMAT_STORAGE_KEY,
  loadSavedLawFormat,
  loadSavedOptions,
  saveLawFormat,
  saveOptions,
} from './presets'
export type { LawFormatSavedState } from './presets'
export type {
  FormatLawResult,
  LawFormatBold,
  LawFormatColors,
  LawFormatHeader,
  LawFormatOptions,
  LawFormatPreset,
  LawFormatSizes,
  LawLineKind,
  ParsedLawLine,
  TocChapter,
  TocSection,
} from './types'
