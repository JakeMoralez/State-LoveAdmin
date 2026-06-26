export interface LawFormatColors {
  chapter: string
  section: string
  article: string
  part: string
  listItem: string
  punishment: string
  note: string
}

export interface LawFormatBold {
  section: boolean
  chapter: boolean
  article: boolean
  part: boolean
  listItem: boolean
  punishment: boolean
  note: boolean
  exception: boolean
}

export interface LawFormatSizes {
  title: number
  tocTitle: number
  chapter: number
}

export interface LawFormatHeader {
  enabled: boolean
  imageUrl: string
  imageWidth: string
  title: string
  subtitle: string
}

export interface LawFormatOptions {
  font: string
  colors: LawFormatColors
  sizes: LawFormatSizes
  header: LawFormatHeader
  generateToc: boolean
  skipInputToc: boolean
  chapterTitleUppercase: boolean
  articleStyle: 'split' | 'full'
  bold: LawFormatBold
  hrBeforeChapter: boolean
}

export interface LawFormatPreset {
  id: string
  name: string
  description: string
  options: LawFormatOptions
}

export type LawLineKind =
  | 'blank'
  | 'toc_marker'
  | 'section'
  | 'chapter'
  | 'article'
  | 'part'
  | 'list'
  | 'bullet'
  | 'numbered'
  | 'punishment'
  | 'note'
  | 'exception'
  | 'dash'
  | 'indent'
  | 'plain'

export interface ParsedLawLine {
  kind: LawLineKind
  raw: string
  sectionNum?: number
  sectionTitle?: string
  chapterNum?: number
  chapterTitle?: string
  articleNum?: number
  articleRest?: string
  hasParts?: boolean
  partNum?: number
  partRest?: string
  listLetter?: string
  listRest?: string
  bulletRest?: string
  numberedNum?: number
  numberedRest?: string
  punishmentRest?: string
  noteLabel?: string
  noteRest?: string
  exceptionLabel?: string
  exceptionRest?: string
  dashRest?: string
  indentLevel?: 1 | 2
}

export interface TocChapter {
  num: number
  title: string
}

export interface TocSection {
  num: number
  title: string
  chapters: TocChapter[]
}

export interface FormatLawResult {
  bbcode: string
  chapters: TocChapter[]
  stats: {
    lines: number
    sections: number
    chapters: number
    articles: number
    parts: number
    listItems: number
    punishments: number
    notes: number
    exceptions: number
  }
}
